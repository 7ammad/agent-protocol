# Live Test Guide — Agent Protocol

Step-by-step procedure for running the daemon + adapters on a real project to verify everything works end-to-end.

---

## Prerequisites

- Node.js >= 20
- Dependencies installed: `cd agent-protocol && pnpm install`
- A test project directory (or use agent-protocol itself as the project)

---

## Step 1: Build

```bash
cd agent-protocol
pnpm build
```

Verify: zero TypeScript errors.

---

## Step 2: Start the Daemon

**Terminal 1:**

```bash
pnpm cli -- start --project /path/to/test-project
```

Or directly:

```bash
npx tsx src/index.ts
```

**Verify:**

```bash
curl http://localhost:4700/status
```

Expected: JSON with `version: "0.1"`, `agents.total: 0`, `event_count > 0`.

---

## Step 3: Run Claude Code Adapter

**Terminal 2:**

```bash
pnpm adapter:claude -- --project-root=/path/to/test-project
```

Or with custom ID:

```bash
pnpm adapter:claude -- --project-root=/path/to/test-project --agent-id=claude-lead --port=4700
```

**Verify:**

```bash
# Check agent registered
curl http://localhost:4700/agents

# Check CLAUDE.md injected
cat /path/to/test-project/CLAUDE.md
# Should contain: <!-- AGENT-PROTOCOL:START -->
```

---

## Step 4: Run Cursor Adapter

**Terminal 3:**

```bash
pnpm adapter:cursor -- --project-root=/path/to/test-project --role=worker
```

**Verify:**

```bash
# Both agents visible
curl http://localhost:4700/agents
# Should list: claude-code-1 (lead) + cursor-1 (worker)

# .cursorrules injected
cat /path/to/test-project/.cursorrules
# Should contain: # === AGENT-PROTOCOL:START ===
# Should list claude-code-1 under ACTIVE AGENTS

# CLAUDE.md should list cursor-1 under Active Agents
cat /path/to/test-project/CLAUDE.md
```

---

## Step 5: Test Resource Claiming

**Terminal 4 (or any):**

```bash
# Claude claims a file
curl -X POST http://localhost:4700/resources/claim \
  -H "Content-Type: application/json" \
  -d '{"path":"src/index.ts","agent_id":"claude-code-1"}'
```

Expected: `{"granted":true}`

**Wait 10 seconds** (for Claude adapter's sync interval) or **8 seconds** (for Cursor adapter), then verify:

```bash
# CLAUDE.md shows claimed file
cat /path/to/test-project/CLAUDE.md
# Should show: "Your Claimed Files" → src/index.ts

# .cursorrules shows blocked file
cat /path/to/test-project/.cursorrules
# Should show: "BLOCKED FILES" → src/index.ts → claude-code-1

# Lock marker file exists
ls /path/to/test-project/src/.agent-protocol-lock-index.ts
cat /path/to/test-project/src/.agent-protocol-lock-index.ts
# Should show: "LOCKED by claude-code-1"
```

---

## Step 6: Test Resource Release

```bash
curl -X POST http://localhost:4700/resources/release \
  -H "Content-Type: application/json" \
  -d '{"path":"src/index.ts","agent_id":"claude-code-1"}'
```

Expected: `{"released":true}`

**Wait for sync intervals**, then verify:

```bash
# CLAUDE.md no longer shows claimed file
# .cursorrules no longer shows blocked file
# Lock marker file removed
ls /path/to/test-project/src/.agent-protocol-lock-index.ts
# Should: file not found
```

---

## Step 7: Test Claim Conflict

```bash
# Claude claims
curl -X POST http://localhost:4700/resources/claim \
  -H "Content-Type: application/json" \
  -d '{"path":"src/config.ts","agent_id":"claude-code-1"}'
# Expected: {"granted":true}

# Cursor tries same file
curl -X POST http://localhost:4700/resources/claim \
  -H "Content-Type: application/json" \
  -d '{"path":"src/config.ts","agent_id":"cursor-1"}'
# Expected: {"granted":false,"owner":"claude-code-1","reason":"..."}

# Release
curl -X POST http://localhost:4700/resources/release \
  -H "Content-Type: application/json" \
  -d '{"path":"src/config.ts","agent_id":"claude-code-1"}'
```

---

## Step 8: Test SSE Event Stream

**Terminal 4:**

```bash
curl -N http://localhost:4700/events/stream
```

This keeps the connection open. Now trigger actions in another terminal:

```bash
# Claim a file
curl -X POST http://localhost:4700/resources/claim \
  -H "Content-Type: application/json" \
  -d '{"path":"src/app.ts","agent_id":"claude-code-1"}'
```

**Expected:** The SSE terminal should show an event like:

```
data: {"id":"evt_...","timestamp":...,"agent_id":"claude-code-1","action":"resource.claimed","resource":"src/app.ts",...}
```

---

## Step 9: Test Full State

```bash
# Full state snapshot
curl http://localhost:4700/state | python -m json.tool

# Query events
curl "http://localhost:4700/events?limit=10" | python -m json.tool

# Filter by agent
curl "http://localhost:4700/events?agent_id=claude-code-1" | python -m json.tool
```

---

## Step 10: Cleanup

Press **Ctrl+C** in each terminal (adapters → daemon):

1. **Terminal 3:** Ctrl+C → Cursor adapter disconnects, removes .cursorrules injection + lock files
2. **Terminal 2:** Ctrl+C → Claude adapter disconnects, removes CLAUDE.md injection
3. **Terminal 1:** Ctrl+C → Daemon shuts down gracefully

**Verify cleanup:**

```bash
# CLAUDE.md should not contain AGENT-PROTOCOL markers
cat /path/to/test-project/CLAUDE.md

# .cursorrules should be cleaned up or removed
cat /path/to/test-project/.cursorrules

# No lock files
ls /path/to/test-project/src/.agent-protocol-lock-*
# Should: no matches
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `EADDRINUSE` on port 4700 | Another daemon running | Kill it: `lsof -ti:4700 \| xargs kill` or change port |
| CLAUDE.md not updating | Adapter not connected or daemon down | Check `curl /agents` — is the adapter listed? |
| Lock files not appearing | `projectRoot` is relative | Use absolute path for `--project-root` |
| `.cursorrules` not created | Adapter connect failed | Check daemon is running, port matches |
| SSE stream shows nothing | No events happening | Trigger an action (claim, heartbeat) in another terminal |
| Events show but files don't update | Sync interval hasn't fired | Wait 10s (Claude) or 8s (Cursor) for next sync cycle |
| `ECONNREFUSED` on curl | Daemon not running | Start daemon first (Step 2) |
