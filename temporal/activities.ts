import { heartbeat } from '@temporalio/activity';
import { untangle } from '../src/ai/generate';
import type { Menu } from '../src/ai/schema';

/** Temporal activity: thin wrapper that drives the generation core and heartbeats progress. */
export async function callNIM(text: string): Promise<Menu> {
  return untangle(text, (note) => heartbeat(note));
}
