/**
 * Claude Code Adapter
 *
 * Connects Claude Code to the Agent Protocol daemon.
 * Strategy: Injects coordination state into CLAUDE.md so Claude Code
 * is aware of what other agents are doing without any modification
 * to Claude Code itself.
 *
 * How it works:
 * 1. Registers Claude Code as an agent with the daemon
 * 2. Watches for file changes by Claude Code
 * 3. Injects resource ownership info into CLAUDE.md
 * 4. Sends periodic heartbeats
 * 5. Creates .agent-protocol-blocked markers when files are owned by other agents
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Resource, Agent } from '../core/types.js';

const COORDINATION_HEADER = '<!-- AGENT-PROTOCOL:START -->';
const COORDINATION_FOOTER = '<!-- AGENT-PROTOCOL:END -->';

interface DaemonState {
  agents: Agent[];
  resources: Resource[];
  lead: string | null;
}

export class ClaudeCodeAdapter {
  private agentId: string;
  private daemonUrl: string;
  private projectRoot: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stateRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    agentId?: string;
    projectRoot: string;
    daemonPort?: number;
    role?: 'lead' | 'specialist' | 'worker';
  }) {
    this.agentId = options.agentId ?? 'claude-code-1';
    this.projectRoot = options.projectRoot;
    this.daemonUrl = `http://localhost:${options.daemonPort ?? 4700}`;
  }

  async connect(): Promise<void> {
    // Register with daemon
    const res = await fetch(`${this.daemonUrl}/agents/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.agentId,
        tool: 'claude-code',
        role: 'lead',
        capabilities: ['code', 'review', 'test', 'refactor'],
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to register: ${await res.text()}`);
    }

    console.log(`  Claude Code adapter connected as ${this.agentId}`);

    // Start heartbeat
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${this.daemonUrl}/agents/${this.agentId}/heartbeat`, {
          method: 'POST',
        });
      } catch {
        // Daemon might be down — will reconnect
      }
    }, 25000);

    // Start state injection into CLAUDE.md
    this.stateRefreshInterval = setInterval(async () => {
      try {
        await this.injectStateIntoCLAUDEMD();
      } catch {
        // Non-critical — next refresh will try again
      }
    }, 10000);

    // Initial injection
    await this.injectStateIntoCLAUDEMD();
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.stateRefreshInterval) clearInterval(this.stateRefreshInterval);

    try {
      await fetch(`${this.daemonUrl}/agents/${this.agentId}`, {
        method: 'DELETE',
      });
    } catch {
      // Daemon might already be down
    }

    // Clean up CLAUDE.md injection
    this.removeStateFromCLAUDEMD();
  }

  /**
   * Claim a file before modifying it
   */
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
      const result = (await res.json()) as { granted: boolean };
      return result.granted;
    } catch {
      return false;
    }
  }

  /**
   * Release a file after finishing
   */
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
   * Force immediate state sync (bypasses 10s interval).
   * Used by integration tests for deterministic assertions.
   */
  async forceStateSync(): Promise<void> {
    await this.injectStateIntoCLAUDEMD();
  }

  /**
   * Inject current coordination state into CLAUDE.md
   * This is the key mechanism — Claude Code reads CLAUDE.md before acting,
   * so it becomes aware of other agents' activities.
   */
  private async injectStateIntoCLAUDEMD(): Promise<void> {
    const claudeMdPath = resolve(this.projectRoot, 'CLAUDE.md');

    // Read existing CLAUDE.md
    let content = '';
    if (existsSync(claudeMdPath)) {
      content = readFileSync(claudeMdPath, 'utf-8');
    }

    // Fetch current state from daemon
    const stateRes = await fetch(`${this.daemonUrl}/state`);
    const state = (await stateRes.json()) as DaemonState;

    // Build coordination section
    const section = this.buildCoordinationSection(state);

    // Replace or append coordination section
    if (content.includes(COORDINATION_HEADER)) {
      const regex = new RegExp(
        `${COORDINATION_HEADER}[\\s\\S]*?${COORDINATION_FOOTER}`,
        'm',
      );
      content = content.replace(regex, section);
    } else {
      content = content + '\n\n' + section;
    }

    writeFileSync(claudeMdPath, content);
  }

  private buildCoordinationSection(state: DaemonState): string {
    const lines: string[] = [
      COORDINATION_HEADER,
      '',
      '## Agent Protocol — Coordination State',
      '',
      '> This section is auto-updated by the Agent Protocol daemon.',
      '> DO NOT manually edit between the AGENT-PROTOCOL markers.',
      '',
    ];

    // Other agents
    const otherAgents = state.agents.filter(a => a.id !== this.agentId);
    if (otherAgents.length > 0) {
      lines.push('### Active Agents');
      for (const agent of otherAgents) {
        const role = agent.role === 'lead' ? ' [LEAD]' : '';
        lines.push(`- **${agent.id}** (${agent.tool})${role} — status: ${agent.status}`);
      }
      lines.push('');
    }

    // Claimed resources by OTHER agents (critical info)
    const othersResources = state.resources.filter(
      r => r.state === 'claimed' && r.owner !== this.agentId
    );
    if (othersResources.length > 0) {
      lines.push('### ⚠️ DO NOT EDIT — Files Owned by Other Agents');
      lines.push('');
      lines.push('The following files are currently being edited by other agents.');
      lines.push('**DO NOT modify these files** — wait for them to be released.');
      lines.push('');
      for (const r of othersResources) {
        lines.push(`- \`${r.path}\` → owned by **${r.owner}**`);
      }
      lines.push('');
    }

    // Conflicted resources
    const conflicts = state.resources.filter(r => r.state === 'conflicted');
    if (conflicts.length > 0) {
      lines.push('### 🔴 CONFLICTS — Requires Resolution');
      for (const r of conflicts) {
        lines.push(`- \`${r.path}\` — CONFLICTED, do not touch`);
      }
      lines.push('');
    }

    // Your claimed resources
    const myResources = state.resources.filter(
      r => r.state === 'claimed' && r.owner === this.agentId
    );
    if (myResources.length > 0) {
      lines.push('### Your Claimed Files');
      for (const r of myResources) {
        lines.push(`- \`${r.path}\``);
      }
      lines.push('');
    }

    lines.push(COORDINATION_FOOTER);
    return lines.join('\n');
  }

  private removeStateFromCLAUDEMD(): void {
    const claudeMdPath = resolve(this.projectRoot, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) return;

    let content = readFileSync(claudeMdPath, 'utf-8');
    const regex = new RegExp(
      `\n*${COORDINATION_HEADER}[\\s\\S]*?${COORDINATION_FOOTER}\n*`,
      'm',
    );
    content = content.replace(regex, '');
    writeFileSync(claudeMdPath, content.trim() + '\n');
  }
}
