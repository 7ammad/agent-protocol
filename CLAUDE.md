# Agent Protocol — Claude Code Context

> **Auto-read by Claude Code before every action. Keep this file updated.**
> **For the big picture (portfolio vision, strategy, decisions), read `../CLAUDE.md` first.**

## What This Project Is

Project #1 in the MTM open-source AI portfolio. An open-source cross-tool coordination protocol and runtime for AI coding agents. When multiple AI agents (Claude Code, Cursor, Codex, OpenClaw) work on the same codebase, they overwrite files, duplicate work, lose context, and ignore hierarchy. No existing protocol solves this. This project does.

**Creator**: Hammad Al Habib (MTM), Riyadh, Saudi Arabia.
**Name**: TBD — using `agent-protocol` as placeholder. Branding deferred to separate workstream.
**PRD**: `../docs/PRD-001-agent-protocol.md` (+ .docx)
**Protocol Spec**: `../research/10-protocol-spec-v0.1.md`

---

## The Five Failure Modes This Solves

| # | Failure | Solution |
|---|---------|----------|
| F1 | File Conflict — two agents edit same file | Resource ownership (claim before edit) |
| F2 | Duplicated Work — agents redo each other's work | Task tracking (agents see what others work on) |
| F3 | Context Blindness — agents don't know what others did | State injection into CLAUDE.md / .cursorrules |
| F4 | Authority Violation — workers ignore lead | Lead hierarchy with explicit powers |
| F5 | Silent Handoff — agent finishes, nobody knows | Structured handoff protocol with context |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Agent Protocol Daemon                │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │  HTTP API    │  │  Event Bus  │  │  File Watcher│ │
│  │  (Express)   │  │  (SSE)      │  │  (chokidar)  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘ │
│         │                │                 │         │
│  ┌──────┴────────────────┴─────────────────┴───────┐ │
│  │              State Manager (in-memory)           │ │
│  │  Agent Registry │ Resource Tracker │ Task Mgr    │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────┴──────────────────────────┐ │
│  │  Event Store (SQLite, append-only, WAL mode)    │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
         ▲                    ▲
         │                    │
   ┌─────┴──────┐     ┌──────┴─────┐
   │ Claude Code │     │  Cursor    │
   │ Adapter     │     │  Adapter   │
   │ (CLAUDE.md) │     │ (.rules)   │
   └────────────┘     └────────────┘
```

**Key decisions:**
- SQLite over Postgres/Redis (zero dependency for MVP)
- In-memory state + SQLite persistence (fast reads, durable writes)
- File watcher as primary detection (non-invasive)
- CLAUDE.md injection for Claude Code awareness
- .cursorrules injection + lock marker files for Cursor
- Express HTTP API on localhost:4700
- SSE for real-time event streaming
- Apache-2.0 license

---

## File Tree (current)

```
agent-protocol/
├── package.json              # ESM, type: "module"
├── tsconfig.json             # ES2022, strict, Node16 modules
├── README.md
├── HANDOFF.md                # Session handoff state
├── CLAUDE.md                 # THIS FILE
├── src/
│   ├── index.ts              # Daemon entry — wires EventStore + StateManager + API + FileWatcher
│   ├── core/
│   │   ├── types.ts          # All interfaces: Agent, Resource, Task, Event, Handoff, Config
│   │   ├── event-store.ts    # Append-only SQLite event log with real-time subscriptions
│   │   └── state-manager.ts  # In-memory state: agent registry, resource ownership, conflicts, tasks, handoffs
│   ├── api/
│   │   └── server.ts         # Express HTTP API (21 endpoints) + SSE event stream
│   ├── watchers/
│   │   └── file-watcher.ts   # Chokidar file system observer with hash-based change detection
│   ├── adapters/
│   │   ├── claude-code-adapter.ts  # Injects state into CLAUDE.md
│   │   └── cursor-adapter.ts      # Injects state into .cursorrules + lock markers
│   └── cli/
│       └── index.ts          # CLI: init, start, status, agents, resources, tasks, log, resolve
└── tests/
    └── e2e.test.ts           # 17 tests: all 5 failure modes + SSE + full multi-agent scenario
```

---

## Core Types (implemented in src/core/types.ts)

```typescript
// Agent — any AI coding tool instance
interface Agent {
  id: string;              // e.g., "claude-code-1", "cursor-1"
  tool: AgentTool;         // "claude-code" | "cursor" | "copilot" | "codex" | "openclaw" | string
  role: AgentRole;         // "lead" | "specialist" | "worker"
  status: AgentStatus;     // "idle" | "working" | "blocked" | "waiting_review" | "offline"
  current_task: string | null;
  capabilities: string[];
  joined_at: number;
  last_heartbeat: number;
}

// Resource — any tracked file
interface Resource {
  path: string;            // Relative from project root
  state: ResourceState;    // "free" | "claimed" | "locked" | "conflicted"
  owner: string | null;
  claimed_at: number | null;
  last_modified_by: string | null;
  content_hash: string;    // SHA-256 truncated to 16 chars
}

// Task — unit of work
interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  assigned_by: string;
  status: TaskStatus;      // "queued" | "assigned" | "in_progress" | "review" | "done" | "blocked"
  resources: string[];
  depends_on: string[];
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

// Event — immutable action record (append-only)
interface ProtocolEvent {
  id: string;
  timestamp: number;
  agent_id: string;
  action: EventAction;     // 19 action types (agent.*, resource.*, task.*, handoff.*, authority.*)
  resource: string | null;
  task_id: string | null;
  before_hash: string | null;
  after_hash: string | null;
  metadata: Record<string, unknown>;
}

// Handoff — structured work transfer
interface Handoff {
  id: string;
  from_agent: string;
  to_agent: string | null;
  task_id: string;
  status: HandoffStatus;   // "pending" | "accepted" | "rejected"
  summary: string;
  files_modified: string[];
  files_created: string[];
  context: string;
  blockers: string[];
  created_at: number;
}
```

---

## API Endpoints (implemented in src/api/server.ts)

```
POST /agents/announce          Register agent
POST /agents/:id/heartbeat    Liveness signal
DELETE /agents/:id             Deregister
GET  /agents                   List agents

POST /resources/claim          Claim file (returns {granted, owner?, reason?})
POST /resources/release        Release file
GET  /resources                List resources (?filter=claimed|conflicted)

POST /tasks                    Create task
PATCH /tasks/:id               Update task status
GET  /tasks                    List tasks

POST /handoffs                 Create handoff
PATCH /handoffs/:id/accept     Accept handoff
PATCH /handoffs/:id/reject     Reject handoff

POST /events                   Log event
GET  /events                   Query events (?limit, ?agent_id, ?resource, ?action)
GET  /events/stream            SSE real-time stream

GET  /state                    Full state snapshot
GET  /status                   Daemon health + summary
```

---

## Authority Hierarchy

```
LEAD (one per session)
 ├── SPECIALIST (domain expert)
 └── WORKER (executes assigned tasks)
```

- Lead assigns tasks, resolves conflicts, locks resources, overrides decisions
- Dead lead (no heartbeat >60s) → auto-promote highest specialist, then longest worker
- No negotiation — lead decides, workers execute. Speed over democracy.

---

## Resource Ownership Protocol

1. Agent calls `POST /resources/claim {path, agent_id}`
2. Daemon checks: free → grant; claimed by other → deny; locked → deny; conflicted → deny
3. Agent edits file
4. Agent calls `POST /resources/release {path, agent_id}`
5. File watcher detects unauthorized edits → conflict detection

---

## What's Built & Working

- **Daemon** (index.ts): starts HTTP server, file watcher, heartbeat checker
- **Event Store** (event-store.ts): SQLite WAL mode, append-only, real-time subscriptions
- **State Manager** (state-manager.ts): in-memory agent/resource/task/handoff tracking, conflict detection, dead agent cleanup, lead promotion
- **API Server** (server.ts): all 21 endpoints + SSE
- **File Watcher** (file-watcher.ts): chokidar-based, hash change detection, ownership-aware logging
- **Claude Code Adapter** (claude-code-adapter.ts): CLAUDE.md state injection, heartbeat, claim/release
- **Cursor Adapter** (cursor-adapter.ts): .cursorrules injection, lock marker files, state sync
- **CLI** (cli/index.ts): init, start, status, agents, resources, tasks, log, resolve
- **E2E Tests** (e2e.test.ts): 17 tests, all passing, covers all 5 failure modes

**Build status**: Clean `tsc` build, all tests pass.

---

## What Needs to Happen Next

See `docs/IMPLEMENTATION-PLAN.md` for the full prioritized implementation plan with file lists, specs, and pre-launch checklist.

**Summary of next priorities:**
1. Integration tests — prove adapters work against live daemon (spec: `docs/PHASE1-INTEGRATION-TEST-SPEC.md`)
2. Web dashboard — vanilla HTML/CSS/JS, Liquid Glass Design System (spec: `docs/PHASE2-DASHBOARD-SPEC.md`)
3. Cursor VS Code extension skeleton
4. Codex adapter
5. Config file support, conflict resolution UI
6. Pre-launch: branding, LICENSE file, README expansion, whitepaper, npm publish, GitHub launch

---

## Protocol Specification Reference

Full spec in `research/10-protocol-spec-v0.1.md`. Key sections:
- §1: Problem Statement (5 failure modes with frequency analysis)
- §2: Design Principles (non-invasive, file-system-first, append-only truth, authority explicit, fail-safe)
- §3: Core Concepts (Agent, Resource, Task, Event interfaces)
- §4: Authority Hierarchy (lead/specialist/worker, no negotiation, dead lead promotion)
- §5: Resource Ownership Protocol (claim/release/implicit claiming/conflict detection)
- §6: Handoff Protocol (structured transfer with summary, files, context, blockers)
- §7: State Synchronization (event-driven, read-before-write)
- §8: Adapter Interface (minimum required + optional extended interface)
- §9: Daemon Architecture (diagram, MVP simplification, all API endpoints)
- §10: Conflict Resolution (detection rules, resolution flow, future auto-merge)
- §11: Configuration (config schema, .agent-protocol directory structure)
- §12: CLI Interface (all commands)
- §14: Scope Boundaries (v0.1 in-scope vs v0.2+ out-of-scope)

## Build Plan Reference

Full plan in `research/08-build-plan.md`. Phases:
- Phase 0: Protocol Design (done)
- Phase 1: MVP Build — daemon, adapters, dashboard (in progress — daemon + adapters done)
- Phase 2: Whitepaper + Blog
- Phase 3: Launch (GitHub, HN, X, Reddit)
- Phase 4: Community + Revenue

Revenue targets: $3-5K MRR month 3, $8-15K month 6, $20-40K month 12.
Tech stack: Node.js/TypeScript, SQLite, chokidar, Express, Vitest.

---

## How to Run

```bash
cd agent-protocol
pnpm install
pnpm build             # Compile TypeScript
pnpm test              # Run 17 e2e tests (Vitest)
pnpm dev               # Start daemon in watch mode
pnpm cli -- start      # Start daemon via CLI
pnpm cli -- status     # Check daemon status
```

---

## Design Principle (CRITICAL)

**Non-invasive.** Agents don't need modification. The protocol observes from outside via adapters that use file watchers, CLAUDE.md injection, .cursorrules injection, VS Code extension API, and file markers. The agents don't know they're being coordinated — they just see updated context files and blocked markers.
