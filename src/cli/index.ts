#!/usr/bin/env node
/**
 * CLI Interface for Agent Protocol
 *
 * Commands:
 *   init     - Initialize protocol in current project
 *   start    - Start the daemon
 *   stop     - Stop the daemon
 *   status   - Show daemon status
 *   agents   - List registered agents
 *   resources - List tracked resources
 *   tasks    - List tasks
 *   log      - View event log
 *   resolve  - Resolve a file conflict
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Daemon } from '../index.js';
import { DEFAULT_CONFIG, type Agent, type Resource, type Task, type ProtocolEvent } from '../core/types.js';

interface StatusResponse {
  version: string;
  project: string;
  port: number;
  agents: { total: number; active: number; lead: string | null };
  resources: { total: number; claimed: number; conflicted: number };
  tasks: { total: number; in_progress: number; done: number };
  event_count: number;
}

const program = new Command();

program
  .name('agent-protocol')
  .description('Cross-tool coordination protocol for AI coding agents')
  .version('0.1.0');

// ─── Init ──────────────────────────────────────────────

program
  .command('init')
  .description('Initialize agent-protocol in the current project')
  .action(() => {
    const cwd = process.cwd();
    const protocolDir = resolve(cwd, '.agent-protocol');

    if (existsSync(protocolDir)) {
      console.log('  Already initialized in this project.');
      return;
    }

    mkdirSync(protocolDir, { recursive: true });

    const config = {
      ...DEFAULT_CONFIG,
      project: cwd.split(/[/\\]/).pop() ?? 'unnamed',
    };

    writeFileSync(
      resolve(protocolDir, 'config.json'),
      JSON.stringify(config, null, 2),
    );

    console.log(`\n  Initialized agent-protocol in ${protocolDir}`);
    console.log(`  Config: ${resolve(protocolDir, 'config.json')}`);
    console.log(`\n  Next: run 'agent-protocol start' to launch the daemon\n`);
  });

// ─── Start ─────────────────────────────────────────────

program
  .command('start')
  .description('Start the coordination daemon')
  .option('-p, --port <port>', 'Port to listen on', '4700')
  .action(async (opts) => {
    const daemon = new Daemon({
      projectRoot: process.cwd(),
      config: {
        project: process.cwd().split(/[/\\]/).pop() ?? 'unnamed',
        port: parseInt(opts.port),
      },
    });

    await daemon.start();

    process.on('SIGINT', async () => {
      await daemon.stop();
      process.exit(0);
    });
  });

// ─── Status ────────────────────────────────────────────

program
  .command('status')
  .description('Show daemon status')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://localhost:${opts.port}/status`);
      const data = (await res.json()) as StatusResponse;
      console.log(`\n  Agent Protocol v${data.version}`);
      console.log(`  Project: ${data.project}`);
      console.log(`  Port: ${data.port}`);
      console.log(`\n  Agents: ${data.agents.active} active (lead: ${data.agents.lead ?? 'none'})`);
      console.log(`  Resources: ${data.resources.total} tracked, ${data.resources.claimed} claimed, ${data.resources.conflicted} conflicted`);
      console.log(`  Tasks: ${data.tasks.in_progress} in progress, ${data.tasks.done} done`);
      console.log(`  Events: ${data.event_count} total\n`);
    } catch {
      console.log('\n  Daemon not running. Start with: agent-protocol start\n');
    }
  });

// ─── Agents ────────────────────────────────────────────

program
  .command('agents')
  .description('List registered agents')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://localhost:${opts.port}/agents`);
      const agents = (await res.json()) as Agent[];

      if (agents.length === 0) {
        console.log('\n  No agents registered.\n');
        return;
      }

      console.log(`\n  Agents (${agents.length}):\n`);
      for (const a of agents) {
        const role = a.role === 'lead' ? ' [LEAD]' : '';
        console.log(`    ${a.id} (${a.tool})${role} — ${a.status}`);
      }
      console.log();
    } catch {
      console.log('\n  Daemon not running.\n');
    }
  });

// ─── Resources ─────────────────────────────────────────

program
  .command('resources')
  .description('List tracked resources')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .option('--claimed', 'Show only claimed resources')
  .option('--conflicted', 'Show only conflicted resources')
  .action(async (opts) => {
    try {
      let url = `http://localhost:${opts.port}/resources`;
      if (opts.claimed) url += '?filter=claimed';
      if (opts.conflicted) url += '?filter=conflicted';

      const res = await fetch(url);
      const resources = (await res.json()) as Resource[];

      if (resources.length === 0) {
        console.log('\n  No tracked resources.\n');
        return;
      }

      console.log(`\n  Resources (${resources.length}):\n`);
      for (const r of resources) {
        const owner = r.owner ? ` → ${r.owner}` : '';
        const state = r.state.toUpperCase();
        console.log(`    [${state}] ${r.path}${owner}`);
      }
      console.log();
    } catch {
      console.log('\n  Daemon not running.\n');
    }
  });

// ─── Tasks ─────────────────────────────────────────────

program
  .command('tasks')
  .description('List tasks')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://localhost:${opts.port}/tasks`);
      const tasks = (await res.json()) as Task[];

      if (tasks.length === 0) {
        console.log('\n  No tasks.\n');
        return;
      }

      console.log(`\n  Tasks (${tasks.length}):\n`);
      for (const t of tasks) {
        const assignee = t.assigned_to ? ` → ${t.assigned_to}` : ' (unassigned)';
        console.log(`    [${t.status.toUpperCase()}] ${t.title}${assignee}`);
      }
      console.log();
    } catch {
      console.log('\n  Daemon not running.\n');
    }
  });

// ─── Log ───────────────────────────────────────────────

program
  .command('log')
  .description('View event log')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .option('-n, --limit <n>', 'Number of events', '20')
  .option('--agent <id>', 'Filter by agent')
  .option('--resource <path>', 'Filter by resource')
  .action(async (opts) => {
    try {
      const params = new URLSearchParams();
      params.set('limit', opts.limit);
      if (opts.agent) params.set('agent_id', opts.agent);
      if (opts.resource) params.set('resource', opts.resource);

      const res = await fetch(`http://localhost:${opts.port}/events?${params}`);
      const events = (await res.json()) as ProtocolEvent[];

      if (events.length === 0) {
        console.log('\n  No events.\n');
        return;
      }

      console.log(`\n  Event Log (last ${events.length}):\n`);
      for (const e of events.reverse()) {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const resource = e.resource ? ` on ${e.resource}` : '';
        console.log(`    ${time} | ${e.agent_id} | ${e.action}${resource}`);
      }
      console.log();
    } catch {
      console.log('\n  Daemon not running.\n');
    }
  });

// ─── Resolve ───────────────────────────────────────────

program
  .command('resolve <path>')
  .description('Resolve a file conflict')
  .option('-p, --port <port>', 'Daemon port', '4700')
  .option('--pick <agent_id>', 'Pick one agent\'s version')
  .action(async (path, opts) => {
    if (!opts.pick) {
      console.log('\n  Usage: agent-protocol resolve <path> --pick <agent_id>\n');
      return;
    }

    try {
      // Use the events endpoint to resolve
      const res = await fetch(`http://localhost:${opts.port}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: 'cli',
          action: 'resource.conflict_resolved',
          resource: path,
          metadata: { resolution: 'pick', picked_agent: opts.pick },
        }),
      });

      if (res.ok) {
        console.log(`\n  Conflict resolved for ${path} — picked ${opts.pick}'s version\n`);
      } else {
        console.log('\n  Failed to resolve conflict.\n');
      }
    } catch {
      console.log('\n  Daemon not running.\n');
    }
  });

program.parse();
