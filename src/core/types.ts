/**
 * Core types for the Agent Protocol
 * Cross-tool coordination protocol for AI coding agents
 */

// ─── Agent ───────────────────────────────────────────────

export type AgentTool = 'claude-code' | 'cursor' | 'copilot' | 'codex' | 'openclaw' | string;
export type AgentRole = 'lead' | 'specialist' | 'worker';
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'waiting_review' | 'offline';

export interface Agent {
  id: string;
  tool: AgentTool;
  role: AgentRole;
  status: AgentStatus;
  current_task: string | null;
  capabilities: string[];
  joined_at: number;
  last_heartbeat: number;
}

// ─── Resource ────────────────────────────────────────────

export type ResourceState = 'free' | 'claimed' | 'locked' | 'conflicted';

export interface Resource {
  path: string;
  state: ResourceState;
  owner: string | null;
  claimed_at: number | null;
  last_modified_by: string | null;
  content_hash: string;
}

export interface ClaimResult {
  granted: boolean;
  owner?: string;
  reason?: string;
}

// ─── Task ────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  assigned_by: string;
  status: TaskStatus;
  resources: string[];
  depends_on: string[];
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

// ─── Event ───────────────────────────────────────────────

export type EventAction =
  | 'agent.joined'
  | 'agent.left'
  | 'agent.heartbeat'
  | 'agent.status_changed'
  | 'resource.claimed'
  | 'resource.released'
  | 'resource.modified'
  | 'resource.conflict_detected'
  | 'resource.conflict_resolved'
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.blocked'
  | 'handoff.initiated'
  | 'handoff.accepted'
  | 'handoff.rejected'
  | 'authority.decision'
  | 'authority.escalation';

export interface ProtocolEvent {
  id: string;
  timestamp: number;
  agent_id: string;
  action: EventAction;
  resource: string | null;
  task_id: string | null;
  before_hash: string | null;
  after_hash: string | null;
  metadata: Record<string, unknown>;
}

// ─── Handoff ─────────────────────────────────────────────

export type HandoffStatus = 'pending' | 'accepted' | 'rejected';

export interface Handoff {
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
  created_at: number;
}

// ─── Config ──────────────────────────────────────────────

export interface ProtocolConfig {
  version: string;
  project: string;
  port: number;
  lead_agent: string | null;
  detection_window_ms: number;
  heartbeat_interval_ms: number;
  dead_agent_timeout_ms: number;
  tracked_paths: string[];
  ignored_paths: string[];
  storage: {
    type: 'sqlite';
    path: string;
  };
}

export const DEFAULT_CONFIG: ProtocolConfig = {
  version: '0.1',
  project: 'unnamed-project',
  port: 4700,
  lead_agent: null,
  detection_window_ms: 5000,
  heartbeat_interval_ms: 30000,
  dead_agent_timeout_ms: 60000,
  tracked_paths: ['src/**', 'lib/**', 'tests/**'],
  ignored_paths: ['node_modules/**', '.git/**', 'dist/**', '.agent-protocol/**'],
  storage: {
    type: 'sqlite',
    path: '.agent-protocol/protocol.db',
  },
};
