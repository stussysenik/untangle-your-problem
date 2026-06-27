import { Client, Connection } from '@temporalio/client';

// Node.js runtime — needed for Temporal's gRPC client
export const config = { runtime: 'nodejs' };

async function getTemporalClient(): Promise<Client> {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';
  const connection = await Connection.connect({ address });
  return new Client({ connection, namespace });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return new Response(JSON.stringify({ error: 'text field required' }), { status: 400 });
    }
    text = body.text.trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  try {
    const client = await getTemporalClient();
    const workflowId = `untangle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await client.workflow.start('untangleWorkflow', {
      args: [text],
      taskQueue: 'untangle',
      workflowId,
    });

    return new Response(JSON.stringify({ workflowId }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start workflow';
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
