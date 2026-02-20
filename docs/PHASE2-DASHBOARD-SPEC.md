# Phase 2 — Dashboard Specification

## Overview

Real-time admin/debug dashboard for the Agent Protocol daemon. Vanilla HTML/CSS/JS — no framework, no build step. Visual layer built on the **Liquid Glass Design System** (dark mode, glass surfaces, Inter typography).

**URL:** `http://localhost:4700/dashboard`

---

## Architecture

### Serving

Add to `src/api/server.ts` — serve `dashboard/` as static files:

```typescript
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve dashboard static files at /dashboard
app.use('/dashboard', express.static(resolve(__dirname, '../../dashboard')));
```

The `dashboard/` directory is at project root (not in `src/`), so the path resolves from `dist/api/server.js` → `../../dashboard/`.

### No Build Step

Dashboard files are plain HTML/CSS/JS — they don't go through TypeScript compilation. They're served directly via `express.static()`.

---

## File Structure

```
dashboard/
├── index.html              # Page shell + script/style imports
├── styles.css              # Agent Protocol overrides on top of liquid glass
├── app.js                  # State management + SSE + render orchestration
├── components/
│   ├── agent-card.js       # Agent status cards
│   ├── file-tree.js        # File ownership view
│   ├── event-list.js       # Live event timeline
│   └── task-board.js       # Kanban columns
└── utils/
    ├── api.js              # fetch() wrappers
    └── sse.js              # EventSource connection manager
```

---

## index.html Structure

```html
<!DOCTYPE html>
<html lang="en" class="lg-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Protocol — Dashboard</title>

  <!-- Liquid Glass Foundation -->
  <!-- Copy token files from vault into dashboard/lg/ or inline them -->
  <link rel="stylesheet" href="lg/colors.css">
  <link rel="stylesheet" href="lg/typography.css">
  <link rel="stylesheet" href="lg/elevation.css">
  <link rel="stylesheet" href="lg/motion.css">
  <link rel="stylesheet" href="lg/materials.css">
  <link rel="stylesheet" href="lg/dark-mode.css">

  <!-- Dashboard styles -->
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header id="app-header" class="lg-glass-thick lg-specular">
    <!-- Page title + daemon health badge -->
  </header>

  <main id="app-main">
    <section id="agent-cards" class="dashboard-section">
      <!-- Agent cards rendered here -->
    </section>

    <section id="file-tree" class="dashboard-section">
      <!-- File ownership list rendered here -->
    </section>

    <section id="event-timeline" class="dashboard-section">
      <!-- Event list rendered here -->
    </section>

    <section id="task-board" class="dashboard-section">
      <!-- Task kanban rendered here -->
    </section>
  </main>

  <!-- JS Modules -->
  <script type="module" src="utils/api.js"></script>
  <script type="module" src="utils/sse.js"></script>
  <script type="module" src="components/agent-card.js"></script>
  <script type="module" src="components/file-tree.js"></script>
  <script type="module" src="components/event-list.js"></script>
  <script type="module" src="components/task-board.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

**Note:** Liquid glass CSS files should be copied into `dashboard/lg/` from `C:\Dev\Builds\lab\design-vault\liquid-glass\`. Only copy the needed files (tokens + core), not the entire vault.

---

## Page Layout

```
┌──────────────────────────────────────────────────────┐
│  HEADER: "Agent Protocol" + health dot + event count │
│  (lg-glass-thick, lg-specular, sticky top)           │
├─────────────────────────┬────────────────────────────┤
│                         │                            │
│   AGENT CARDS           │   FILE TREE                │
│   (left column)         │   (right column)           │
│   lg-glass-interactive  │   lg-glass-regular         │
│                         │                            │
├─────────────────────────┴────────────────────────────┤
│                                                      │
│   EVENT TIMELINE (full width, lg-glass-thin)         │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│   TASK BOARD — kanban columns (full width)           │
│   each column: lg-glass-thin                         │
│   each card: lg-glass-interactive                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### CSS Grid Layout

```css
#app-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto auto;
  gap: var(--lg-space-6);          /* Use liquid glass spacing if available, else 1.5rem */
  padding: var(--lg-space-6);
  max-width: 1400px;
  margin: 0 auto;
}

#agent-cards { grid-column: 1; grid-row: 1; }
#file-tree { grid-column: 2; grid-row: 1; }
#event-timeline { grid-column: 1 / -1; grid-row: 2; }
#task-board { grid-column: 1 / -1; grid-row: 3; }

@media (max-width: 900px) {
  #app-main {
    grid-template-columns: 1fr;
  }
  #agent-cards, #file-tree, #event-timeline, #task-board {
    grid-column: 1;
  }
}
```

---

## Data Sources & Update Strategy

| Section | Initial Load | Real-time Update |
|---------|-------------|-----------------|
| **Header health** | `GET /status` | Poll every 5s |
| **Agent Cards** | `GET /state` → `agents[]` | SSE `agent.*` events → re-fetch `/state` |
| **File Tree** | `GET /state` → `resources[]` | SSE `resource.*` events → re-fetch `/state` |
| **Event Timeline** | `GET /events?limit=50` | SSE stream → prepend new events |
| **Task Board** | `GET /state` → `tasks[]` | SSE `task.*` events → re-fetch `/state` |
| **Conflict Alerts** | `resources[].state === 'conflicted'` | Inline banner when detected |

---

## utils/api.js

```javascript
const BASE = '';  // Same origin — no CORS

export async function fetchState() {
  const res = await fetch(`${BASE}/state`);
  return res.json();
}

export async function fetchStatus() {
  const res = await fetch(`${BASE}/status`);
  return res.json();
}

export async function fetchEvents(limit = 50) {
  const res = await fetch(`${BASE}/events?limit=${limit}`);
  return res.json();
}
```

---

## utils/sse.js

```javascript
let evtSource = null;
let pollInterval = null;

export function connectSSE(onEvent) {
  evtSource = new EventSource('/events/stream');

  evtSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
  };

  evtSource.onerror = () => {
    // Connection lost — fallback to polling
    evtSource.close();
    startPolling(onEvent);
  };
}

function startPolling(onEvent) {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    try {
      // Try to reconnect SSE
      evtSource = new EventSource('/events/stream');
      evtSource.onmessage = (e) => {
        clearInterval(pollInterval);
        pollInterval = null;
        const event = JSON.parse(e.data);
        onEvent(event);
      };
      evtSource.onerror = () => evtSource.close();
    } catch {
      // Still down — keep polling
    }
  }, 5000);
}

export function disconnectSSE() {
  if (evtSource) evtSource.close();
  if (pollInterval) clearInterval(pollInterval);
}
```

---

## app.js — Orchestrator

```javascript
import { fetchState, fetchStatus, fetchEvents } from './utils/api.js';
import { connectSSE } from './utils/sse.js';
import { renderAgentCards } from './components/agent-card.js';
import { renderFileTree } from './components/file-tree.js';
import { renderEventList, prependEvent } from './components/event-list.js';
import { renderTaskBoard } from './components/task-board.js';

// ── Initial Load ──
const state = await fetchState();
renderAgentCards(state.agents, state.lead);
renderFileTree(state.resources);
renderTaskBoard(state.tasks);

const events = await fetchEvents(50);
renderEventList(events);

// ── Health Polling ──
setInterval(async () => {
  const status = await fetchStatus();
  updateHealthBadge(status);
}, 5000);

// ── SSE Real-time ──
connectSSE(async (event) => {
  // Always add to timeline (except heartbeat)
  if (event.action !== 'agent.heartbeat') {
    prependEvent(event);
  }

  // Route to section updaters
  if (event.action.startsWith('agent.')) {
    const state = await fetchState();
    renderAgentCards(state.agents, state.lead);
  }
  if (event.action.startsWith('resource.')) {
    const state = await fetchState();
    renderFileTree(state.resources);
  }
  if (event.action.startsWith('task.') || event.action.startsWith('handoff.')) {
    const state = await fetchState();
    renderTaskBoard(state.tasks);
  }
});
```

---

## Component Specs

### components/agent-card.js

**Export:** `renderAgentCards(agents: Agent[], lead: string | null)`

**Renders into:** `#agent-cards`

**Per-agent card contents:**

| Element | Data | Style |
|---------|------|-------|
| Container | — | `.lg-glass-interactive`, lead card gets gold border (`--ap-gold`) |
| Agent ID | `agent.id` | `.lg-h6`, `font-family: var(--lg-font-mono)` |
| Tool badge | `agent.tool` | Pill: tool badge colors from DESIGN-TOKENS.md |
| Role badge | `agent.role` | Pill: role badge colors from DESIGN-TOKENS.md |
| Status dot | `agent.status` | 8px circle, `--ap-status-*` color, working gets `.ap-status-dot--working` pulse |
| Status label | `agent.status` | `.lg-body-sm`, text color matches status |
| Current task | `agent.current_task` | `.lg-caption`, show task title or "No active task" |
| Last heartbeat | `agent.last_heartbeat` | `.lg-caption`, relative time: "12s ago" |
| Capabilities | `agent.capabilities` | Small pills, `.lg-label`, neutral glass background |

**Empty state:** "No agents connected" — centered `.lg-caption` text.

**Stagger:** Cards appear with `ap-stagger-*` animation delays on initial load.

---

### components/file-tree.js

**Export:** `renderFileTree(resources: Resource[])`

**Renders into:** `#file-tree`

**Layout:** Flat list (not nested tree), grouped by state:

1. **Conflicted** (red left-border) — shown first with "CONFLICT" badge
2. **Claimed** (gold left-border) — show owner badge
3. **Free** (no border) — dimmer text

**Per-resource row:**

| Element | Data | Style |
|---------|------|-------|
| File path | `resource.path` | `var(--lg-font-mono)`, `.lg-code-sm` |
| State indicator | `resource.state` | Left border color per DESIGN-TOKENS.md file state table |
| Owner badge | `resource.owner` | Tool-colored pill (if claimed) |
| "CONFLICT" badge | — | Red pill, shown only if `state === 'conflicted'` |

**Conflict alert:** If any resource is `conflicted`, show a banner at the top of the section with `.ap-conflict-alert` shake animation.

**Empty state:** "No files tracked yet" — centered `.lg-caption`.

---

### components/event-list.js

**Exports:**
- `renderEventList(events: ProtocolEvent[])` — initial render
- `prependEvent(event: ProtocolEvent)` — add single event to top

**Renders into:** `#event-timeline`

**Layout:** Vertical scrolling list, newest at top. Max 100 visible events.

**Per-event row:**

| Element | Data | Style |
|---------|------|-------|
| Timestamp | `event.timestamp` | `.lg-caption`, `HH:MM:SS` format |
| Agent badge | `event.agent_id` | Pill with tool badge color (lookup agent tool from state) |
| Action text | (see mapping below) | `.lg-body-sm`, action-type color from DESIGN-TOKENS.md |

**Event-to-human-readable mapping:**

| Action | Display Text |
|--------|-------------|
| `agent.joined` | `"{agent_id} joined as {metadata.role}"` |
| `agent.left` | `"{agent_id} disconnected"` |
| `agent.heartbeat` | **Skip — do not render** |
| `agent.status_changed` | `"{agent_id} → {metadata.status}"` |
| `resource.claimed` | `"{agent_id} claimed {resource}"` |
| `resource.released` | `"{agent_id} released {resource}"` |
| `resource.modified` | `"{resource} modified"` |
| `resource.conflict_detected` | `"CONFLICT: {resource}"` |
| `resource.conflict_resolved` | `"{resource} conflict resolved"` |
| `task.created` | `"New task: {metadata.title}"` |
| `task.assigned` | `"{metadata.title} → {metadata.assigned_to}"` |
| `task.started` | `"{agent_id} started {metadata.title}"` |
| `task.completed` | `"{metadata.title} completed"` |
| `task.blocked` | `"{metadata.title} blocked"` |
| `handoff.initiated` | `"{agent_id} → handoff to {metadata.to_agent}"` |
| `handoff.accepted` | `"Handoff accepted by {agent_id}"` |
| `handoff.rejected` | `"Handoff rejected: {metadata.reason}"` |
| `authority.decision` | `"Authority: {metadata.type}"` |
| `authority.escalation` | `"Escalation: {metadata.type}"` |

**New event animation:** `.ap-event-enter` (slide-in from DESIGN-TOKENS.md).

**Auto-scroll:** Scroll to top on new event, unless user has manually scrolled down (detect `scrollTop > 0`).

---

### components/task-board.js

**Export:** `renderTaskBoard(tasks: Task[])`

**Renders into:** `#task-board`

**Layout:** Kanban-style columns, horizontal flexbox:

| Column | Status | Header Color |
|--------|--------|-------------|
| Queued | `queued` | `var(--lg-gray-8)` |
| Assigned | `assigned` | `var(--lg-primary-9)` |
| In Progress | `in_progress` | `var(--ap-gold)` |
| Review | `review` | `var(--lg-accent-9)` |
| Done | `done` | `var(--lg-success-9)` |
| Blocked | `blocked` | `var(--lg-danger-9)` |

**Per-column:** `.lg-glass-thin` background, column header with colored dot + label.

**Per-task card:**

| Element | Data | Style |
|---------|------|-------|
| Container | — | `.lg-glass-interactive` |
| Title | `task.title` | `.lg-h6`, `.lg-truncate` |
| Assigned to | `task.assigned_to` | Agent pill badge, or "Unassigned" in muted text |
| Resources | `task.resources.length` | `.lg-caption`: "3 files" |
| Created | `task.created_at` | `.lg-caption`, relative time |

**Empty column:** Don't render columns with zero tasks (keeps layout clean).

**Read-only:** No drag-and-drop in v1. Display only.

---

## styles.css — Dashboard Overrides

This file contains:
1. Agent Protocol semantic tokens (`--ap-*` variables from DESIGN-TOKENS.md)
2. Page background override (`body { background: var(--ap-bg-deep); }`)
3. Grid layout for `#app-main`
4. Section styling (headers, spacing)
5. Custom keyframe animations (`ap-pulse`, `ap-slide-in`, `ap-shake`)
6. Status dot styles
7. Badge styles (tool, role, status)
8. File state border styles
9. Responsive overrides (`@media max-width: 900px`)
10. Reduced motion overrides

**Do NOT duplicate liquid glass tokens** — only add `--ap-*` overrides.

---

## Liquid Glass Files to Copy

Copy these from `C:\Dev\Builds\lab\design-vault\liquid-glass\` into `dashboard/lg/`:

```
dashboard/lg/
├── colors.css              # from tokens/colors.css
├── typography.css           # from tokens/typography.css
├── elevation.css            # from tokens/elevation.css
├── motion.css               # from tokens/motion.css
├── materials.css            # from core/materials.css
└── dark-mode.css            # from core/dark-mode.css
```

**Do NOT copy:** effects/, components/, layout/, navigation/, surfaces/, js/ — not needed for v1 dashboard.

Only copy the token + material foundation. The dashboard components are custom vanilla JS.

---

## Verification Checklist

1. `http://localhost:4700/dashboard` loads and shows the 4 sections
2. Header shows green health dot when daemon is running
3. Connect an adapter → agent card appears without page refresh
4. Claim a file → file tree updates with gold highlight
5. Events scroll in timeline as they happen (SSE working)
6. Heartbeat events do NOT appear in timeline
7. Disconnect adapter → agent card disappears
8. Conflict state → red banner with shake animation
9. Glass surfaces have visible backdrop blur (not flat)
10. Responsive: stack to single column below 900px
11. Status dots pulse for working agents
12. New events slide in with animation
13. Lead agent card has gold border + glow
