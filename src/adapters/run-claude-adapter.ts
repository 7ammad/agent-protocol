/**
 * Standalone runner for Claude Code adapter.
 * For manual live testing against a running daemon.
 *
 * Usage:
 *   pnpm adapter:claude
 *   pnpm adapter:claude -- --project-root=/path/to/project --port=4700 --agent-id=claude-code-1
 */

import { ClaudeCodeAdapter } from './claude-code-adapter.js';

const projectRoot = process.argv.find(a => a.startsWith('--project-root='))?.split('=')[1]
  ?? process.cwd();
const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] ?? '4700');
const agentId = process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1]
  ?? 'claude-code-1';

const adapter = new ClaudeCodeAdapter({ agentId, projectRoot, daemonPort: port });

await adapter.connect();
console.log(`Claude Code adapter running (${agentId}) on ${projectRoot}`);
console.log('Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await adapter.disconnect();
  process.exit(0);
});
