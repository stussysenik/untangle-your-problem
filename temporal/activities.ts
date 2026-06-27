import { heartbeat } from '@temporalio/activity';
import { MenuSchema } from '../src/ai/schema';
import type { Menu } from '../src/ai/schema';

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NIM_MODEL = 'meta/llama-3.3-70b-instruct';
const INPUT_COST_PER_M = 0.23;
const OUTPUT_COST_PER_M = 0.40;

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

export async function callNIM(text: string): Promise<Menu> {
  const nimKey =
    process.env.NIM_API_KEY ??
    process.env.NVIDIA_NIM_API_KEY ??
    '';

  if (!nimKey) throw new Error('NIM_API_KEY not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

  heartbeat('Starting NIM request');

  try {
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nimKey}`,
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        temperature: 0.25,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Brain dump:\n${text}` },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`NIM ${res.status}: ${body.slice(0, 200)}`);
    }

    heartbeat('NIM response received, parsing');

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('Empty content from NIM');

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    const rawParsed = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(rawParsed.items)) {
      const now = Date.now();
      (rawParsed.items as Record<string, unknown>[]).forEach((item, i) => {
        item.id = `nim-${i}-${now}`;
      });
    }

    const validated = MenuSchema.parse({
      ...rawParsed,
      usage: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: completionTokens,
        totalTokenCount: promptTokens + completionTokens,
        estimatedCost:
          (promptTokens / 1_000_000) * INPUT_COST_PER_M +
          (completionTokens / 1_000_000) * OUTPUT_COST_PER_M,
      },
    });

    heartbeat('Validation passed');
    return validated;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
