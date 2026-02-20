/**
 * Standalone runner for Cursor adapter.
 * For manual live testing against a running daemon.
 *
 * Usage:
 *   pnpm adapter:cursor
 *   pnpm adapter:cursor -- --project-root=/path/to/project --port=4700 --agent-id=cursor-1 --role=worker
 */

import { CursorAdapter } from './cursor-adapter.js';

const projectRoot = process.argv.find(a => a.startsWith('--project-root='))?.split('=')[1]
  ?? process.cwd();
const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] ?? '4700');
const agentId = process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1]
  ?? 'cursor-1';
const role = (process.argv.find(a => a.startsWith('--role='))?.split('=')[1] ?? 'worker') as 'lead' | 'specialist' | 'worker';

const adapter = new CursorAdapter({ agentId, projectRoot, daemonPort: port, role });

await adapter.connect();
console.log(`Cursor adapter running (${agentId}, ${role}) on ${projectRoot}`);
console.log('Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await adapter.disconnect();
  process.exit(0);
});
