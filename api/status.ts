import { Client, Connection } from '@temporalio/client';
import type { Menu } from '../src/ai/schema';

export const config = { runtime: 'nodejs' };

export type TemporalEventRow = {
  eventId: number;
  eventType: string;
  eventTime: string;
  detail?: string;
};

export type WorkflowStatus = {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED' | 'UNKNOWN';
  events: TemporalEventRow[];
  result?: Menu;
  error?: string;
};

function statusName(code: number): WorkflowStatus['status'] {
  const map: Record<number, WorkflowStatus['status']> = {
    1: 'RUNNING',
    2: 'COMPLETED',
    3: 'FAILED',
    4: 'TIMED_OUT',
    5: 'CANCELLED',
  };
  return map[code] ?? 'UNKNOWN';
}

/** Extract a human-readable detail from a Temporal event's attributes. */
function eventDetail(eventType: string, attrs: Record<string, unknown> | null): string | undefined {
  if (!attrs) return undefined;
  if (eventType === 'ActivityTaskScheduled') {
    const at = attrs.activityType as { name?: string } | undefined;
    return at?.name ? `activity: ${at.name}` : undefined;
  }
  if (eventType === 'ActivityTaskStarted') {
    const id = attrs.scheduledEventId;
    return id ? `scheduled-id: ${id}` : undefined;
  }
  if (eventType === 'ActivityTaskCompleted') {
    return 'result: ready';
  }
  if (eventType === 'WorkflowExecutionCompleted') {
    return 'workflow done';
  }
  return undefined;
}

async function getTemporalClient(): Promise<Client> {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';
  const connection = await Connection.connect({ address });
  return new Client({ connection, namespace });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const url = new URL(req.url);
  const workflowId = url.searchParams.get('id');
  if (!workflowId) {
    return new Response(JSON.stringify({ error: 'id param required' }), { status: 400 });
  }

  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);

    const [description, history] = await Promise.all([
      handle.describe(),
      handle.fetchHistory(),
    ]);

    const status = statusName(description.status.code);

    const events: TemporalEventRow[] = (history.events ?? []).map((e) => ({
      eventId: Number(e.eventId ?? 0),
      eventType: e.eventType?.toString().replace(/^EVENT_TYPE_/, '').replace(/_/g, ' ') ?? 'Unknown',
      eventTime: e.eventTime ? new Date(Number(e.eventTime.seconds) * 1000).toISOString() : new Date().toISOString(),
      detail: eventDetail(
        e.eventType?.toString().replace(/^EVENT_TYPE_/, '').replace(/_/g, '') ?? '',
        ((e as Record<string, unknown>).activityTaskScheduledEventAttributes as Record<string, unknown> | undefined) ?? null,
      ),
    }));

    let result: Menu | undefined;
    let error: string | undefined;

    if (status === 'COMPLETED') {
      result = (await handle.result()) as Menu;
    }
    if (status === 'FAILED') {
      try {
        await handle.result();
      } catch (e) {
        error = e instanceof Error ? e.message : 'Workflow failed';
      }
    }

    const body: WorkflowStatus = { status, events, result, error };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Status check failed';
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
