import type { Menu } from './schema';
import type { WorkflowStatus } from '../../api/status';

export async function startWorkflow(brainDump: string): Promise<{ workflowId: string }> {
  const res = await fetch('/api/untangle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: brainDump }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ workflowId: string }>;
}

export async function getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
  const res = await fetch(`/api/status?id=${encodeURIComponent(workflowId)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<WorkflowStatus>;
}

/** Convenience: start a workflow and wait (poll) until it completes. Used for testing. */
export async function fetchMenu(brainDump: string): Promise<Menu> {
  const { workflowId } = await startWorkflow(brainDump);
  while (true) {
    const status = await getWorkflowStatus(workflowId);
    if (status.status === 'COMPLETED' && status.result) return status.result;
    if (status.status === 'FAILED') throw new Error(status.error ?? 'Workflow failed');
    if (status.status === 'TIMED_OUT') throw new Error('Workflow timed out');
    if (status.status === 'CANCELLED') throw new Error('Workflow cancelled');
    await new Promise((r) => setTimeout(r, 1500));
  }
}
