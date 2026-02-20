# Phase 1 — Integration Test Specification

## Goal

Prove both adapters work against a live daemon with real HTTP, real SQLite, and real file I/O.

The existing `tests/e2e.test.ts` (17 tests) tests the daemon API directly. These integration tests test the **adapter layer**: connect, inject state into files, claim resources, sync, release, disconnect.

---

## Adapter Changes Required

### ClaudeCodeAdapter — add `forceStateSync()`

**File:** `src/adapters/claude-code-adapter.ts`

The private method `injectStateIntoCLAUDEMD()` (line 151) runs on a 10s interval. Tests can't wait 10s per assertion. Add a public method that triggers it immediately:

```typescript
/**
 * Force immediate state sync (bypasses 10s interval).
 * Used by integration tests for deterministic assertions.
 */
async forceStateSync(): Promise<void> {
  await this.injectStateIntoCLAUDEMD();
}
```

Insert after the `releaseFile()` method (after line 143), before the private section.

### CursorAdapter — add `forceStateSync()`

**File:** `src/adapters/cursor-adapter.ts`

The private method `syncState()` (line 167) runs on an 8s interval. Add a public method:

```typescript
/**
 * Force immediate state sync (bypasses 8s interval).
 * Used by integration tests for deterministic assertions.
 */
async forceStateSync(): Promise<void> {
  await this.syncState();
}
```

**Visibility change:** `syncState()` is currently `private`. Either:
- Change it to `protected` (preferred — keeps it off the public API but accessible to the public wrapper)
- Or keep it `private` and inline the body into `forceStateSync()` (duplicates 4 lines)

Insert after `releaseFile()` (after line 162), before the private section.

---

## Test File

**Path:** `tests/integration.test.ts`
**Framework:** Vitest (same as `tests/e2e.test.ts`)
**Port:** `4798` (different from e2e's port to avoid conflicts if both run)

---

## Setup / Teardown

Follow the same pattern as `tests/e2e.test.ts` (lines 38–57):

```typescript
import { Daemon } from '../src/index.js';
import { ClaudeCodeAdapter } from '../src/adapters/claude-code-adapter.js';
import { CursorAdapter } from '../src/adapters/cursor-adapter.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_PORT = 4798;
const TEST_DIR = resolve(import.meta.dirname, '../.test-integration');
const BASE_URL = `http://localhost:${TEST_PORT}`;

let daemon: Daemon;

beforeAll(async () => {
  // Create temp project structure
  mkdirSync(resolve(TEST_DIR, 'src'), { recursive: true });
  writeFileSync(resolve(TEST_DIR, 'src/index.ts'), 'export const main = () => {};');
  writeFileSync(resolve(TEST_DIR, 'src/utils.ts'), 'export const util = () => {};');
  writeFileSync(resolve(TEST_DIR, 'src/config.ts'), 'export const config = {};');

  // Start daemon
  daemon = new Daemon({
    projectRoot: TEST_DIR,
    config: {
      project: 'integration-test',
      port: TEST_PORT,
    },
  });
  await daemon.start();
});

afterAll(async () => {
  await daemon.stop();
  rmSync(TEST_DIR, { recursive: true, force: true });
});
```

### Helper

```typescript
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<any>;
}
```

---

## Test Scenarios (4)

### Scenario 1: Claude Code Adapter Lifecycle

```
describe('Claude Code Adapter Lifecycle')
```

**Steps & assertions:**

1. Create adapter:
   ```typescript
   const claude = new ClaudeCodeAdapter({
     agentId: 'claude-test-1',
     projectRoot: TEST_DIR,
     daemonPort: TEST_PORT,
   });
   ```

2. `await claude.connect()`

3. **Assert: Agent registered**
   ```typescript
   const agents = await api('GET', '/agents');
   expect(agents.find(a => a.id === 'claude-test-1')).toBeDefined();
   expect(agents.find(a => a.id === 'claude-test-1').tool).toBe('claude-code');
   ```

4. **Assert: CLAUDE.md injected**
   ```typescript
   const claudeMd = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
   expect(claudeMd).toContain('<!-- AGENT-PROTOCOL:START -->');
   expect(claudeMd).toContain('<!-- AGENT-PROTOCOL:END -->');
   ```

5. Claim a file:
   ```typescript
   const claimed = await claude.claimFile('src/index.ts');
   expect(claimed).toBe(true);
   ```

6. Force sync + verify claim appears:
   ```typescript
   await claude.forceStateSync();
   const claudeMd2 = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
   expect(claudeMd2).toContain('Your Claimed Files');
   expect(claudeMd2).toContain('src/index.ts');
   ```

7. Release + disconnect:
   ```typescript
   await claude.releaseFile('src/index.ts');
   await claude.disconnect();
   ```

8. **Assert: CLAUDE.md cleaned up**
   ```typescript
   const claudeMd3 = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
   expect(claudeMd3).not.toContain('<!-- AGENT-PROTOCOL:START -->');
   ```

9. **Assert: Agent deregistered**
   ```typescript
   const agentsAfter = await api('GET', '/agents');
   expect(agentsAfter.find(a => a.id === 'claude-test-1')).toBeUndefined();
   ```

---

### Scenario 2: Cursor Adapter Lifecycle

```
describe('Cursor Adapter Lifecycle')
```

**Steps & assertions:**

1. Create adapter:
   ```typescript
   const cursor = new CursorAdapter({
     agentId: 'cursor-test-1',
     projectRoot: TEST_DIR,
     daemonPort: TEST_PORT,
     role: 'worker',
   });
   ```

2. `await cursor.connect()`

3. **Assert: Agent registered**
   ```typescript
   const agents = await api('GET', '/agents');
   expect(agents.find(a => a.id === 'cursor-test-1')).toBeDefined();
   expect(agents.find(a => a.id === 'cursor-test-1').tool).toBe('cursor');
   ```

4. **Assert: .cursorrules injected**
   ```typescript
   const rules = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
   expect(rules).toContain('# === AGENT-PROTOCOL:START ===');
   expect(rules).toContain('# === AGENT-PROTOCOL:END ===');
   ```

5. Claim a file:
   ```typescript
   const claimed = await cursor.claimFile('src/utils.ts');
   expect(claimed).toBe(true);
   ```

6. Force sync + verify claim appears:
   ```typescript
   await cursor.forceStateSync();
   const rules2 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
   expect(rules2).toContain('YOUR CLAIMED FILES');
   expect(rules2).toContain('src/utils.ts');
   ```

7. Release + disconnect:
   ```typescript
   await cursor.releaseFile('src/utils.ts');
   await cursor.disconnect();
   ```

8. **Assert: .cursorrules cleaned up**
   - Either file is removed (if it was empty before) or markers are gone
   ```typescript
   if (existsSync(resolve(TEST_DIR, '.cursorrules'))) {
     const rules3 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
     expect(rules3).not.toContain('# === AGENT-PROTOCOL:START ===');
   }
   ```

9. **Assert: Agent deregistered**

---

### Scenario 3: Cross-Adapter Visibility

```
describe('Cross-Adapter Visibility')
```

**Steps & assertions:**

1. Create and connect both adapters:
   ```typescript
   const claude = new ClaudeCodeAdapter({
     agentId: 'claude-cross-1',
     projectRoot: TEST_DIR,
     daemonPort: TEST_PORT,
   });
   const cursor = new CursorAdapter({
     agentId: 'cursor-cross-1',
     projectRoot: TEST_DIR,
     daemonPort: TEST_PORT,
     role: 'worker',
   });
   await claude.connect();
   await cursor.connect();
   ```

2. Claude claims a file:
   ```typescript
   await claude.claimFile('src/index.ts');
   ```

3. Force sync Cursor:
   ```typescript
   await cursor.forceStateSync();
   ```

4. **Assert: .cursorrules shows blocked file**
   ```typescript
   const rules = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
   expect(rules).toContain('BLOCKED FILES');
   expect(rules).toContain('src/index.ts');
   expect(rules).toContain('claude-cross-1');
   ```

5. **Assert: Lock marker file exists**
   ```typescript
   const lockPath = resolve(TEST_DIR, 'src/.agent-protocol-lock-index.ts');
   expect(existsSync(lockPath)).toBe(true);
   const lockContent = readFileSync(lockPath, 'utf-8');
   expect(lockContent).toContain('LOCKED by claude-cross-1');
   ```

6. Claude releases:
   ```typescript
   await claude.releaseFile('src/index.ts');
   await cursor.forceStateSync();
   ```

7. **Assert: Blocked file removed from .cursorrules**
   ```typescript
   const rules2 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
   expect(rules2).not.toContain('src/index.ts');
   ```

8. **Assert: Lock marker removed**
   ```typescript
   expect(existsSync(lockPath)).toBe(false);
   ```

9. Disconnect both:
   ```typescript
   await claude.disconnect();
   await cursor.disconnect();
   ```

---

### Scenario 4: Claim Conflict

```
describe('Claim Conflict')
```

**Steps & assertions:**

1. Connect both adapters (use new IDs to avoid conflicts with other tests)

2. Claude claims `src/config.ts`:
   ```typescript
   const claimed1 = await claude.claimFile('src/config.ts');
   expect(claimed1).toBe(true);
   ```

3. Cursor tries to claim same file:
   ```typescript
   const claimed2 = await cursor.claimFile('src/config.ts');
   expect(claimed2).toBe(false);
   ```

4. **Verify via API** that Claude still owns it:
   ```typescript
   const resources = await api('GET', '/resources?filter=claimed');
   const configResource = resources.find(r => r.path === 'src/config.ts');
   expect(configResource.owner).toBe('claude-conflict-1');
   ```

5. Claude releases:
   ```typescript
   await claude.releaseFile('src/config.ts');
   ```

6. Now Cursor can claim:
   ```typescript
   const claimed3 = await cursor.claimFile('src/config.ts');
   expect(claimed3).toBe(true);
   ```

7. Cleanup:
   ```typescript
   await cursor.releaseFile('src/config.ts');
   await claude.disconnect();
   await cursor.disconnect();
   ```

---

## Standalone Adapter Runners

### `src/adapters/run-claude-adapter.ts`

**Purpose:** Run Claude adapter standalone for manual live testing.

```typescript
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
```

### `src/adapters/run-cursor-adapter.ts`

Same pattern plus `--role` arg:

```typescript
const role = (process.argv.find(a => a.startsWith('--role='))?.split('=')[1] ?? 'worker')
  as 'lead' | 'specialist' | 'worker';

const adapter = new CursorAdapter({ agentId, projectRoot, daemonPort: port, role });
```

### package.json scripts

```json
"adapter:claude": "tsx src/adapters/run-claude-adapter.ts",
"adapter:cursor": "tsx src/adapters/run-cursor-adapter.ts"
```

---

## Key Verification Strings (from actual source)

These are the exact strings the tests assert against, verified from the adapter source code:

| Adapter | Marker | Value (exact) |
|---------|--------|---------------|
| Claude | Header | `<!-- AGENT-PROTOCOL:START -->` |
| Claude | Footer | `<!-- AGENT-PROTOCOL:END -->` |
| Claude | Claimed section | `### Your Claimed Files` |
| Claude | Blocked section | `### ⚠️ DO NOT EDIT — Files Owned by Other Agents` |
| Claude | Conflicts section | `### 🔴 CONFLICTS — Requires Resolution` |
| Cursor | Header | `# === AGENT-PROTOCOL:START ===` |
| Cursor | Footer | `# === AGENT-PROTOCOL:END ===` |
| Cursor | Claimed section | `# YOUR CLAIMED FILES (safe to edit):` |
| Cursor | Blocked section | `# BLOCKED FILES — DO NOT EDIT (owned by other agents):` |
| Cursor | Conflicts section | `# CONFLICTS — REQUIRES RESOLUTION:` |
| Cursor | Lock file prefix | `.agent-protocol-lock-` |
| Cursor | Lock content | `LOCKED by {agent_id}` |
