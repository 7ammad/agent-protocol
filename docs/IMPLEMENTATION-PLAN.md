# Implementation Plan — Agent Coordination Protocol

**Last updated:** February 20, 2026
**Audited against actual codebase:** February 20, 2026

Legend: ✅ Done | 🔶 Partially done | ❌ Not started | 🚫 Not needed

---

## Phase 1: Core Protocol — ✅ COMPLETE

All core components exist in `src/`, compile clean, and are tested.

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Daemon entry | `src/index.ts` | ✅ Done | Wires EventStore + StateManager + API + FileWatcher |
| Type definitions | `src/core/types.ts` | ✅ Done | Agent, Resource, Task, Event, Handoff, Config types |
| Event store | `src/core/event-store.ts` | ✅ Done | SQLite WAL mode, append-only, real-time subscriptions |
| State manager | `src/core/state-manager.ts` | ✅ Done | In-memory state from events, conflict detection, dead agent cleanup, lead promotion |
| HTTP API | `src/api/server.ts` | ✅ Done | 21 RESTful endpoints + SSE event stream. No dashboard static middleware yet. |
| File watcher | `src/watchers/file-watcher.ts` | ✅ Done | chokidar, SHA-256 hash change detection |
| Claude Code adapter | `src/adapters/claude-code-adapter.ts` | ✅ Done | CLAUDE.md state injection, 10s interval, heartbeat, claim/release. **Missing `forceStateSync()`.** |
| Cursor adapter | `src/adapters/cursor-adapter.ts` | ✅ Done | .cursorrules injection, lock marker files, state sync. **Missing `forceStateSync()`.** |
| CLI | `src/cli/index.ts` | ✅ Done | Commands: init, start, stop, status, agents, resources, tasks, log, resolve |
| E2E tests | `tests/e2e.test.ts` | ✅ Done | 17 tests — all 5 failure modes + SSE + full multi-agent scenario |
| LICENSE file | `LICENSE` | ✅ Done | Apache 2.0, copyright Hammad Al Habib (MTM) |
| README.md | `README.md` | ✅ Done | Basic public-facing README with quick start, architecture diagram, problem/solution table |
| package.json | `package.json` | ✅ Done | Scripts: build, dev, start, cli, test, test:watch, integration-test. License: Apache-2.0. |

**Build:** `pnpm build` — zero TypeScript errors.
**Tests:** `pnpm test` — 17/17 passing.

---

## Phase 1.5: Integration Tests — ✅ COMPLETE

**Goal:** Prove both adapters work against a live daemon with real HTTP, real SQLite, and real file I/O.

**Spec:** `docs/PHASE1-INTEGRATION-TEST-SPEC.md` (4 Vitest scenarios defined)

### Status:

| Item | Status | Notes |
|------|--------|-------|
| `tests/integration.test.ts` | ✅ Done | 4 Vitest scenarios on port 4798: Claude lifecycle, Cursor lifecycle, cross-adapter visibility, claim conflict |
| `forceStateSync()` on ClaudeCodeAdapter | ✅ Done | Public method bypassing 10s interval for deterministic assertions |
| `forceStateSync()` on CursorAdapter | ✅ Done | Public method bypassing 8s interval for deterministic assertions |
| `src/adapters/run-claude-adapter.ts` | ✅ Done | Standalone runner with --project-root, --port, --agent-id args |
| `src/adapters/run-cursor-adapter.ts` | ✅ Done | Standalone runner with --project-root, --port, --agent-id, --role args |
| `adapter:claude` script in package.json | ✅ Done | `pnpm adapter:claude` |
| `adapter:cursor` script in package.json | ✅ Done | `pnpm adapter:cursor` |
| `.integration-test-project/` cleanup | ✅ Done | Leftover directory deleted |
| `scripts/integration-test.ts` | Kept | Original ad-hoc smoke test remains as reference; `pnpm integration-test` now runs the Vitest suite |

**Build:** `pnpm build` — zero TypeScript errors.
**Tests:** `pnpm test` — 21/21 passing (17 e2e + 4 integration).

### Additional fix applied:

- Fixed `src/index.ts` direct execution guard — was using `if (process.argv[1])` which is always truthy during Vitest, causing EADDRINUSE on port 4700. Now properly checks if file is the actual entry point.
- Added `@types/sql.js` to devDependencies — was missing, causing TS build failure.

---

## Phase 2: Web Dashboard — ✅ COMPLETE

**Goal:** Real-time admin/debug UI showing agent activity, file ownership, event timeline, task board.

**Spec:** `docs/PHASE2-DASHBOARD-SPEC.md` (full component specs, data flow, CSS layout, code examples)
**Design tokens:** `docs/DESIGN-TOKENS.md` (Liquid Glass integration, semantic color tokens)
**File plan:** `docs/FILE-STRUCTURE-PLAN.md` (Phase 2 section)

**Tech:** Vanilla HTML/CSS/JS — no framework, no build step. Built on Liquid Glass Design System (dark mode).

**URL:** `http://localhost:4700/dashboard`

### Status:

| Item | Status | Notes |
|------|--------|-------|
| `dashboard/index.html` | ✅ Done | Page shell, LG CSS imports, 4 section layout |
| `dashboard/styles.css` | ✅ Done | All `--ap-*` tokens, grid layout, animations, badges, responsive |
| `dashboard/app.js` | ✅ Done | Orchestrator: initial load, health polling, SSE routing |
| `dashboard/components/agent-card.js` | ✅ Done | Agent cards with status dot, tool/role badges, heartbeat, capabilities |
| `dashboard/components/file-tree.js` | ✅ Done | File list grouped by state, conflict banner, owner badges |
| `dashboard/components/event-list.js` | ✅ Done | Event timeline with human-readable mapping, slide-in animation |
| `dashboard/components/task-board.js` | ✅ Done | Kanban columns, hide empty, relative time |
| `dashboard/utils/api.js` | ✅ Done | fetchState, fetchStatus, fetchEvents wrappers |
| `dashboard/utils/sse.js` | ✅ Done | EventSource + auto-reconnect polling fallback |
| `dashboard/lg/*.css` | ✅ Done | 6 files copied from design vault (colors, typography, elevation, motion, materials, dark-mode) |
| `express.static()` in `src/api/server.ts` | ✅ Done | Serves dashboard at `/dashboard` path |

**Build:** `pnpm build` — zero TypeScript errors.
**Tests:** `pnpm test` — 21/21 passing (17 e2e + 4 integration).

### Remaining: Visual verification

Dashboard needs manual testing with a running daemon to verify the 13-item checklist in `docs/PHASE2-DASHBOARD-SPEC.md`.

---

## Phase 3+: Future Work — ❌ NOT STARTED

| Priority | Item | Status | Spec Exists? |
|----------|------|--------|-------------|
| P3 | Cursor VS Code Extension Skeleton | ❌ Not started | No spec |
| P4 | Codex Adapter | ❌ Not started | No spec — needs Codex context injection research |
| P5 | Config File Support (`.agent-protocol/config.json`) | ❌ Not started | Schema in `research/10-protocol-spec-v0.1.md` §11 |
| P6 | Conflict Resolution UI | ❌ Not started | No spec |

---

## Pre-Launch Checklist

| # | Item | Status | Blocking? | Notes |
|---|------|--------|-----------|-------|
| 1 | Core protocol (daemon, adapters, CLI) | ✅ Done | — | All source in `src/`, compiles clean |
| 2 | E2E tests (17 tests) | ✅ Done | — | `tests/e2e.test.ts`, all passing |
| 3 | Integration tests (Vitest, 4 scenarios) | ✅ Done | — | 4 scenarios in `tests/integration.test.ts`, all passing |
| 4 | Web dashboard | ✅ Done | No | 10 files in `dashboard/`, served at `/dashboard`. Needs visual verification. |
| 5 | Project name / branding | ❌ TBD | **Yes** | Blocks npm package name, GitHub repo name, domain |
| 6 | LICENSE file | ✅ Done | — | Apache 2.0, already in repo root |
| 7 | README.md | ✅ Done | No | Basic version exists. Needs expansion for public launch (installation, usage, API docs, contributing). |
| 8 | CONTRIBUTING.md | ❌ Not created | No | Nice-to-have |
| 9 | Technical whitepaper | ❌ Not started | No | For HackerNews/X launch |
| 10 | npm package configuration | 🔶 Partial | **Yes** | `package.json` has name/version/bin/main, but `npx agent-protocol init` needs testing. Name will change with branding. |
| 11 | `.gitignore` | ❓ Not checked | No | Needs verification before public repo |
| 12 | Clean up test artifacts | ✅ Done | — | `.integration-test-project/` leftover deleted |

---

## Documentation Status

| Document | Location | Status |
|----------|----------|--------|
| PRD | `docs/PRD-001-agent-protocol.md` | ✅ Synced with root `docs/` copy |
| API Contracts | `docs/API-CONTRACTS.md` | ✅ 21 endpoints documented |
| Integration Test Spec | `docs/PHASE1-INTEGRATION-TEST-SPEC.md` | ✅ 4 scenarios defined — code not yet built |
| Dashboard Spec | `docs/PHASE2-DASHBOARD-SPEC.md` | ✅ Full spec — code not yet built |
| Design Tokens | `docs/DESIGN-TOKENS.md` | ✅ Liquid Glass integration spec |
| File Structure Plan | `docs/FILE-STRUCTURE-PLAN.md` | ✅ Phase 1 + 2 file plan |
| Live Test Guide | `docs/LIVE-TEST-GUIDE.md` | ✅ Manual test procedure |
| Implementation Plan | `docs/IMPLEMENTATION-PLAN.md` | ✅ This file |
| Protocol Spec | `research/10-protocol-spec-v0.1.md` | ✅ Full protocol spec (source of truth) |
| Build Plan | `research/08-build-plan.md` | ✅ Phases, revenue targets, launch strategy |
| Brand Identity | `research/09-brand-identity.md` | ✅ Brand concepts (name TBD) |

---

_This document is the single source of truth for what to build next and in what order. Audited against actual codebase on February 20, 2026._
