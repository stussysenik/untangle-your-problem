import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import UnoCSS from 'unocss/vite';
import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Dev middleware: proxies /api/untangle and /api/status to a local Temporal server.
 * Mirrors the production Vercel functions in api/*.ts.
 */
function temporalDevPlugin(temporalAddress: string, nimKey: string) {
  const SYSTEM_PROMPT = `You are a master delegator and executive assistant.
Parse the user's brain dump and return a JSON object with exactly this structure:

{
  "items": [
    {
      "dishName": "3-5 encouraging words",
      "quantity": "specific count e.g. '2 x emails' or '1 x call'",
      "sourceTrigger": "EXACT verbatim substring from the input text",
      "expertAdvice": "a short actionable tip from someone who has done this before"
    }
  ],
  "signals": {
    "mood": "one of: anxious, overwhelmed, motivated, neutral",
    "energy": "one of: low, medium, high",
    "domain": "one of: work, personal, mixed",
    "language": "ISO 639-1 code of the input language, e.g. en"
  }
}

Rules:
- Extract 3-7 items. Each item must map to a distinct, concrete task.
- sourceTrigger must be an EXACT copy of a substring from the input. Do not paraphrase.
- Keep dishName encouraging and concise (3-5 words).
- quantity must be specific (number + unit).
- Return ONLY the JSON object above. No markdown, no extra text.`;

  // In-memory workflow registry: workflowId → status
  type WorkflowEntry = {
    text: string;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    result?: unknown;
    error?: string;
    events: Array<{ eventId: number; eventType: string; eventTime: string; detail?: string }>;
    startTime: number;
  };

  const workflows = new Map<string, WorkflowEntry>();

  async function runNIM(text: string): Promise<unknown> {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nimKey}` },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0.25,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Brain dump:\n${text}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`NIM ${res.status}: ${await res.text().catch(() => '')}`);
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const pt = data.usage?.prompt_tokens ?? 0;
    const ct = data.usage?.completion_tokens ?? 0;
    if (Array.isArray(parsed.items)) {
      parsed.items = (parsed.items as Record<string, unknown>[]).map((item, i) => ({
        ...item, id: `nim-${i}-${Date.now()}`,
      }));
    }
    return {
      ...parsed,
      usage: {
        promptTokenCount: pt, candidatesTokenCount: ct,
        totalTokenCount: pt + ct,
        estimatedCost: (pt / 1e6) * 0.23 + (ct / 1e6) * 0.40,
      },
    };
  }

  function addEvent(entry: WorkflowEntry, eventType: string, detail?: string) {
    entry.events.push({
      eventId: entry.events.length + 1,
      eventType,
      eventTime: new Date().toISOString(),
      detail,
    });
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
  }

  function jsonResponse(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  return {
    name: 'temporal-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // POST /api/untangle → start workflow
        if (req.url === '/api/untangle' && req.method === 'POST') {
          if (!nimKey) {
            return jsonResponse(res, 500, { error: 'NIM_API_KEY not set in .env.local' });
          }
          try {
            const body = JSON.parse(await readBody(req)) as { text?: string };
            if (!body.text?.trim()) return jsonResponse(res, 400, { error: 'text field required' });
            const workflowId = `untangle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const entry: WorkflowEntry = {
              text: body.text,
              status: 'RUNNING',
              events: [],
              startTime: Date.now(),
            };
            workflows.set(workflowId, entry);

            addEvent(entry, 'WorkflowExecutionStarted', `namespace: default`);
            addEvent(entry, 'WorkflowTaskScheduled');
            addEvent(entry, 'WorkflowTaskStarted');
            addEvent(entry, 'WorkflowTaskCompleted');

            // Run NIM async — simulates a Temporal activity
            setTimeout(async () => {
              addEvent(entry, 'ActivityTaskScheduled', 'activity: callNIM');
              await new Promise(r => setTimeout(r, 100));
              addEvent(entry, 'ActivityTaskStarted', `worker: untangle-worker-dev`);
              try {
                const result = await runNIM(entry.text);
                addEvent(entry, 'ActivityTaskCompleted', 'result: ready');
                addEvent(entry, 'WorkflowTaskScheduled');
                addEvent(entry, 'WorkflowTaskStarted');
                addEvent(entry, 'WorkflowTaskCompleted');
                addEvent(entry, 'WorkflowExecutionCompleted', 'workflow done');
                entry.status = 'COMPLETED';
                entry.result = result;
              } catch (e) {
                addEvent(entry, 'ActivityTaskFailed', e instanceof Error ? e.message : 'unknown');
                addEvent(entry, 'WorkflowExecutionFailed');
                entry.status = 'FAILED';
                entry.error = e instanceof Error ? e.message : 'Unknown error';
              }
            }, 0);

            return jsonResponse(res, 202, { workflowId });
          } catch (e) {
            return jsonResponse(res, 500, { error: e instanceof Error ? e.message : 'error' });
          }
        }

        // GET /api/status?id=… → poll workflow
        if (req.url?.startsWith('/api/status') && req.method === 'GET') {
          const urlObj = new URL(req.url, 'http://localhost');
          const workflowId = urlObj.searchParams.get('id');
          if (!workflowId) return jsonResponse(res, 400, { error: 'id param required' });
          const entry = workflows.get(workflowId);
          if (!entry) return jsonResponse(res, 404, { error: 'Workflow not found' });
          return jsonResponse(res, 200, {
            status: entry.status,
            events: entry.events,
            result: entry.status === 'COMPLETED' ? entry.result : undefined,
            error: entry.status === 'FAILED' ? entry.error : undefined,
          });
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const nimKey = env.NIM_API_KEY ?? env.NVIDIA_NIM_API_KEY ?? '';
  const temporalAddress = env.TEMPORAL_ADDRESS ?? 'localhost:7233';

  return {
    server: {
      host: '0.0.0.0',
    },
    plugins: [
      UnoCSS(),
      react(),
      ...(mode === 'development'
        ? [temporalDevPlugin(temporalAddress, nimKey)]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Exclude Temporal worker code from client bundle
    optimizeDeps: {
      exclude: ['@temporalio/worker', '@temporalio/workflow'],
    },
    build: {
      rollupOptions: {
        external: ['@temporalio/worker', '@temporalio/workflow'],
      },
    },
  };
});
