/**
 * End-to-End Test — Agent Protocol
 *
 * Simulates two agents (Claude Code + Cursor) coordinating through the daemon.
 * Tests the five failure modes the protocol is designed to solve:
 *   F1: File Conflict (resource ownership)
 *   F2: Duplicated Work (task tracking)
 *   F3: Context Blindness (state snapshot)
 *   F4: Authority Violation (lead hierarchy)
 *   F5: Silent Handoff (structured handoffs)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Daemon } from '../src/index.js';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_PORT = 4799;
const TEST_DIR = resolve(import.meta.dirname ?? '.', '../.test-project');
const BASE_URL = `http://localhost:${TEST_PORT}`;

let daemon: Daemon;

// ─── Helper ───────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<any>;
}

// ─── Setup / Teardown ─────────────────────────────────────

beforeAll(async () => {
  // Create a fake project directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(resolve(TEST_DIR, 'src'), { recursive: true });
  writeFileSync(resolve(TEST_DIR, 'src/index.ts'), 'console.log("hello");');
  writeFileSync(resolve(TEST_DIR, 'src/utils.ts'), 'export const add = (a: number, b: number) => a + b;');
  writeFileSync(resolve(TEST_DIR, 'src/config.ts'), 'export const PORT = 3000;');

  daemon = new Daemon({
    projectRoot: TEST_DIR,
    config: {
      project: 'test-project',
      port: TEST_PORT,
      heartbeat_interval_ms: 60000, // Long interval — we'll test manually
      dead_agent_timeout_ms: 5000,
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

// ─── F1: File Conflict (Resource Ownership) ───────────────

describe('F1: Resource Ownership & Conflict Detection', () => {
  beforeEach(async () => {
    // Register two agents fresh for each test
    await api('POST', '/agents/announce', {
      id: 'claude-1',
      tool: 'claude-code',
      role: 'lead',
      capabilities: ['code', 'review'],
    });
    await api('POST', '/agents/announce', {
      id: 'cursor-1',
      tool: 'cursor',
      role: 'worker',
      capabilities: ['code', 'refactor'],
    });
  });

  it('should grant claim to first agent', async () => {
    const result = await api('POST', '/resources/claim', {
      path: 'src/index.ts',
      agent_id: 'claude-1',
    });
    expect(result.granted).toBe(true);
  });

  it('should deny claim when file is already owned', async () => {
    // Claude claims first
    await api('POST', '/resources/claim', {
      path: 'src/utils.ts',
      agent_id: 'claude-1',
    });

    // Cursor tries to claim the same file
    const result = await api('POST', '/resources/claim', {
      path: 'src/utils.ts',
      agent_id: 'cursor-1',
    });
    expect(result.granted).toBe(false);
    expect(result.owner).toBe('claude-1');
  });

  it('should allow claim after release', async () => {
    // Claude claims
    await api('POST', '/resources/claim', {
      path: 'src/config.ts',
      agent_id: 'claude-1',
    });

    // Claude releases
    await api('POST', '/resources/release', {
      path: 'src/config.ts',
      agent_id: 'claude-1',
    });

    // Cursor can now claim
    const result = await api('POST', '/resources/claim', {
      path: 'src/config.ts',
      agent_id: 'cursor-1',
    });
    expect(result.granted).toBe(true);
  });

  it('should not release file if not the owner', async () => {
    await api('POST', '/resources/claim', {
      path: 'src/index.ts',
      agent_id: 'claude-1',
    });

    const releaseResult = await api('POST', '/resources/release', {
      path: 'src/index.ts',
      agent_id: 'cursor-1', // Not the owner
    });
    expect(releaseResult.released).toBe(false);
  });
});

// ─── F2: Duplicated Work (Task Tracking) ──────────────────

describe('F2: Task Tracking', () => {
  it('should create and track tasks', async () => {
    const task = await api('POST', '/tasks', {
      title: 'Implement auth module',
      description: 'Add JWT-based authentication',
      assigned_to: 'claude-1',
      assigned_by: 'claude-1',
      resources: ['src/auth.ts', 'src/middleware.ts'],
    });

    expect(task.id).toMatch(/^task_/);
    expect(task.status).toBe('assigned');
    expect(task.assigned_to).toBe('claude-1');
  });

  it('should update task status through lifecycle', async () => {
    const task = await api('POST', '/tasks', {
      title: 'Fix login bug',
      assigned_to: 'cursor-1',
      assigned_by: 'claude-1',
    });

    // Start working
    await api('PATCH', `/tasks/${task.id}`, {
      status: 'in_progress',
      agent_id: 'cursor-1',
    });

    // Complete
    await api('PATCH', `/tasks/${task.id}`, {
      status: 'done',
      agent_id: 'cursor-1',
    });

    // Verify final state
    const allTasks = await api('GET', '/tasks');
    const updated = allTasks.find((t: any) => t.id === task.id);
    expect(updated.status).toBe('done');
    expect(updated.completed_at).toBeGreaterThan(0);
  });

  it('should list all tasks with visibility for all agents', async () => {
    await api('POST', '/tasks', {
      title: 'Task for Claude',
      assigned_to: 'claude-1',
      assigned_by: 'claude-1',
    });
    await api('POST', '/tasks', {
      title: 'Task for Cursor',
      assigned_to: 'cursor-1',
      assigned_by: 'claude-1',
    });

    const tasks = await api('GET', '/tasks');
    // Both agents can see all tasks — no duplicated work
    expect(tasks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── F3: Context Blindness (State Snapshot) ───────────────

describe('F3: State Snapshot & Context Awareness', () => {
  it('should provide full state snapshot', async () => {
    const state = await api('GET', '/state');

    expect(state).toHaveProperty('agents');
    expect(state).toHaveProperty('resources');
    expect(state).toHaveProperty('tasks');
    expect(state).toHaveProperty('handoffs');
    expect(state).toHaveProperty('lead');
    expect(state).toHaveProperty('event_count');
    expect(state.event_count).toBeGreaterThan(0);
  });

  it('should provide status summary', async () => {
    const status = await api('GET', '/status');

    expect(status.version).toBe('0.1');
    expect(status.project).toBe('test-project');
    expect(status.agents.total).toBeGreaterThan(0);
    expect(status).toHaveProperty('resources');
    expect(status).toHaveProperty('tasks');
  });

  it('should track events for auditability', async () => {
    const events = await api('GET', '/events');

    expect(events.length).toBeGreaterThan(0);
    // Events have required fields
    const event = events[0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('agent_id');
    expect(event).toHaveProperty('action');
  });
});

// ─── F4: Authority Violation (Lead Hierarchy) ─────────────

describe('F4: Lead Agent Hierarchy', () => {
  it('should identify the lead agent', async () => {
    const state = await api('GET', '/state');
    // The first agent registered (claude-1) should be lead
    expect(state.lead).toBeTruthy();
  });

  it('should release resources when agent is removed', async () => {
    // Create a temp agent and claim a file
    await api('POST', '/agents/announce', {
      id: 'temp-agent',
      tool: 'codex',
      role: 'worker',
    });
    await api('POST', '/resources/claim', {
      path: 'src/temp-owned.ts',
      agent_id: 'temp-agent',
    });

    // Remove the agent
    await api('DELETE', '/agents/temp-agent');

    // Resource should be released (try to claim it)
    const result = await api('POST', '/resources/claim', {
      path: 'src/temp-owned.ts',
      agent_id: 'cursor-1',
    });
    expect(result.granted).toBe(true);
  });
});

// ─── F5: Silent Handoff ───────────────────────────────────

describe('F5: Structured Handoffs', () => {
  it('should create a handoff with full context', async () => {
    // Create a task first
    const task = await api('POST', '/tasks', {
      title: 'Build API endpoints',
      assigned_to: 'claude-1',
      assigned_by: 'claude-1',
    });

    // Claude creates a handoff to Cursor
    const handoff = await api('POST', '/handoffs', {
      from_agent: 'claude-1',
      to_agent: 'cursor-1',
      task_id: task.id,
      summary: 'Built GET/POST endpoints for /users. Need PUT/DELETE implemented.',
      files_modified: ['src/routes/users.ts', 'src/middleware/auth.ts'],
      files_created: ['src/routes/users.test.ts'],
      context: 'Using Express with Zod validation. Auth middleware checks JWT.',
      blockers: ['Need database migration for updated_at column'],
    });

    expect(handoff.id).toMatch(/^hoff_/);
    expect(handoff.status).toBe('pending');
    expect(handoff.files_modified).toHaveLength(2);
    expect(handoff.blockers).toHaveLength(1);
  });

  it('should allow accepting a handoff', async () => {
    const task = await api('POST', '/tasks', {
      title: 'Handoff test task',
      assigned_to: 'claude-1',
      assigned_by: 'claude-1',
    });

    const handoff = await api('POST', '/handoffs', {
      from_agent: 'claude-1',
      to_agent: 'cursor-1',
      task_id: task.id,
      summary: 'Handing off frontend work',
      files_modified: [],
      files_created: [],
      context: 'React with TypeScript',
      blockers: [],
    });

    const result = await api('PATCH', `/handoffs/${handoff.id}/accept`, {
      agent_id: 'cursor-1',
    });

    expect(result.accepted).toBe(true);
  });

  it('should allow rejecting a handoff with reason', async () => {
    const task = await api('POST', '/tasks', {
      title: 'Another handoff test',
      assigned_to: 'claude-1',
      assigned_by: 'claude-1',
    });

    const handoff = await api('POST', '/handoffs', {
      from_agent: 'claude-1',
      to_agent: 'cursor-1',
      task_id: task.id,
      summary: 'Need help with database layer',
      files_modified: ['src/db.ts'],
      files_created: [],
      context: 'Using Drizzle ORM',
      blockers: [],
    });

    const result = await api('PATCH', `/handoffs/${handoff.id}/reject`, {
      agent_id: 'cursor-1',
      reason: 'Not familiar with Drizzle ORM, suggest assigning to codex',
    });

    expect(result.rejected).toBe(true);
  });
});

// ─── SSE Event Stream ─────────────────────────────────────

describe('SSE Event Stream', () => {
  it('should stream events in real-time', async () => {
    // Start listening for events
    const controller = new AbortController();
    const events: string[] = [];

    const streamPromise = fetch(`${BASE_URL}/events/stream`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          events.push(decoder.decode(value));
          if (events.length >= 1) {
            controller.abort();
            break;
          }
        }
      } catch {
        // Abort expected
      }
    });

    // Give SSE time to connect
    await new Promise(r => setTimeout(r, 100));

    // Trigger an event
    await api('POST', '/agents/announce', {
      id: 'sse-test-agent',
      tool: 'test',
    });

    // Wait for stream to receive
    await Promise.race([
      streamPromise,
      new Promise(r => setTimeout(r, 2000)),
    ]);

    expect(events.length).toBeGreaterThanOrEqual(1);
    // Events should be SSE formatted
    expect(events[0]).toContain('data:');
  });
});

// ─── Multi-Agent Scenario ─────────────────────────────────

describe('Full Multi-Agent Scenario', () => {
  it('should coordinate a realistic two-agent workflow', async () => {
    // 1. Claude (lead) creates a task and assigns to Cursor
    const task = await api('POST', '/tasks', {
      title: 'Refactor authentication module',
      description: 'Split monolithic auth.ts into separate concerns',
      assigned_to: 'cursor-1',
      assigned_by: 'claude-1',
      resources: ['src/auth.ts', 'src/auth-middleware.ts', 'src/auth-utils.ts'],
    });

    // 2. Cursor claims the files it needs
    const claim1 = await api('POST', '/resources/claim', {
      path: 'src/auth.ts',
      agent_id: 'cursor-1',
      task_id: task.id,
    });
    expect(claim1.granted).toBe(true);

    const claim2 = await api('POST', '/resources/claim', {
      path: 'src/auth-middleware.ts',
      agent_id: 'cursor-1',
      task_id: task.id,
    });
    expect(claim2.granted).toBe(true);

    // 3. Claude tries to edit one of Cursor's files — should be blocked
    const blockedClaim = await api('POST', '/resources/claim', {
      path: 'src/auth.ts',
      agent_id: 'claude-1',
    });
    expect(blockedClaim.granted).toBe(false);
    expect(blockedClaim.owner).toBe('cursor-1');

    // 4. Cursor starts working
    await api('PATCH', `/tasks/${task.id}`, {
      status: 'in_progress',
      agent_id: 'cursor-1',
    });

    // 5. Cursor finishes and releases files
    await api('POST', '/resources/release', {
      path: 'src/auth.ts',
      agent_id: 'cursor-1',
    });
    await api('POST', '/resources/release', {
      path: 'src/auth-middleware.ts',
      agent_id: 'cursor-1',
    });

    // 6. Cursor creates handoff back to Claude for review
    const handoff = await api('POST', '/handoffs', {
      from_agent: 'cursor-1',
      to_agent: 'claude-1',
      task_id: task.id,
      summary: 'Refactored auth into 3 modules. Tests passing.',
      files_modified: ['src/auth.ts'],
      files_created: ['src/auth-middleware.ts', 'src/auth-utils.ts'],
      context: 'Used Express middleware pattern. JWT validation in auth-utils.',
      blockers: [],
    });

    // 7. Claude accepts handoff
    const accepted = await api('PATCH', `/handoffs/${handoff.id}/accept`, {
      agent_id: 'claude-1',
    });
    expect(accepted.accepted).toBe(true);

    // 8. Claude can now claim the files for review
    const reviewClaim = await api('POST', '/resources/claim', {
      path: 'src/auth.ts',
      agent_id: 'claude-1',
    });
    expect(reviewClaim.granted).toBe(true);

    // 9. Mark task done
    await api('PATCH', `/tasks/${task.id}`, {
      status: 'done',
      agent_id: 'claude-1',
    });

    // 10. Verify the full event trail
    const events = await api('GET', '/events');
    expect(events.length).toBeGreaterThan(5); // Multiple events were created
  });
});
