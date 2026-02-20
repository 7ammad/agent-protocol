# File Structure Plan — Phase 1 + Phase 2

## Files to CREATE

### Phase 1: Integration Tests

| File | Purpose |
|------|---------|
| `tests/integration.test.ts` | Automated adapter integration tests (4 scenarios) |
| `src/adapters/run-claude-adapter.ts` | Standalone Claude adapter runner for manual testing |
| `src/adapters/run-cursor-adapter.ts` | Standalone Cursor adapter runner for manual testing |
| `docs/LIVE-TEST-GUIDE.md` | Step-by-step manual live test procedure |

### Phase 2: Dashboard UI

```
dashboard/
├── index.html              # Page structure (4 sections + header)
├── styles.css              # Dark theme (navy + gold) — all visual styling
├── app.js                  # State management + SSE listener + render orchestration
├── components/
│   ├── agent-card.js       # Agent status cards with role/status badges
│   ├── file-tree.js        # File ownership view (color-coded by state)
│   ├── event-list.js       # Live event timeline (newest first, max 100)
│   └── task-board.js       # Kanban columns by task status
└── utils/
    ├── api.js              # fetch() wrappers for /state, /status, /events
    └── sse.js              # EventSource connection to /events/stream
```

---

## Files to MODIFY

| File | Change | Lines affected |
|------|--------|----------------|
| `src/adapters/claude-code-adapter.ts` | Add public `forceStateSync()` method | ~3 lines added after line 89 |
| `src/adapters/cursor-adapter.ts` | Add public `forceStateSync()`, change `syncState()` from private | ~5 lines changed around line 167 |
| `src/api/server.ts` | Add `express.static()` middleware for `dashboard/` directory | ~3 lines added after line 19 |
| `package.json` | Add `adapter:claude` and `adapter:cursor` scripts | 2 lines added to scripts |

---

## Files FROZEN — Do NOT Modify

These files are working and tested. Do not change them.

| File | Reason |
|------|--------|
| `src/core/types.ts` | Type definitions are stable — no type changes in Phase 1 or 2 |
| `src/core/event-store.ts` | Event store is complete and tested |
| `src/core/state-manager.ts` | State manager is complete and tested |
| `src/watchers/file-watcher.ts` | File watcher is complete and tested |
| `src/cli/index.ts` | CLI is complete — no changes needed |
| `src/index.ts` | Daemon entry point is complete |
| `tests/e2e.test.ts` | 17 existing tests must stay passing — do not modify |
| `CLAUDE.md` | Project context file — do not modify |
| `HANDOFF.md` | Session handoff doc — do not modify |

---

## Build Output

After `pnpm build`, the `dist/` directory must include:

```
dist/
├── adapters/
│   ├── claude-code-adapter.js    # Modified: has forceStateSync()
│   ├── cursor-adapter.js         # Modified: has forceStateSync()
│   ├── run-claude-adapter.js     # New
│   └── run-cursor-adapter.js     # New
├── api/
│   └── server.js                 # Modified: serves dashboard
├── core/
│   ├── types.js
│   ├── event-store.js
│   └── state-manager.js
├── watchers/
│   └── file-watcher.js
├── cli/
│   └── index.js
└── index.js
```

**Note:** The `dashboard/` directory is at the project root (not in `src/`), so it does NOT go through TypeScript compilation. The Express static middleware in `server.ts` must resolve the path relative to the project root, not `dist/`.

---

## Test Commands

```bash
pnpm test             # Must pass: 17 existing e2e + 4 new integration tests
pnpm build            # Must succeed: zero TypeScript errors
npx tsc --noEmit      # Type check without build
```
