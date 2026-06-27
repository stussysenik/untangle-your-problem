import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type { Menu } from '../src/ai/schema';

const { callNIM } = proxyActivities<typeof activities>({
  startToCloseTimeout: '45 seconds',
  heartbeatTimeout: '15 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2,
  },
});

/** Main workflow: takes a brain dump, returns a validated Menu. */
export async function untangleWorkflow(text: string): Promise<Menu> {
  return await callNIM(text);
}
