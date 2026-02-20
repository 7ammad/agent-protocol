/**
 * Cursor Adapter
 *
 * Connects Cursor (VS Code-based AI editor) to the Agent Protocol daemon.
 *
 * Strategy: Uses workspace marker files and .cursorrules injection.
 * Cursor reads .cursorrules for context, similar to how Claude Code reads CLAUDE.md.
 *
 * Non-invasive detection mechanisms:
 * 1. Registers Cursor as an agent with the daemon
 * 2. Injects coordination state into .cursorrules
 * 3. Creates .agent-protocol-lock marker files for blocked resources
 * 4. Sends periodic heartbeats
 * 5. Watches for Cursor-initiated file saves via daemon's file watcher
 *
 * Lock markers:
 *   When another agent owns a file, the adapter creates a sibling marker file
 *   e.g., `src/index.ts` → `src/.agent-protocol-lock-index.ts`
 *   Cursor's file explorer shows these markers, signaling "don't touch."
 *   The markers are cleaned up when the resource is released.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import type { Resource, Agent } from '../core/types.js';

const RULES_HEADER = '# === AGENT-PROTOCOL:START ===';
const RULES_FOOTER = '# === AGENT-PROTOCOL:END ===';
const LOCK_PREFIX = '.agent-protocol-lock-';

interface DaemonState {
  agents: Agent[];
  resources: Resource[];
  tasks: Array<{ id: string; title: string; status: string; assigned_to: string | null }>;
  lead: string | null;
}

export class CursorAdapter {
  private agentId: string;
  private daemonUrl: string;
  private projectRoot: string;
  private role: 'lead' | 'specialist' | 'worker';
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stateRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private activeLockFiles: Set<string> = new Set();

  constructor(options: {
    agentId?: string;
    projectRoot: string;
    daemonPort?: number;
    role?: 'lead' | 'specialist' | 'worker';
  }) {
    this.agentId = options.agentId ?? 'cursor-1';
    this.projectRoot = resolve(options.projectRoot);
    this.daemonUrl = `http://localhost:${options.daemonPort ?? 4700}`;
    this.role = options.role ?? 'worker';
  }

  // ─── Lifecycle ──────────────────────────────────────────

  async connect(): Promise<void> {
    const res = await fetch(`${this.daemonUrl}/agents/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.agentId,
        tool: 'cursor',
        role: this.role,
        capabilities: ['code', 'refactor', 'review', 'inline-edit'],
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to register with daemon: ${await res.text()}`);
    }

    console.log(`  Cursor adapter connected as ${this.agentId} (${this.role})`);

    // Heartbeat every 25s (daemon timeout is 60s)
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${this.daemonUrl}/agents/${this.agentId}/heartbeat`, {
          method: 'POST',
        });
      } catch {
        // Daemon may be temporarily unavailable
      }
    }, 25000);

    // Refresh coordination state every 8 seconds
    this.stateRefreshInterval = setInterval(async () => {
      try {
        await this.syncState();
      } catch {
        // Non-critical — will retry on next cycle
      }
    }, 8000);

    // Initial sync
    await this.syncState();
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.stateRefreshInterval) clearInterval(this.stateRefreshInterval);

    // Clean up lock markers
    this.removeAllLockFiles();

    // Clean up .cursorrules injection
    this.removeRulesInjection();

    // Deregister from daemon
    try {
      await fetch(`${this.daemonUrl}/agents/${this.agentId}`, {
        method: 'DELETE',
      });
    } catch {
      // Daemon might already be down
    }

    console.log(`  Cursor adapter disconnected (${this.agentId})`);
  }

  // ─── Resource Operations ───────────────────────────────

  async claimFile(path: string, taskId?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.daemonUrl}/resources/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          agent_id: this.agentId,
          task_id: taskId,
        }),
      });
      const result = (await res.json()) as { granted: boolean; owner?: string; reason?: string };

      if (!result.granted) {
        console.log(`  Claim denied for ${path}: ${result.reason}`);
      }

      return result.granted;
    } catch {
      return false;
    }
  }

  async releaseFile(path: string): Promise<void> {
    try {
      await fetch(`${this.daemonUrl}/resources/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          agent_id: this.agentId,
        }),
      });
    } catch {
      // Non-critical
    }
  }

  /**
   * Force immediate state sync (bypasses 8s interval).
   * Used by integration tests for deterministic assertions.
   */
  async forceStateSync(): Promise<void> {
    await this.syncState();
  }

  // ─── State Synchronization ─────────────────────────────

  private async syncState(): Promise<void> {
    const stateRes = await fetch(`${this.daemonUrl}/state`);
    const state = (await stateRes.json()) as DaemonState;

    // Update .cursorrules with coordination info
    this.injectRules(state);

    // Update lock marker files
    this.syncLockFiles(state);
  }

  // ─── .cursorrules Injection ────────────────────────────

  private injectRules(state: DaemonState): void {
    const rulesPath = resolve(this.projectRoot, '.cursorrules');

    let content = '';
    if (existsSync(rulesPath)) {
      content = readFileSync(rulesPath, 'utf-8');
    }

    const section = this.buildRulesSection(state);

    if (content.includes(RULES_HEADER)) {
      const regex = new RegExp(
        `${RULES_HEADER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${RULES_FOOTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'm',
      );
      content = content.replace(regex, section);
    } else {
      content = content ? content + '\n\n' + section : section;
    }

    writeFileSync(rulesPath, content);
  }

  private buildRulesSection(state: DaemonState): string {
    const lines: string[] = [
      RULES_HEADER,
      '#',
      '# AGENT PROTOCOL — COORDINATION STATE',
      '# Auto-updated by the Agent Protocol daemon. Do not edit manually.',
      '#',
    ];

    // Other active agents
    const otherAgents = state.agents.filter(a => a.id !== this.agentId && a.status !== 'offline');
    if (otherAgents.length > 0) {
      lines.push('#');
      lines.push('# ACTIVE AGENTS:');
      for (const agent of otherAgents) {
        const role = agent.role === 'lead' ? ' [LEAD]' : '';
        lines.push(`#   ${agent.id} (${agent.tool})${role} — ${agent.status}`);
      }
    }

    // Files owned by OTHER agents — critical "do not touch" list
    const blockedFiles = state.resources.filter(
      r => r.state === 'claimed' && r.owner !== this.agentId
    );
    if (blockedFiles.length > 0) {
      lines.push('#');
      lines.push('# BLOCKED FILES — DO NOT EDIT (owned by other agents):');
      for (const r of blockedFiles) {
        lines.push(`#   ${r.path} → ${r.owner}`);
      }
      lines.push('#');
      lines.push('# If you need to modify a blocked file, wait for the owner to release it,');
      lines.push('# or ask the lead agent to reassign ownership.');
    }

    // Conflicted files
    const conflicts = state.resources.filter(r => r.state === 'conflicted');
    if (conflicts.length > 0) {
      lines.push('#');
      lines.push('# CONFLICTS — REQUIRES RESOLUTION:');
      for (const r of conflicts) {
        lines.push(`#   ${r.path} — CONFLICTED`);
      }
    }

    // Your claimed files
    const myFiles = state.resources.filter(
      r => r.state === 'claimed' && r.owner === this.agentId
    );
    if (myFiles.length > 0) {
      lines.push('#');
      lines.push('# YOUR CLAIMED FILES (safe to edit):');
      for (const r of myFiles) {
        lines.push(`#   ${r.path}`);
      }
    }

    // Active tasks
    const activeTasks = state.tasks.filter(
      t => t.status === 'in_progress' || t.status === 'assigned'
    );
    if (activeTasks.length > 0) {
      lines.push('#');
      lines.push('# ACTIVE TASKS:');
      for (const t of activeTasks) {
        const assignee = t.assigned_to ?? 'unassigned';
        const marker = t.assigned_to === this.agentId ? ' ← YOU' : '';
        lines.push(`#   [${t.status.toUpperCase()}] ${t.title} (${assignee})${marker}`);
      }
    }

    lines.push('#');
    lines.push(RULES_FOOTER);
    return lines.join('\n');
  }

  private removeRulesInjection(): void {
    const rulesPath = resolve(this.projectRoot, '.cursorrules');
    if (!existsSync(rulesPath)) return;

    let content = readFileSync(rulesPath, 'utf-8');
    const escapedHeader = RULES_HEADER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedFooter = RULES_FOOTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\n*${escapedHeader}[\\s\\S]*?${escapedFooter}\n*`, 'm');
    content = content.replace(regex, '');

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      // If .cursorrules was only our injection, remove the file
      unlinkSync(rulesPath);
    } else {
      writeFileSync(rulesPath, trimmed + '\n');
    }
  }

  // ─── Lock Marker Files ─────────────────────────────────

  /**
   * Create/remove lock marker files alongside blocked resources.
   * These are visible in Cursor's file explorer as a "don't touch" signal.
   *
   * Format: .agent-protocol-lock-<filename>
   * Content: which agent owns it and when to expect release
   */
  private syncLockFiles(state: DaemonState): void {
    const blockedFiles = state.resources.filter(
      r => r.state === 'claimed' && r.owner !== this.agentId
    );

    const currentLocks = new Set(blockedFiles.map(r => this.lockFilePath(r.path)));

    // Create new lock files
    for (const r of blockedFiles) {
      const lockPath = this.lockFilePath(r.path);
      if (!this.activeLockFiles.has(lockPath)) {
        const lockContent = [
          `LOCKED by ${r.owner}`,
          `File: ${r.path}`,
          `Since: ${r.claimed_at ? new Date(r.claimed_at).toISOString() : 'unknown'}`,
          '',
          'This file is being edited by another AI agent.',
          'Do not modify it until this lock file is removed.',
          'This marker is managed by the Agent Protocol daemon.',
        ].join('\n');

        try {
          writeFileSync(resolve(this.projectRoot, lockPath), lockContent);
        } catch {
          // Directory might not exist — non-critical
        }
      }
    }

    // Remove stale lock files
    for (const lockPath of this.activeLockFiles) {
      if (!currentLocks.has(lockPath)) {
        try {
          const absPath = resolve(this.projectRoot, lockPath);
          if (existsSync(absPath)) {
            unlinkSync(absPath);
          }
        } catch {
          // Non-critical
        }
      }
    }

    this.activeLockFiles = currentLocks;
  }

  private lockFilePath(resourcePath: string): string {
    const dir = dirname(resourcePath);
    const name = basename(resourcePath);
    return join(dir, `${LOCK_PREFIX}${name}`);
  }

  private removeAllLockFiles(): void {
    for (const lockPath of this.activeLockFiles) {
      try {
        const absPath = resolve(this.projectRoot, lockPath);
        if (existsSync(absPath)) {
          unlinkSync(absPath);
        }
      } catch {
        // Non-critical cleanup
      }
    }
    this.activeLockFiles.clear();
  }
}
