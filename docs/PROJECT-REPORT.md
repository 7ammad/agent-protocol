# Agent Protocol — Project Report

**Date:** February 20, 2026
**Author:** Hammad Al Habib (MTM)
**Location:** Riyadh, Saudi Arabia
**License:** Apache 2.0

---

## Executive Summary

Agent Protocol is an open-source cross-tool coordination protocol and runtime for AI coding agents. It solves a critical unsolved problem: when multiple AI agents (Claude Code, Cursor, Codex, Copilot) work on the same codebase simultaneously, they overwrite files, duplicate work, lose context, and ignore hierarchy. No existing protocol addresses this.

Agent Protocol provides a **shared state layer** — resource ownership, conflict detection, authority hierarchy, and structured handoffs — without requiring any modification to the agents themselves.

**Current status:** Core protocol complete. 21 API endpoints, 2 adapters (Claude Code + Cursor), real-time dashboard, 21 passing tests. Pre-launch phase.

---

## 1. What Is Agent Protocol?

### The Problem

Multi-agent AI development is exploding. Developers now routinely use 2-4 AI coding agents on the same project. But these agents have no awareness of each other:

| # | Failure Mode | Frequency | Impact |
|---|---|---|---|
| F1 | **File Conflicts** — Two agents edit the same file | Very common | Lost work, merge conflicts |
| F2 | **Duplicated Work** — Agents redo each other's tasks | Common | Wasted time, contradictory code |
| F3 | **Context Blindness** — No awareness of what others did | Always | Reverted changes, broken features |
| F4 | **Authority Violation** — Workers ignore the lead agent | Common | Chaotic, uncoordinated output |
| F5 | **Silent Handoffs** — Agent finishes, nobody knows | Common | Blocked workflows, stale state |

### The Solution

Agent Protocol runs as a lightweight local daemon that:

1. **Tracks resource ownership** — agents must claim files before editing
2. **Prevents conflicts** — second agent is denied if file is already claimed
3. **Shares context** — injects current state into each agent's context file (CLAUDE.md, .cursorrules)
4. **Enforces hierarchy** — lead agent assigns tasks, resolves disputes
5. **Structures handoffs** — when one agent finishes, the next gets full context

### How It Works (Non-Invasive)

The key design principle is **non-invasive coordination**. Agents don't need modification. The protocol works through:

- **File watchers** — detect what agents are doing by monitoring file changes
- **Context injection** — write state into files agents already read (CLAUDE.md, .cursorrules)
- **Lock markers** — signal "do not edit" through files agents can see
- **HTTP API** — adapters communicate with the daemon on `localhost:4700`

The agents don't know they're being coordinated — they just see updated context files.

---

## 2. How To Use It

### Quick Start

```bash
# Install and initialize in your project
npx agent-protocol init

# Start the coordination daemon
npx agent-protocol start

# Check status
npx agent-protocol status

# Open the dashboard
# Visit http://localhost:4700/dashboard
```

### Daily Workflow

1. **Start the daemon** before your coding session: `npx agent-protocol start`
2. **Launch your agents** — Claude Code, Cursor, etc. as normal
3. **Adapters auto-register** each agent with the daemon
4. **Monitor in dashboard** at `http://localhost:4700/dashboard` — see agents, file ownership, tasks, events in real-time
5. **Conflicts are prevented** — if Agent B tries to edit a file Agent A is working on, it's blocked
6. **Handoffs are structured** — when one agent finishes, the next gets context about what changed

### CLI Commands

| Command | Description |
|---|---|
| `agent-protocol init` | Initialize protocol in your project |
| `agent-protocol start` | Start the coordination daemon |
| `agent-protocol stop` | Stop the daemon |
| `agent-protocol status` | Show daemon health and summary |
| `agent-protocol agents` | List registered agents |
| `agent-protocol resources` | List tracked files and ownership |
| `agent-protocol tasks` | List tasks and assignments |
| `agent-protocol log` | View the event log |
| `agent-protocol resolve <file>` | Manually resolve a file conflict |

### API (for adapter/tool developers)

The daemon exposes 21 RESTful endpoints on `localhost:4700`:

- **Agents**: Register, heartbeat, deregister, list
- **Resources**: Claim file, release file, list (filter by state)
- **Tasks**: Create, update status, list
- **Handoffs**: Create, accept, reject
- **Events**: Log event, query events, SSE real-time stream
- **State**: Full snapshot, daemon health

Full API documentation: `docs/API-CONTRACTS.md`

---

## 3. Architecture

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

**Technology choices:**

| Component | Technology | Rationale |
|---|---|---|
| Runtime | Node.js / TypeScript | Zero-dependency setup for open-source adoption |
| Database | SQLite (WAL mode) | No external DB needed — single file, instant setup |
| State | In-memory + SQLite | Fast reads from memory, durable writes to disk |
| File watching | chokidar | Industry-standard, cross-platform file observer |
| API | Express HTTP | Simple, proven, lightweight |
| Real-time | Server-Sent Events (SSE) | One-way streaming, no WebSocket complexity |
| Testing | Vitest | Fast, TypeScript-native |

---

## 4. What's Built (Current State)

### Phase 1: Core Protocol — Complete

| Component | Status | Details |
|---|---|---|
| Daemon entry | Done | Wires all subsystems, starts on `localhost:4700` |
| Type system | Done | Full TypeScript interfaces for Agent, Resource, Task, Event, Handoff |
| Event store | Done | Append-only SQLite, WAL mode, real-time subscriptions |
| State manager | Done | In-memory state, conflict detection, dead agent cleanup, lead promotion |
| HTTP API | Done | 21 endpoints + SSE event stream |
| File watcher | Done | SHA-256 hash change detection, ownership-aware |
| Claude Code adapter | Done | CLAUDE.md state injection, heartbeat, claim/release |
| Cursor adapter | Done | .cursorrules injection, lock marker files |
| CLI | Done | 9 commands: init, start, stop, status, agents, resources, tasks, log, resolve |
| E2E tests | Done | 17 tests covering all 5 failure modes |

### Phase 1.5: Integration Tests — Complete

| Component | Status | Details |
|---|---|---|
| Integration test suite | Done | 4 Vitest scenarios against live daemon |
| Adapter standalone runners | Done | `pnpm adapter:claude` and `pnpm adapter:cursor` |

**Total test count:** 21 tests (17 e2e + 4 integration), all passing.

### Phase 2: Web Dashboard — Complete

| Component | Status | Details |
|---|---|---|
| Dashboard UI | Done | Vanilla HTML/CSS/JS, no build step required |
| Agent cards | Done | Status dots, tool/role badges, heartbeat display |
| File tree view | Done | Grouped by state, conflict banners, owner badges |
| Event timeline | Done | Real-time via SSE, human-readable event names |
| Task board | Done | Kanban columns with relative timestamps |
| Design system | Done | Liquid Glass dark theme |

**Dashboard URL:** `http://localhost:4700/dashboard`

### Phase 3+: Future Work — Not Started

| Item | Status | Notes |
|---|---|---|
| Cursor VS Code Extension | Not started | No spec yet |
| Codex Adapter | Not started | Needs Codex context injection research |
| Config file loading | Partial | Schema exists, init writes config, daemon doesn't load it yet |
| Conflict Resolution UI | Not started | No spec yet |

---

## 5. The Value Proposition

### For Individual Developers

- **Stop losing work** — no more file overwrites between agents
- **Ship faster** — agents coordinate instead of conflicting
- **See everything** — real-time dashboard shows what every agent is doing
- **Zero setup friction** — `npx agent-protocol init` and you're running

### For Teams

- **Scale multi-agent workflows** — run 3-5 agents on the same codebase safely
- **Audit trail** — every agent action is logged as an immutable event
- **Authority control** — lead agent assigns and arbitrates, workers execute
- **Structured handoffs** — no more "what did the last agent do?"

### For the Market

- **First mover** — no cross-tool agent coordination protocol exists today
- **Tool-agnostic** — works with Claude Code, Cursor, Codex, Copilot, and any future agent
- **Open-source** — Apache 2.0 license, community-driven adapter ecosystem
- **Non-invasive** — agents don't need modification, protocol observes from outside

### Market Context

- Multi-agent development is mainstream — developers routinely use 2-4 AI tools daily
- 1,445% surge in multi-agent coordination inquiries (2024-2025)
- No existing protocol (A2A, MCP, CrewAI, LangGraph) solves cross-tool file-level coordination
- Existing solutions focus on agent-to-agent communication, not shared workspace state

---

## 6. Revenue Model

### Open-Source Core (Free)

- Daemon, adapters, CLI, dashboard
- Community adapters for any AI tool
- Self-hosted, runs locally

### Managed Cloud ($29-99/month)

- Hosted daemon for teams
- Cross-machine coordination
- Analytics and reporting
- No self-hosting required

### Enterprise ($500-2,000/month)

- Custom adapters for internal tools
- SSO / RBAC integration
- Audit trail export for compliance
- Priority support and SLAs

### Revenue Targets

| Milestone | Target | How |
|---|---|---|
| Month 3 | $3-5K MRR | Consulting on multi-agent workflows |
| Month 6 | $8-15K MRR | Consulting + early SaaS subscribers |
| Month 12 | $20-40K MRR | SaaS + enterprise pilots |

---

## 7. Pre-Launch Checklist

| # | Item | Status | Blocking? |
|---|---|---|---|
| 1 | Core protocol + tests | Done | — |
| 2 | Integration tests | Done | — |
| 3 | Web dashboard | Done | — |
| 4 | **Project name / branding** | **TBD** | **Yes — blocks npm, GitHub, domain** |
| 5 | LICENSE file | Done | — |
| 6 | README.md | Done (basic) | Needs expansion for launch |
| 7 | CONTRIBUTING.md | Not created | Nice-to-have |
| 8 | Technical whitepaper | Not started | For HN/X launch |
| 9 | npm package testing | Partial | Needs end-to-end `npx` testing |
| 10 | .gitignore audit | Not checked | Before public repo |

### Critical Blocker

**Project name is TBD.** "agent-protocol" is a placeholder. The final name blocks: npm package name, GitHub repo URL, domain registration, all marketing materials. This decision must happen before public launch.

---

## 8. Competitive Landscape

| Solution | What It Does | What It Doesn't Do |
|---|---|---|
| Google A2A | Agent-to-agent communication protocol | No file-level coordination, no resource ownership |
| Anthropic MCP | Model-to-tool communication | No multi-agent awareness, no conflict prevention |
| CrewAI / LangGraph | Multi-agent orchestration frameworks | Same-framework only, no cross-tool coordination |
| **Agent Protocol** | **Cross-tool shared state + coordination** | **The only solution for cross-tool file-level coordination** |

---

## 9. File Structure

```
agent-protocol/
├── package.json              # ESM, type: "module", Apache-2.0
├── tsconfig.json             # ES2022, strict, Node16 modules
├── README.md                 # Public-facing README
├── LICENSE                   # Apache 2.0
├── CLAUDE.md                 # Technical context for AI agents
├── HANDOFF.md                # Session continuity state
├── src/
│   ├── index.ts              # Daemon entry point
│   ├── core/
│   │   ├── types.ts          # All TypeScript interfaces
│   │   ├── event-store.ts    # Append-only SQLite event log
│   │   └── state-manager.ts  # In-memory state engine
│   ├── api/
│   │   └── server.ts         # Express HTTP API (21 endpoints + SSE)
│   ├── watchers/
│   │   └── file-watcher.ts   # chokidar file system observer
│   ├── adapters/
│   │   ├── claude-code-adapter.ts   # CLAUDE.md state injection
│   │   ├── cursor-adapter.ts        # .cursorrules + lock markers
│   │   ├── run-claude-adapter.ts    # Standalone Claude adapter runner
│   │   └── run-cursor-adapter.ts    # Standalone Cursor adapter runner
│   └── cli/
│       └── index.ts          # CLI with 9 commands
├── dashboard/                # Web UI (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── components/           # Agent cards, file tree, event list, task board
│   ├── utils/                # API client, SSE handler
│   └── lg/                   # Liquid Glass design tokens
├── tests/
│   ├── e2e.test.ts           # 17 e2e tests
│   └── integration.test.ts   # 4 integration tests
└── docs/                     # Specs, API docs, plans
```

---

## 10. Key Decisions Made

| Date | Decision | Rationale |
|---|---|---|
| 2026-02-19 | Build cross-tool agent protocol as Project #1 | No one has built cross-tool shared state. Urgent gap. |
| 2026-02-19 | TypeScript + SQLite + Express | Zero-dependency setup for maximum open-source adoption |
| 2026-02-20 | Apache 2.0 license | Broad adoption + patent protection |
| 2026-02-20 | Vanilla HTML/CSS/JS for dashboard | No build step, no framework dependency |
| 2026-02-20 | Defer branding to separate workstream | Development can proceed with "agent-protocol" placeholder |

---

_This report reflects the state of the project as of February 20, 2026. For implementation details, see `docs/IMPLEMENTATION-PLAN.md`. For the full protocol specification, see `research/10-protocol-spec-v0.1.md`._
