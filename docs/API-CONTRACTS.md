# API Contracts — Agent Protocol v0.1

## Base URL

```
http://localhost:4700
```

## Response Conventions

- All responses are JSON (`Content-Type: application/json`)
- Error shape: `{ error: string }`
- Success mutations return `{ ok: true }` or the created object
- All timestamps are **Unix epoch milliseconds** (`number`)
- IDs are strings — agent IDs are user-chosen, task IDs are `task_<nanoid>`, handoff IDs are `hoff_<nanoid>`, event IDs are `evt_<nanoid>`

---

## Endpoints

### Health & State

#### GET /status

Returns daemon health summary with counts.

**Response (200):**
```json
{
  "version": "0.1",
  "project": "project-name",
  "port": 4700,
  "agents": {
    "total": 2,
    "active": 2,
    "lead": "claude-code-1"
  },
  "resources": {
    "total": 5,
    "claimed": 2,
    "conflicted": 0
  },
  "tasks": {
    "total": 3,
    "in_progress": 1,
    "done": 1
  },
  "event_count": 42
}
```

#### GET /state

Returns full state snapshot.

**Response (200):**
```json
{
  "agents": Agent[],
  "resources": Resource[],
  "tasks": Task[],
  "handoffs": Handoff[],
  "lead": "claude-code-1" | null,
  "event_count": 42
}
```

---

### Agents

#### POST /agents/announce

Register a new agent with the daemon.

**Request:**
```json
{
  "id": "claude-code-1",
  "tool": "claude-code",
  "role": "lead",
  "capabilities": ["code", "review", "test"]
}
```
- `id` — required
- `tool` — required
- `role` — optional, defaults to `"worker"`
- `capabilities` — optional, defaults to `["code"]`

**Response (201):** Agent object
**Response (400):** `{ "error": "id and tool are required" }`

#### POST /agents/:id/heartbeat

Update agent's last_heartbeat timestamp.

**Response (200):** `{ "ok": true }`
**Response (404):** `{ "error": "Agent not found" }`

#### PATCH /agents/:id/status

Update agent's status.

**Request:**
```json
{
  "status": "working"
}
```
- `status` — required, one of: `"idle"`, `"working"`, `"blocked"`, `"waiting_review"`, `"offline"`

**Response (200):** `{ "ok": true }`
**Response (400):** `{ "error": "status is required" }`

#### DELETE /agents/:id

Deregister agent. Side effect: releases all resources owned by agent.

**Response (200):** `{ "ok": true }`

#### GET /agents

List all registered agents.

**Response (200):** `Agent[]`

#### GET /agents/:id

Get single agent by ID.

**Response (200):** `Agent`
**Response (404):** `{ "error": "Agent not found" }`

---

### Resources

#### POST /resources/claim

Claim ownership of a file before modifying it.

**Request:**
```json
{
  "path": "src/index.ts",
  "agent_id": "claude-code-1",
  "task_id": "task_abc123"
}
```
- `path` — required
- `agent_id` — required
- `task_id` — optional

**Response (200):** `{ "granted": true }`
**Response (409):** `{ "granted": false, "owner": "cursor-1", "reason": "Resource claimed by cursor-1" }`
**Response (400):** `{ "error": "path and agent_id are required" }`

#### POST /resources/release

Release ownership of a file.

**Request:**
```json
{
  "path": "src/index.ts",
  "agent_id": "claude-code-1"
}
```
- `path` — required
- `agent_id` — required

**Response (200):** `{ "released": true }`
**Response (400):** `{ "error": "path and agent_id are required" }`

#### GET /resources

List all tracked resources. Optional filter via query param.

**Query params:**
- `filter` — optional: `"claimed"` or `"conflicted"`

**Response (200):** `Resource[]`

#### GET /resources/:path(*)

Get single resource by path.

**Response (200):** `Resource`
**Response (404):** `{ "error": "Resource not tracked" }`

---

### Tasks

#### POST /tasks

Create a new task.

**Request:**
```json
{
  "title": "Implement auth module",
  "assigned_by": "claude-code-1",
  "description": "Build JWT auth",
  "assigned_to": "cursor-1",
  "resources": ["src/auth.ts"],
  "depends_on": ["task_xyz"]
}
```
- `title` — required
- `assigned_by` — required
- `description` — optional, defaults to `""`
- `assigned_to` — optional
- `resources` — optional
- `depends_on` — optional

**Response (201):** Task object
**Response (400):** `{ "error": "title and assigned_by are required" }`

#### PATCH /tasks/:id

Update task status.

**Request:**
```json
{
  "status": "in_progress",
  "agent_id": "cursor-1"
}
```
- `status` — required, one of: `"queued"`, `"assigned"`, `"in_progress"`, `"review"`, `"done"`, `"blocked"`
- `agent_id` — required

**Response (200):** `{ "ok": true }`
**Response (400):** `{ "error": "status and agent_id are required" }`
**Response (404):** `{ "error": "Task not found" }`

#### GET /tasks

List all tasks.

**Response (200):** `Task[]`

---

### Handoffs

#### POST /handoffs

Create a structured handoff between agents.

**Request:**
```json
{
  "from_agent": "claude-code-1",
  "to_agent": "cursor-1",
  "task_id": "task_abc123",
  "summary": "Completed auth module structure",
  "files_modified": ["src/auth.ts"],
  "files_created": ["src/auth-utils.ts"],
  "context": "JWT tokens with 1h expiry, refresh via httpOnly cookie",
  "blockers": ["Need rate limiting on /login"]
}
```

**Response (201):** Handoff object

#### PATCH /handoffs/:id/accept

Accept a handoff.

**Request:**
```json
{
  "agent_id": "cursor-1"
}
```

**Response (200):** `{ "accepted": true }`

#### PATCH /handoffs/:id/reject

Reject a handoff.

**Request:**
```json
{
  "agent_id": "cursor-1",
  "reason": "Missing test coverage"
}
```
- `reason` — optional, defaults to `""`

**Response (200):** `{ "rejected": true }`

---

### Events

#### GET /events

Query event history.

**Query params:**
- `agent_id` — filter by agent
- `action` — filter by action type
- `resource` — filter by resource path
- `since` — Unix timestamp, events after this time
- `limit` — max results, default `100`

**Response (200):** `ProtocolEvent[]`

#### POST /events

Append a custom event.

**Request:** Partial ProtocolEvent object (at minimum `agent_id` and `action`)

**Response (201):** ProtocolEvent object

#### GET /events/stream (SSE)

Real-time event stream via Server-Sent Events.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```
data: {"id":"evt_abc","timestamp":1700000000000,"agent_id":"claude-code-1","action":"resource.claimed","resource":"src/index.ts","task_id":null,"before_hash":null,"after_hash":null,"metadata":{}}\n\n
```

- No `event:` type field — all events use the default `message` type
- Each event is a single `data:` line with JSON, followed by `\n\n`
- Connection stays open until client disconnects
- Subscribe on client: `new EventSource('/events/stream')`

---

## Type Shapes

Copied verbatim from `src/core/types.ts`:

### Agent

```typescript
type AgentTool = 'claude-code' | 'cursor' | 'copilot' | 'codex' | 'openclaw' | string;
type AgentRole = 'lead' | 'specialist' | 'worker';
type AgentStatus = 'idle' | 'working' | 'blocked' | 'waiting_review' | 'offline';

interface Agent {
  id: string;
  tool: AgentTool;
  role: AgentRole;
  status: AgentStatus;
  current_task: string | null;
  capabilities: string[];
  joined_at: number;        // Unix epoch ms
  last_heartbeat: number;   // Unix epoch ms
}
```

### Resource

```typescript
type ResourceState = 'free' | 'claimed' | 'locked' | 'conflicted';

interface Resource {
  path: string;
  state: ResourceState;
  owner: string | null;         // agent_id if claimed
  claimed_at: number | null;    // Unix epoch ms
  last_modified_by: string | null;
  content_hash: string;
}

interface ClaimResult {
  granted: boolean;
  owner?: string;               // present if denied
  reason?: string;              // present if denied
}
```

### Task

```typescript
type TaskStatus = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  assigned_by: string;
  status: TaskStatus;
  resources: string[];          // file paths
  depends_on: string[];         // task IDs
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}
```

### ProtocolEvent

```typescript
type EventAction =
  | 'agent.joined' | 'agent.left' | 'agent.heartbeat' | 'agent.status_changed'
  | 'resource.claimed' | 'resource.released' | 'resource.modified'
  | 'resource.conflict_detected' | 'resource.conflict_resolved'
  | 'task.created' | 'task.assigned' | 'task.started' | 'task.completed' | 'task.blocked'
  | 'handoff.initiated' | 'handoff.accepted' | 'handoff.rejected'
  | 'authority.decision' | 'authority.escalation';

interface ProtocolEvent {
  id: string;
  timestamp: number;            // Unix epoch ms
  agent_id: string;
  action: EventAction;
  resource: string | null;
  task_id: string | null;
  before_hash: string | null;
  after_hash: string | null;
  metadata: Record<string, unknown>;
}
```

### Handoff

```typescript
type HandoffStatus = 'pending' | 'accepted' | 'rejected';

interface Handoff {
  id: string;
  from_agent: string;
  to_agent: string | null;
  task_id: string;
  status: HandoffStatus;
  summary: string;
  files_modified: string[];
  files_created: string[];
  context: string;
  blockers: string[];
  created_at: number;           // Unix epoch ms
}
```

### State Snapshot (GET /state response)

```typescript
interface StateSnapshot {
  agents: Agent[];
  resources: Resource[];
  tasks: Task[];
  handoffs: Handoff[];
  lead: string | null;          // agent_id of lead agent
  event_count: number;
}
```
