# Agent Protocol — Session Handoff

## What This Is

An open-source cross-tool coordination protocol and runtime for AI coding agents. When you run multiple AI agents (Claude Code, Cursor, Codex, OpenClaw) on the same codebase, they overwrite each other's files, duplicate work, lose context, and ignore hierarchy. No existing protocol (Google A2A, MCP, CrewAI) solves cross-tool shared state. This project does.

## Creator

Hammad Al Habib (MTM), Riyadh, Saudi Arabia. Vibe coder (architect + AI codes). Stack: TypeScript/Node.js/Next.js/Supabase. Runs OpenClaw (SuperBrembo agent orchestrator). The problem came from his daily pain of running Claude Code + Cursor + Codex + OpenClaw together.

## Project Status

**Name: TBD** — using `agent-protocol` as placeholder. Branding deferred to separate session.

### What's Built (in the selected folder)

```
agent-protocol/
├── package.json              # ESM, deps: better-sqlite3, chokidar, express, commander, nanoid
├── tsconfig.json             # TS config (ES2022, strict, Node16 modules)
├── README.md                 # Project overview
├── HANDOFF.md                # This file
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
│   │   ├── claude-code-adapter.ts  # Injects state into CLAUDE.md for coordination awareness
│   │   └── cursor-adapter.ts      # Injects state into .cursorrules + lock marker files
│   └── cli/
│       └── index.ts          # CLI: init, start, status, agents, resources, tasks, log, resolve
└── tests/
    └── e2e.test.ts           # 17 tests: all 5 failure modes + SSE + full multi-agent scenario
```

### What Was Done This Session (Feb 20, 2026)

1. **Build fixed** — Added `"type": "module"` to package.json, fixed all TypeScript strict-mode errors (unknown types from `fetch().json()`, chokidar types, etc.). Clean `tsc` build.
2. **FileWatcher wired into Daemon** — `index.ts` now creates, starts, and stops the FileWatcher alongside the HTTP server. File system observation is active on daemon start.
3. **Cursor Adapter built** — `src/adapters/cursor-adapter.ts`. Two coordination mechanisms:
   - `.cursorrules` injection (Cursor reads this for context, like CLAUDE.md for Claude Code)
   - Lock marker files (`.agent-protocol-lock-<filename>`) visible in Cursor's file explorer
   - Full lifecycle: connect, heartbeat, claim/release, state sync, disconnect with cleanup
4. **E2E test suite** — `tests/e2e.test.ts`. 17 tests covering all 5 failure modes:
   - F1: Resource ownership (claim, deny, release, owner-only release)
   - F2: Task tracking (create, lifecycle, cross-agent visibility)
   - F3: Context awareness (state snapshot, status summary, event audit trail)
   - F4: Lead hierarchy (lead identification, resource cleanup on agent removal)
   - F5: Structured handoffs (create, accept, reject with context)
   - SSE event streaming
   - Full multi-agent workflow scenario (Claude assigns → Cursor claims → works → handoff → Claude reviews)
5. **All 17 tests passing**, build clean, zero type errors.

### Research Reports (in research/ folder)

- `01-ai-limitations-landscape.md` — AI agent limitations
- `02-viral-ai-projects-analysis.md` — Viral AI projects patterns
- `03-monetization-strategies.md` — Business models + Saudi funding
- `04-competitive-deep-dive.md` — 5 opportunity areas
- `05-FINAL-RECOMMENDATIONS.md` — Scored recommendations
- `06-FACT-CHECK-REPORT.md` — 34 claims verified
- `07-CROSS-TOOL-AGENT-COORDINATION.md` — The pivotal research (nobody has built this)
- `08-build-plan.md` — Full build plan with phases
- `09-brand-identity.md` — Brand concept (star metaphor, to be developed separately)
- `10-protocol-spec-v0.1.md` — Full protocol specification (most important doc)

## What Needs to Happen Next

### Immediate (next session)

1. **Integration test** — DONE: Added scripts/integration-test.ts + docs/INTEGRATION-TEST.md. Run pnpm integration-test. Blocked on Windows: better-sqlite3 needs VS Build Tools or WSL. + Claude Code adapter on a real project. Verify CLAUDE.md injection works end-to-end with a live Claude Code session.
2. **Cursor extension skeleton** — VS Code extension package that talks to the daemon via HTTP. Should show agent status in sidebar and resource ownership in file decorations.
3. **Dashboard** — React web UI showing real-time agent activity + resource ownership map. SSE-powered, connects to daemon's `/events/stream` endpoint.

### Then

4. **Codex adapter** — Similar pattern to Claude/Cursor. Codex uses a different context injection mechanism — needs research.
5. **Conflict resolution UI** — The `resolve` CLI command works but needs a visual diff-and-pick interface.
6. **Config file support** — Read `.agent-protocol/config.json` on daemon startup instead of only using defaults.

### Later

7. **Technical whitepaper** — Based on protocol spec, for HackerNews/X launch
8. **Branding** — Name, visual identity, domain (deferred to separate session/team)
9. **GitHub public repo** — README, LICENSE, CONTRIBUTING, launch
10. **npm publish** — Package the daemon + CLI for `npx agent-protocol init`

## Architecture Decisions

- **SQLite over Postgres/Redis** for MVP (zero dependency)
- **In-memory state + SQLite persistence** (fast reads, durable writes)
- **File watcher as primary detection** (non-invasive, no agent modification needed)
- **CLAUDE.md injection** for Claude Code awareness (it reads CLAUDE.md before acting)
- **.cursorrules injection** for Cursor awareness + lock marker files
- **Express HTTP API** on localhost:4700 (adapters talk to daemon via HTTP)
- **SSE for real-time events** (adapters subscribe to event stream)
- **Apache-2.0 license** (open source, permissive)

## Key Design Principle

**Non-invasive.** Agents don't need modification. The protocol observes from outside via adapters that use file watchers, CLAUDE.md injection, .cursorrules injection, VS Code extension API, and file markers. The agents don't know they're being coordinated — they just see updated context files and blocked markers.

## The Five Failure Modes This Solves

1. **F1: File Conflict** → Resource ownership model (claim before edit)
2. **F2: Duplicated Work** → Task tracking (agents see what others work on)
3. **F3: Context Blindness** → State injection into CLAUDE.md / .cursorrules / workspace
4. **F4: Authority Violation** → Lead agent hierarchy (lead assigns, workers execute)
5. **F5: Silent Handoff** → Structured handoff protocol with context + file lists

## How to Run

```bash
cd agent-protocol
pnpm install
pnpm build             # Compile TypeScript
pnpm test              # Run 17 e2e tests
pnpm dev               # Start daemon in watch mode
pnpm cli -- start      # Start daemon via CLI
pnpm cli -- status     # Check daemon status
```

