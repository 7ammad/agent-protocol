/**
 * Integration Tests — Adapter Layer
 *
 * Proves both adapters work against a live daemon with real HTTP,
 * real SQLite, and real file I/O.
 *
 * 4 scenarios:
 *   1. Claude Code Adapter Lifecycle
 *   2. Cursor Adapter Lifecycle
 *   3. Cross-Adapter Visibility
 *   4. Claim Conflict
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Daemon } from '../src/index.js';
import { ClaudeCodeAdapter } from '../src/adapters/claude-code-adapter.js';
import { CursorAdapter } from '../src/adapters/cursor-adapter.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_PORT = 4798;
const TEST_DIR = resolve(import.meta.dirname ?? '.', '../.test-integration');
const BASE_URL = `http://localhost:${TEST_PORT}`;

let daemon: Daemon;

// ─── Helper ───────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Setup / Teardown ─────────────────────────────────────

beforeAll(async () => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(resolve(TEST_DIR, 'src'), { recursive: true });
  writeFileSync(resolve(TEST_DIR, 'src/index.ts'), 'export const main = () => {};');
  writeFileSync(resolve(TEST_DIR, 'src/utils.ts'), 'export const util = () => {};');
  writeFileSync(resolve(TEST_DIR, 'src/config.ts'), 'export const config = {};');

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
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ─── Scenario 1: Claude Code Adapter Lifecycle ────────────

describe('Claude Code Adapter Lifecycle', () => {
  it('connects, claims, syncs, releases, and disconnects', async () => {
    const claude = new ClaudeCodeAdapter({
      agentId: 'claude-test-1',
      projectRoot: TEST_DIR,
      daemonPort: TEST_PORT,
    });

    // Connect
    await claude.connect();

    // Assert: Agent registered
    const agents = (await api('GET', '/agents')) as unknown as Array<{ id: string; tool: string }>;
    const registered = agents.find(a => a.id === 'claude-test-1');
    expect(registered).toBeDefined();
    expect(registered!.tool).toBe('claude-code');

    // Assert: CLAUDE.md injected
    const claudeMd = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('<!-- AGENT-PROTOCOL:START -->');
    expect(claudeMd).toContain('<!-- AGENT-PROTOCOL:END -->');

    // Claim a file
    const claimed = await claude.claimFile('src/index.ts');
    expect(claimed).toBe(true);

    // Force sync + verify claim appears in CLAUDE.md
    await claude.forceStateSync();
    const claudeMd2 = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd2).toContain('Your Claimed Files');
    expect(claudeMd2).toContain('src/index.ts');

    // Release + disconnect
    await claude.releaseFile('src/index.ts');
    await claude.disconnect();

    // Assert: CLAUDE.md cleaned up
    const claudeMd3 = readFileSync(resolve(TEST_DIR, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd3).not.toContain('<!-- AGENT-PROTOCOL:START -->');

    // Assert: Agent deregistered
    const agentsAfter = (await api('GET', '/agents')) as unknown as Array<{ id: string }>;
    expect(agentsAfter.find(a => a.id === 'claude-test-1')).toBeUndefined();
  });
});

// ─── Scenario 2: Cursor Adapter Lifecycle ─────────────────

describe('Cursor Adapter Lifecycle', () => {
  it('connects, claims, syncs, releases, and disconnects', async () => {
    const cursor = new CursorAdapter({
      agentId: 'cursor-test-1',
      projectRoot: TEST_DIR,
      daemonPort: TEST_PORT,
      role: 'worker',
    });

    // Connect
    await cursor.connect();

    // Assert: Agent registered
    const agents = (await api('GET', '/agents')) as unknown as Array<{ id: string; tool: string }>;
    const registered = agents.find(a => a.id === 'cursor-test-1');
    expect(registered).toBeDefined();
    expect(registered!.tool).toBe('cursor');

    // Assert: .cursorrules injected
    const rules = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
    expect(rules).toContain('# === AGENT-PROTOCOL:START ===');
    expect(rules).toContain('# === AGENT-PROTOCOL:END ===');

    // Claim a file
    const claimed = await cursor.claimFile('src/utils.ts');
    expect(claimed).toBe(true);

    // Force sync + verify claim appears
    await cursor.forceStateSync();
    const rules2 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
    expect(rules2).toContain('YOUR CLAIMED FILES');
    expect(rules2).toContain('src/utils.ts');

    // Release + disconnect
    await cursor.releaseFile('src/utils.ts');
    await cursor.disconnect();

    // Assert: .cursorrules cleaned up
    if (existsSync(resolve(TEST_DIR, '.cursorrules'))) {
      const rules3 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
      expect(rules3).not.toContain('# === AGENT-PROTOCOL:START ===');
    }

    // Assert: Agent deregistered
    const agentsAfter = (await api('GET', '/agents')) as unknown as Array<{ id: string }>;
    expect(agentsAfter.find(a => a.id === 'cursor-test-1')).toBeUndefined();
  });
});

// ─── Scenario 3: Cross-Adapter Visibility ─────────────────

describe('Cross-Adapter Visibility', () => {
  it('Claude claim is visible in Cursor rules and lock markers', async () => {
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

    // Claude claims a file
    await claude.claimFile('src/index.ts');

    // Force sync Cursor — should see blocked file
    await cursor.forceStateSync();

    // Assert: .cursorrules shows blocked file
    const rules = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
    expect(rules).toContain('BLOCKED FILES');
    expect(rules).toContain('src/index.ts');
    expect(rules).toContain('claude-cross-1');

    // Assert: Lock marker file exists
    const lockPath = resolve(TEST_DIR, 'src/.agent-protocol-lock-index.ts');
    expect(existsSync(lockPath)).toBe(true);
    const lockContent = readFileSync(lockPath, 'utf-8');
    expect(lockContent).toContain('LOCKED by claude-cross-1');

    // Claude releases
    await claude.releaseFile('src/index.ts');
    await cursor.forceStateSync();

    // Assert: Blocked file removed from .cursorrules
    const rules2 = readFileSync(resolve(TEST_DIR, '.cursorrules'), 'utf-8');
    expect(rules2).not.toContain('src/index.ts');

    // Assert: Lock marker removed
    expect(existsSync(lockPath)).toBe(false);

    // Cleanup
    await claude.disconnect();
    await cursor.disconnect();
  });
});

// ─── Scenario 4: Claim Conflict ───────────────────────────

describe('Claim Conflict', () => {
  it('second agent cannot claim file already owned by first', async () => {
    const claude = new ClaudeCodeAdapter({
      agentId: 'claude-conflict-1',
      projectRoot: TEST_DIR,
      daemonPort: TEST_PORT,
    });
    const cursor = new CursorAdapter({
      agentId: 'cursor-conflict-1',
      projectRoot: TEST_DIR,
      daemonPort: TEST_PORT,
      role: 'worker',
    });

    await claude.connect();
    await cursor.connect();

    // Claude claims src/config.ts
    const claimed1 = await claude.claimFile('src/config.ts');
    expect(claimed1).toBe(true);

    // Cursor tries to claim same file — should be denied
    const claimed2 = await cursor.claimFile('src/config.ts');
    expect(claimed2).toBe(false);

    // Verify via API that Claude still owns it
    const resources = (await api('GET', '/resources?filter=claimed')) as unknown as Array<{ path: string; owner: string }>;
    const configResource = resources.find(r => r.path === 'src/config.ts');
    expect(configResource).toBeDefined();
    expect(configResource!.owner).toBe('claude-conflict-1');

    // Claude releases
    await claude.releaseFile('src/config.ts');

    // Now Cursor can claim
    const claimed3 = await cursor.claimFile('src/config.ts');
    expect(claimed3).toBe(true);

    // Cleanup
    await cursor.releaseFile('src/config.ts');
    await claude.disconnect();
    await cursor.disconnect();
  });
});
