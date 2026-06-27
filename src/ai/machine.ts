import { setup, assign, fromCallback, fromPromise } from 'xstate';
import { startWorkflow, getWorkflowStatus } from './client';
import type { Menu } from './schema';
import type { TemporalEventRow } from '../../api/status';

export type { TemporalEventRow };

type Context = {
  brainDump: string;
  workflowId: string | null;
  menu: Menu | null;
  error: string | null;
  temporalEvents: TemporalEventRow[];
};

type MachineEvent =
  | { type: 'SUBMIT'; text: string }
  | { type: 'RESET' }
  | { type: 'WORKFLOW_STARTED'; workflowId: string }
  | { type: 'TEMPORAL_EVENT'; events: TemporalEventRow[] }
  | { type: 'WORKFLOW_DONE'; menu: Menu }
  | { type: 'WORKFLOW_ERROR'; error: string };

/** Starts the workflow and returns the workflowId. */
const startActor = fromPromise<{ workflowId: string }, { text: string }>(
  async ({ input }) => startWorkflow(input.text),
);

/**
 * Polls workflow status every 1.5 s, emitting TEMPORAL_EVENT updates
 * and sending WORKFLOW_DONE / WORKFLOW_ERROR when the workflow settles.
 */
const pollActor = fromCallback<MachineEvent, { workflowId: string }>(
  ({ sendBack, input }) => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const status = await getWorkflowStatus(input.workflowId);

          // Push any new Temporal events to context
          if (status.events.length > 0) {
            sendBack({ type: 'TEMPORAL_EVENT', events: status.events });
          }

          if (status.status === 'COMPLETED' && status.result) {
            sendBack({ type: 'WORKFLOW_DONE', menu: status.result });
            return;
          }
          if (status.status === 'FAILED') {
            sendBack({ type: 'WORKFLOW_ERROR', error: status.error ?? 'Workflow failed' });
            return;
          }
          if (status.status === 'TIMED_OUT') {
            sendBack({ type: 'WORKFLOW_ERROR', error: 'Workflow timed out' });
            return;
          }
          if (status.status === 'CANCELLED') {
            sendBack({ type: 'WORKFLOW_ERROR', error: 'Workflow cancelled' });
            return;
          }
        } catch (err) {
          // Don't abort on a single poll failure — Temporal server might be momentarily busy
          console.warn('[poll] status check failed, retrying…', err);
        }

        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    poll();
    return () => { cancelled = true; };
  },
);

export const untangleMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MachineEvent,
  },
  actors: {
    startWorkflow: startActor,
    pollWorkflow: pollActor,
  },
}).createMachine({
  id: 'untangle',
  initial: 'idle',
  context: {
    brainDump: '',
    workflowId: null,
    menu: null,
    error: null,
    temporalEvents: [],
  },
  states: {
    idle: {
      on: {
        SUBMIT: {
          target: 'starting',
          actions: assign({
            brainDump: ({ event }) => event.text,
            workflowId: null,
            menu: null,
            error: null,
            temporalEvents: [],
          }),
        },
      },
    },

    // Step 1: POST /api/untangle → get workflowId
    starting: {
      invoke: {
        src: 'startWorkflow',
        input: ({ context }) => ({ text: context.brainDump }),
        onDone: {
          target: 'loading',
          actions: assign({ workflowId: ({ event }) => event.output.workflowId }),
        },
        onError: {
          target: 'error',
          actions: assign({ error: ({ event }) => (event.error as Error).message }),
        },
      },
    },

    // Step 2: poll /api/status, stream real Temporal events into context
    loading: {
      invoke: {
        src: 'pollWorkflow',
        input: ({ context }) => ({ workflowId: context.workflowId! }),
      },
      on: {
        TEMPORAL_EVENT: {
          actions: assign({
            temporalEvents: ({ event }) => event.events,
          }),
        },
        WORKFLOW_DONE: {
          target: 'success',
          actions: assign({ menu: ({ event }) => event.menu }),
        },
        WORKFLOW_ERROR: {
          target: 'error',
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },

    success: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign({ brainDump: '', workflowId: null, menu: null, error: null, temporalEvents: [] }),
        },
      },
    },

    error: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign({ brainDump: '', workflowId: null, error: null, temporalEvents: [] }),
        },
      },
    },
  },
});
