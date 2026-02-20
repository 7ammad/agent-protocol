# PRD-001: Cross-Tool Agent Coordination Protocol

**Product Requirements Document**

| Field | Value |
|---|---|
| Document ID | PRD-001 |
| Version | 1.0 |
| Status | Draft |
| Author | Hammad (MTM) |
| Date | February 20, 2026 |
| Stakeholders | Engineering, Open-Source Community |

---

## 1. Problem Statement

When multiple AI coding agents — Claude Code, Cursor, Copilot, Codex, OpenClaw — operate on the same codebase simultaneously, they have no way to coordinate. Each agent runs in its own process, with its own context, unaware of what the others are doing.

This produces five consistent failure modes observed in daily multi-agent development workflows:

**F1 — File Conflict (Very High frequency):** Two agents edit the same file simultaneously. One overwrites the other's work silently. There is no locking, no warning, no detection until the damage is done.

**F2 — Duplicated Work (High frequency):** Agent B re-implements functionality Agent A already completed because B has zero visibility into A's output. Work is wasted and often introduces inconsistencies.

**F3 — Context Blindness (Very High frequency):** Agent B modifies code with no knowledge of what Agent A changed moments ago. This produces contradictory implementations, broken imports, and cascading failures.

**F4 — Authority Violation (High frequency):** Worker agents ignore the lead orchestrator's task assignments and scope boundaries. They modify files outside their scope or make architectural decisions that conflict with the lead's plan.

**F5 — Silent Handoff Failure (Medium frequency):** Agent A finishes work but doesn't document what was done, what changed, or what's next. Agent B starts from scratch, losing all of A's context and progress.

**Who experiences this:** Every developer or team running two or more AI coding agents on the same project. This is a daily problem, not an edge case — the 2025 developer survey showed 84% of developers use AI tools, and multi-agent adoption at Fortune 500 companies grew 67% in 2024.

**Cost of not solving it:** Developers report spending more time fixing agent-generated conflicts than the agents saved them (66% of respondents in recent surveys). The productivity promise of multi-agent coding is undermined by the coordination tax.

**Evidence:**
- 1,445% surge in multi-agent system inquiries from Q1 2024 to Q2 2025
- Git worktree hacks emerging as duct-tape workarounds across developer communities
- No existing protocol addresses cross-tool shared state (validated via systematic gap analysis — see Research Report 07)

---

## 2. Goals

**G1 — Eliminate file conflicts between concurrent agents.** Agents must claim resources before editing. No two agents can modify the same file simultaneously. Success: zero undetected file overwrites in a multi-agent session.

**G2 — Give every agent real-time awareness of what others are doing.** Each agent should see which files are owned, which tasks are in progress, and who is working on what — without requiring the agent itself to be modified. Success: agents stop duplicating work that was already completed by another agent.

**G3 — Enforce a clear authority hierarchy.** One lead agent decides task assignments and conflict resolution. Workers execute within scope. No negotiation (too slow for AI agents). Success: lead agent's task boundaries are respected 95%+ of the time.

**G4 — Capture structured handoffs between agents.** When one agent finishes, its context (what was done, what changed, what's next) is preserved and available to the next agent. Success: no agent starts from scratch on work another agent already began.

**G5 — Operate non-invasively.** The protocol must work with existing agents (Claude Code, Cursor, etc.) without requiring modification to those tools. Success: any supported agent can be coordinated by deploying an adapter, not a fork.

---

## 3. Non-Goals

**NG1 — Building a new AI coding agent.** This is coordination infrastructure, not a competitor to Cursor, Claude Code, or Copilot. The protocol is tool-agnostic and works with existing agents.

**NG2 — Replacing Git.** Git handles version control and merge conflict detection after the fact. This protocol handles real-time conflict prevention and coordination before agents commit. They are complementary layers.

**NG3 — Supporting distributed multi-machine deployment (v1).** The v1 daemon runs on localhost. Cross-machine coordination, cloud-hosted daemons, and remote agent support are deferred to v2+ to keep the initial scope tight and the dependency footprint minimal.

**NG4 — Automatic conflict resolution (v1).** When two agents touch the same file, v1 escalates to the lead agent. Automatic merging (non-overlapping changes, CRDT-based sync) is a v2 feature. Safety over speed: lost work is worse than paused work.

**NG5 — Enterprise access control, authentication, or multi-tenancy.** The v1 protocol is single-project, single-machine, no auth. Enterprise features are a monetization path, not a v1 requirement.

---

## 4. User Stories

### Developer (Solo, Multiple Agents)

- **US1:** As a developer running Claude Code and Cursor on the same project, I want a daemon that prevents both agents from editing the same file at the same time, so that I never lose work to silent overwrites.

- **US2:** As a developer, I want to see a real-time status of which agent owns which files, so that I can understand what's happening without switching between agent windows.

- **US3:** As a developer, I want agents to automatically become aware of what other agents did, so that Cursor doesn't rewrite the login form that Claude Code just finished building.

- **US4:** As a developer, I want to designate one agent as the "lead" with authority to assign tasks and resolve conflicts, so that agents don't step on each other's work.

### Lead Agent (Orchestrator)

- **US5:** As a lead agent (via adapter), I want to assign tasks to specific worker agents with explicit file scope boundaries, so that workers only touch files relevant to their assignment.

- **US6:** As a lead agent, I want to be notified immediately when a conflict is detected, with both versions preserved, so that I can decide the resolution without losing either agent's work.

- **US7:** As a lead agent, I want to lock files during review, so that no agent modifies them while I'm evaluating the completed task.

### Worker Agent (Via Adapter)

- **US8:** As a worker agent (via adapter), I want to claim files before editing them, so that I have exclusive access and don't risk overwriting another agent's work.

- **US9:** As a worker agent, I want to see which files are owned by other agents (injected into my context), so that I avoid those files entirely.

- **US10:** As a worker agent, I want to create a structured handoff when I finish a task, so that the next agent knows what I did, what files changed, and what's left to do.

### Edge Cases

- **US11:** As a developer, when an agent crashes or goes offline without releasing its files, I want the protocol to detect the dead agent and free its resources after a timeout, so that files don't stay locked forever.

- **US12:** As a developer, when the lead agent goes offline, I want the protocol to automatically promote the highest-ranking remaining agent, so that coordination doesn't stall.

- **US13:** As a developer, I want to manually override any agent's file claim via CLI, so that I always have final authority as a human operator.

---

## 5. Requirements

### Must-Have (P0)

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| R1 | **Resource ownership model** — files must be claimed before editing. Only one agent can own a file at a time. | Given a file is claimed by Agent A, when Agent B attempts to claim it, then the claim is denied and B receives the current owner info. |
| R2 | **Conflict detection** — detect when two agents modify the same file and flag it immediately. | Given a file is claimed by Agent A, when the file watcher detects a modification by a different process, then a `resource.conflict_detected` event is emitted and the resource state changes to `conflicted`. |
| R3 | **Append-only event log** — every agent action (claim, release, modify, conflict) produces an immutable event with timestamp, agent ID, action, and file path. | Given any state-changing action, when it occurs, then an event is written to SQLite with all required fields and cannot be modified or deleted. |
| R4 | **Authority hierarchy** — one lead agent per session. Lead can assign tasks, resolve conflicts, lock files. Workers operate within assigned scope. | Given the lead agent issues a task assignment, when the task specifies file scope, then worker agents' adapters prevent claiming files outside that scope. |
| R5 | **Claude Code adapter** — inject coordination state into CLAUDE.md so Claude Code is aware of other agents without modification. | Given other agents own files, when the adapter refreshes CLAUDE.md, then the injected section lists all files owned by other agents with a "DO NOT EDIT" warning. |
| R6 | **Cursor adapter** — inject state into `.cursorrules` and create lock marker files visible in Cursor's file explorer. | Given other agents own files, when the adapter refreshes, then `.cursorrules` contains coordination state and lock markers exist for claimed files. |
| R7 | **CLI interface** — init, start, stop, status, agents, resources, tasks, log, resolve commands. | Given the daemon is running, when `agent-protocol status` is executed, then it displays agent count, resource ownership summary, task status, and event count. |
| R8 | **Heartbeat and dead agent detection** — agents send periodic heartbeats. If a heartbeat is missed beyond a timeout, the agent is marked offline and its resources are released. | Given an agent's last heartbeat was >60 seconds ago, when the heartbeat checker runs, then the agent is marked offline and all its claimed resources are freed. |
| R9 | **HTTP API** — RESTful API for all adapter-to-daemon communication. | Given the daemon is running, when any endpoint is called with valid parameters, then it returns the correct response within 100ms for local requests. |
| R10 | **SSE event stream** — real-time event streaming for adapters and future dashboard. | Given a client is connected to `/events/stream`, when a new event is emitted, then it is pushed to all connected SSE clients within 50ms. |

### Nice-to-Have (P1)

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| R11 | **Structured handoff protocol** — agents can create handoffs with summary, files modified, context, and blockers. Other agents can accept or reject. | Given Agent A completes a task, when it creates a handoff, then the handoff is stored and the target agent's adapter is notified. |
| R12 | **Task management** — create, assign, track tasks with status (queued, in_progress, done, blocked) and file scope dependencies. | Given the lead creates a task with file scope, when the task is assigned, then the worker's adapter shows the assignment and the allowed file paths. |
| R13 | **Web dashboard** — real-time vanilla HTML/CSS/JS UI (no framework, no build step) showing agent activity, file ownership map, event timeline, and conflict alerts. Built on the Liquid Glass Design System (dark mode). | Given the daemon is running, when the dashboard is opened at `localhost:4700/dashboard`, then it displays live agent status, a file tree with ownership colors, and a scrolling event log via SSE. |
| R14 | **Conflict file preservation** — when a conflict is detected, save both agents' versions as `.agent-protocol-conflict-<agent_id>` files. | Given a conflict on `src/foo.ts`, when detected, then `src/foo.ts.agent-protocol-conflict-agent-a` and `src/foo.ts.agent-protocol-conflict-agent-b` are created. |

### Future Considerations (P2)

| ID | Requirement | Notes |
|---|---|---|
| R15 | **Copilot / Codex / OpenClaw adapters** | Design adapter interface to be generic enough for any tool. |
| R16 | **Automatic conflict resolution** | Non-overlapping changes auto-merge. Identical changes deduplicate. Requires CRDT or OT approach. |
| R17 | **Distributed daemon** | Multi-machine support for remote team scenarios. Requires consensus protocol. |
| R18 | **Authentication and access control** | API keys per agent, role-based permissions. Required for cloud-hosted version. |
| R19 | **Plugin system** | Custom adapters, custom conflict resolution strategies, custom event handlers. |
| R20 | **Cloud-hosted SaaS version** | Managed daemon with team features. Primary monetization path. |

---

## 6. Success Metrics

### Leading Indicators (Days to Weeks Post-Launch)

| Metric | Target (30 days) | Stretch | Measurement |
|---|---|---|---|
| GitHub stars | 500 | 2,000 | GitHub API |
| npm weekly downloads | 200 | 1,000 | npm stats |
| Unique daemon instances started (telemetry opt-in) | 100 | 500 | Opt-in anonymous telemetry |
| File conflicts detected and prevented | 90% of potential conflicts caught | 99% | Event log analysis in test scenarios |
| Mean time from daemon start to first agent connected | <30 seconds | <10 seconds | Adapter logs |

### Lagging Indicators (Weeks to Months)

| Metric | Target (90 days) | Measurement |
|---|---|---|
| Active GitHub contributors (PRs merged) | 10+ | GitHub API |
| Community adapters created (beyond Claude Code + Cursor) | 2+ | GitHub repos / issues |
| HackerNews / dev community mentions | 5+ threads | Search monitoring |
| Enterprise inquiry emails | 5+ | Contact form |
| Repeat weekly users (telemetry opt-in) | 50+ | Telemetry |

### Evaluation Schedule
- **Week 1:** Stars, downloads, installation success rate
- **Month 1:** Active users, conflict detection rate, community engagement
- **Month 3:** Contributor count, enterprise interest, adapter ecosystem

---

## 7. Technical Architecture Summary

### Stack
- **Runtime:** Node.js / TypeScript (ESM)
- **Storage:** SQLite (zero-dependency, append-only event log + WAL mode)
- **API:** Express HTTP on localhost:4700
- **File watching:** chokidar with hash-based change detection
- **Real-time:** SSE (Server-Sent Events)
- **CLI:** commander.js

### Core Components
- **Event Store** — Append-only SQLite log. Source of truth. Every action is an immutable event.
- **State Manager** — In-memory state derived from events. Agent registry, resource tracker, task manager, handoff protocol.
- **HTTP API** — 21 RESTful endpoints covering agents, resources, tasks, handoffs, events, SSE stream, status/health.
- **File Watcher** — chokidar watching tracked paths. Hash-based change detection (SHA-256, truncated to 16 chars). Detects modifications, additions, deletions.
- **Adapters** — Tool-specific plugins that bridge existing agents to the daemon. Claude Code adapter (CLAUDE.md injection), Cursor adapter (.cursorrules + lock markers).

### Design Principles
1. **Non-invasive** — Agents don't need modification. Adapters observe and coordinate from outside.
2. **File-system-first** — The shared medium is the filesystem. Every agent reads and writes files. The protocol watches those files.
3. **Append-only truth** — The event log is immutable. State is derived, not stored directly.
4. **Authority is explicit** — One lead, no negotiation. Speed over democracy.
5. **Fail-safe** — When in doubt, stop both agents and escalate. Lost work is worse than paused work.
6. **Zero ML required** — Pure systems engineering. Event sourcing, file watching, state machines.

---

## 8. Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | How frequently should the Claude Code adapter refresh CLAUDE.md? Every change event? Every 10 seconds? On-demand only? | Engineering | No — defaulting to 10s with configurable override |
| Q2 | What is the optimal Cursor notification mechanism — VS Code extension API, file markers, or terminal output? | Engineering | No — using file markers for v1, extension for v2 |
| Q3 | Should the protocol interact with Git hooks (pre-commit) or stay separate from the Git workflow? | Engineering | No — staying separate for v1, Git integration is P2 |
| Q4 | ~~How should agent identity persist across restarts?~~ | Engineering | **Resolved** — Session-based (new ID each time). Adapters accept `--agent-id` flag for manual persistence. |
| Q5 | What is the project name? "agent-protocol" is a placeholder. Branding is deferred to a separate workstream. | Hammad | **Yes** — blocks public launch (npm, GitHub, domain) |
| Q6 | ~~What license model?~~ | Hammad | **Resolved** — Apache 2.0. Balances broad adoption with patent protection. |

---

## 9. Timeline Considerations

### Phase 1: Core Protocol (Completed)
- Event store, state manager, HTTP API, file watcher
- Claude Code adapter, Cursor adapter
- CLI interface (init, start, stop, status, agents, resources, tasks, log, resolve)
- 17 end-to-end tests passing, build clean

### Phase 2: Polish and Launch Prep (Next 2 Weeks)
- Web dashboard (vanilla HTML/CSS/JS, Liquid Glass Design System)
- Integration test on real multi-agent project
- Technical whitepaper for HackerNews/X launch
- README, documentation, contributing guide
- npm publish + GitHub public repo

### Phase 3: Community and Ecosystem (Month 2-3)
- Copilot adapter
- Codex adapter
- Plugin system for custom adapters
- Community onboarding

### Hard Dependencies
- Branding decision (name, domain, npm package name) — blocks public launch

---

## 10. Competitive Landscape

| Player | What They Do | Gap vs. This Protocol |
|---|---|---|
| **Entire** (Nat Friedman) | Git observability for AI agents — tracks decisions/checkpoints | Observability only. No real-time coordination, no conflict prevention, no authority hierarchy. |
| **Clash** (open-source) | Merge conflict management for Git worktrees | Narrow scope — Git-level only. No cross-tool state, no live coordination. |
| **Counselors** (Aaron Francis) | Fan out prompts to multiple agents | No state management, no conflict detection, no coordination layer. |
| **Google A2A** | Message passing + capability discovery between agents | Communication standard, not coordination. No shared state, no file ownership, no hierarchy. |
| **CrewAI / LangGraph / AutoGen** | Single-process multi-agent orchestration | Cannot coordinate across different tools (Cursor ≠ Claude Code). Single-runtime limitation. |

**This protocol's differentiation:** The only solution providing cross-tool shared state, real-time conflict prevention, authority enforcement, and structured handoffs — without requiring agents to be modified.

---

_Document version 1.0 — February 20, 2026_
