import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';

const connection = await NativeConnection.connect({ address });

const worker = await Worker.create({
  connection,
  namespace,
  workflowsPath: path.resolve(__dirname, './workflow'),
  activities,
  taskQueue: 'untangle',
  // Bundler options — points to the compiled workflow module
  bundlerOptions: {
    // Ignore packages that are node-only and not needed in the workflow sandbox
    ignoreModules: ['@temporalio/activity'],
  },
});

console.log(`[worker] Connected to ${address}, namespace: ${namespace}`);
console.log('[worker] Polling task queue: untangle');

await worker.run();
