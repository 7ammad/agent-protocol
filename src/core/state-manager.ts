/**
 * State Manager — Real-time in-memory state derived from events
 *
 * Manages agents, resources, tasks, and handoffs.
 * All state mutations go through the event store first.
 * State is a projection of the event log.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { EventStore } from './event-store.js';
import type {
  Agent, AgentRole, AgentStatus, AgentTool,
  Resource, ResourceState, ClaimResult,
  Task, TaskStatus,
  Handoff, HandoffStatus,
  EventAction,
  ProtocolConfig,
} from './types.js';

export class StateManager {
  private agents: Map<string, Agent> = new Map();
  private resources: Map<string, Resource> = new Map();
  private tasks: Map<string, Task> = new Map();
  private handoffs: Map<string, Handoff> = new Map();

  constructor(
    private eventStore: EventStore,
    private config: ProtocolConfig,
  ) {}

  // ─── Agent Operations ──────────────────────────────────

  registerAgent(params: {
    id: string;
    tool: AgentTool;
    role: AgentRole;
    capabilities: string[];
  }): Agent {
    const agent: Agent = {
      id: params.id,
      tool: params.tool,
      role: params.role,
      status: 'idle',
      current_task: null,
      capabilities: params.capabilities,
      joined_at: Date.now(),
      last_heartbeat: Date.now(),
    };

    this.agents.set(agent.id, agent);

    // If this is the first agent and no lead is set, make it the lead
    if (!this.config.lead_agent && this.agents.size === 1) {
      agent.role = 'lead';
      this.config.lead_agent = agent.id;
    }

    this.eventStore.append({
      agent_id: agent.id,
      action: 'agent.joined',
      metadata: {
        tool: agent.tool,
        role: agent.role,
        capabilities: agent.capabilities,
      },
    });

    return agent;
  }

  removeAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Release all resources owned by this agent
    for (const [path, resource] of this.resources) {
      if (resource.owner === agentId) {
        this.releaseResource(path, agentId);
      }
    }

    this.agents.delete(agentId);

    this.eventStore.append({
      agent_id: agentId,
      action: 'agent.left',
    });

    // If lead left, promote next in line
    if (this.config.lead_agent === agentId) {
      this.promoteLead();
    }
  }

  heartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.last_heartbeat = Date.now();

    this.eventStore.append({
      agent_id: agentId,
      action: 'agent.heartbeat',
    });
  }

  updateAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const oldStatus = agent.status;
    agent.status = status;
    agent.last_heartbeat = Date.now();

    this.eventStore.append({
      agent_id: agentId,
      action: 'agent.status_changed',
      metadata: { from: oldStatus, to: status },
    });
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getLeadAgent(): Agent | undefined {
    if (!this.config.lead_agent) return undefined;
    return this.agents.get(this.config.lead_agent);
  }

  private promoteLead(): void {
    // Find the best candidate: longest-running specialist, then longest-running worker
    const candidates = Array.from(this.agents.values())
      .filter(a => a.status !== 'offline')
      .sort((a, b) => {
        if (a.role === 'specialist' && b.role !== 'specialist') return -1;
        if (b.role === 'specialist' && a.role !== 'specialist') return 1;
        return a.joined_at - b.joined_at; // oldest first
      });

    if (candidates.length > 0) {
      const newLead = candidates[0];
      newLead.role = 'lead';
      this.config.lead_agent = newLead.id;

      this.eventStore.append({
        agent_id: 'system',
        action: 'authority.decision',
        metadata: {
          type: 'lead_promotion',
          new_lead: newLead.id,
          reason: 'previous_lead_departed',
        },
      });
    } else {
      this.config.lead_agent = null;
    }
  }

  /**
   * Check for dead agents (missed heartbeats beyond timeout)
   */
  checkDeadAgents(): string[] {
    const now = Date.now();
    const deadAgents: string[] = [];

    for (const [id, agent] of this.agents) {
      if (now - agent.last_heartbeat > this.config.dead_agent_timeout_ms) {
        agent.status = 'offline';
        deadAgents.push(id);

        this.eventStore.append({
          agent_id: 'system',
          action: 'agent.status_changed',
          metadata: {
            agent: id,
            from: agent.status,
            to: 'offline',
            reason: 'heartbeat_timeout',
          },
        });
      }
    }

    // If lead is dead, promote
    if (this.config.lead_agent && deadAgents.includes(this.config.lead_agent)) {
      this.promoteLead();
    }

    return deadAgents;
  }

  // ─── Resource Operations ───────────────────────────────

  claimResource(path: string, agentId: string, taskId?: string): ClaimResult {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { granted: false, reason: 'Agent not registered' };
    }

    const resource = this.resources.get(path);

    if (!resource) {
      // New resource — auto-create and grant
      const hash = this.hashFile(path);
      const newResource: Resource = {
        path,
        state: 'claimed',
        owner: agentId,
        claimed_at: Date.now(),
        last_modified_by: null,
        content_hash: hash,
      };
      this.resources.set(path, newResource);

      this.eventStore.append({
        agent_id: agentId,
        action: 'resource.claimed',
        resource: path,
        task_id: taskId ?? null,
        metadata: { initial_claim: true },
      });

      return { granted: true };
    }

    switch (resource.state) {
      case 'free': {
        resource.state = 'claimed';
        resource.owner = agentId;
        resource.claimed_at = Date.now();

        this.eventStore.append({
          agent_id: agentId,
          action: 'resource.claimed',
          resource: path,
          task_id: taskId ?? null,
        });

        return { granted: true };
      }

      case 'claimed': {
        if (resource.owner === agentId) {
          return { granted: true }; // Already owns it
        }
        return {
          granted: false,
          owner: resource.owner!,
          reason: `Resource claimed by ${resource.owner}`,
        };
      }

      case 'locked': {
        return {
          granted: false,
          owner: resource.owner!,
          reason: `Resource locked by lead agent (${resource.owner})`,
        };
      }

      case 'conflicted': {
        return {
          granted: false,
          reason: 'Resource is in conflict state — resolve conflict first',
        };
      }

      default:
        return { granted: false, reason: 'Unknown resource state' };
    }
  }

  releaseResource(path: string, agentId: string): boolean {
    const resource = this.resources.get(path);
    if (!resource) return false;
    if (resource.owner !== agentId) return false;

    const hash = this.hashFile(path);
    resource.state = 'free';
    resource.owner = null;
    resource.claimed_at = null;
    resource.last_modified_by = agentId;
    resource.content_hash = hash;

    this.eventStore.append({
      agent_id: agentId,
      action: 'resource.released',
      resource: path,
      after_hash: hash,
    });

    return true;
  }

  lockResource(path: string, agentId: string): boolean {
    // Only lead can lock
    if (agentId !== this.config.lead_agent) return false;

    let resource = this.resources.get(path);
    if (!resource) {
      resource = {
        path,
        state: 'locked',
        owner: agentId,
        claimed_at: Date.now(),
        last_modified_by: null,
        content_hash: this.hashFile(path),
      };
      this.resources.set(path, resource);
    } else {
      resource.state = 'locked';
      resource.owner = agentId;
    }

    return true;
  }

  /**
   * Detect conflict: called when file watcher sees an unexpected modification
   */
  detectConflict(path: string, modifyingAgent: string): void {
    const resource = this.resources.get(path);
    if (!resource) return;

    if (resource.owner && resource.owner !== modifyingAgent) {
      resource.state = 'conflicted';

      this.eventStore.append({
        agent_id: 'system',
        action: 'resource.conflict_detected',
        resource: path,
        before_hash: resource.content_hash,
        after_hash: this.hashFile(path),
        metadata: {
          agents_involved: [resource.owner, modifyingAgent],
          previous_owner: resource.owner,
          intruder: modifyingAgent,
        },
      });
    }
  }

  resolveConflict(path: string, resolution: 'pick_a' | 'pick_b' | 'merge' | 'reassign', resolvedBy: string): void {
    const resource = this.resources.get(path);
    if (!resource || resource.state !== 'conflicted') return;

    resource.state = 'free';
    resource.owner = null;
    resource.content_hash = this.hashFile(path);

    this.eventStore.append({
      agent_id: resolvedBy,
      action: 'resource.conflict_resolved',
      resource: path,
      metadata: { resolution },
    });
  }

  getResource(path: string): Resource | undefined {
    return this.resources.get(path);
  }

  getAllResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  getClaimedResources(): Resource[] {
    return Array.from(this.resources.values()).filter(r => r.state === 'claimed');
  }

  getConflictedResources(): Resource[] {
    return Array.from(this.resources.values()).filter(r => r.state === 'conflicted');
  }

  // ─── Task Operations ───────────────────────────────────

  createTask(params: {
    title: string;
    description: string;
    assigned_to?: string | null;
    assigned_by: string;
    resources?: string[];
    depends_on?: string[];
  }): Task {
    const task: Task = {
      id: `task_${nanoid(8)}`,
      title: params.title,
      description: params.description,
      assigned_to: params.assigned_to ?? null,
      assigned_by: params.assigned_by,
      status: params.assigned_to ? 'assigned' : 'queued',
      resources: params.resources ?? [],
      depends_on: params.depends_on ?? [],
      created_at: Date.now(),
      started_at: null,
      completed_at: null,
    };

    this.tasks.set(task.id, task);

    this.eventStore.append({
      agent_id: params.assigned_by,
      action: 'task.created',
      task_id: task.id,
      metadata: { title: task.title, assigned_to: task.assigned_to },
    });

    return task;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, agentId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const oldStatus = task.status;
    task.status = status;

    if (status === 'in_progress' && !task.started_at) {
      task.started_at = Date.now();
    }
    if (status === 'done') {
      task.completed_at = Date.now();
    }

    const actionMap: Record<string, EventAction> = {
      in_progress: 'task.started',
      done: 'task.completed',
      blocked: 'task.blocked',
      assigned: 'task.assigned',
    };

    this.eventStore.append({
      agent_id: agentId,
      action: actionMap[status] ?? 'task.started',
      task_id: taskId,
      metadata: { from: oldStatus, to: status },
    });

    return true;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  // ─── Handoff Operations ────────────────────────────────

  createHandoff(params: {
    from_agent: string;
    to_agent?: string | null;
    task_id: string;
    summary: string;
    files_modified: string[];
    files_created: string[];
    context: string;
    blockers: string[];
  }): Handoff {
    const handoff: Handoff = {
      id: `hoff_${nanoid(8)}`,
      from_agent: params.from_agent,
      to_agent: params.to_agent ?? null,
      task_id: params.task_id,
      status: 'pending',
      summary: params.summary,
      files_modified: params.files_modified,
      files_created: params.files_created,
      context: params.context,
      blockers: params.blockers,
      created_at: Date.now(),
    };

    this.handoffs.set(handoff.id, handoff);

    this.eventStore.append({
      agent_id: params.from_agent,
      action: 'handoff.initiated',
      task_id: params.task_id,
      metadata: {
        handoff_id: handoff.id,
        to_agent: handoff.to_agent,
        files_count: handoff.files_modified.length + handoff.files_created.length,
      },
    });

    return handoff;
  }

  acceptHandoff(handoffId: string, agentId: string): boolean {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff || handoff.status !== 'pending') return false;

    handoff.status = 'accepted';

    this.eventStore.append({
      agent_id: agentId,
      action: 'handoff.accepted',
      task_id: handoff.task_id,
      metadata: { handoff_id: handoffId },
    });

    return true;
  }

  rejectHandoff(handoffId: string, agentId: string, reason: string): boolean {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff || handoff.status !== 'pending') return false;

    handoff.status = 'rejected';

    this.eventStore.append({
      agent_id: agentId,
      action: 'handoff.rejected',
      task_id: handoff.task_id,
      metadata: { handoff_id: handoffId, reason },
    });

    return true;
  }

  getPendingHandoffs(): Handoff[] {
    return Array.from(this.handoffs.values()).filter(h => h.status === 'pending');
  }

  // ─── State Snapshot ────────────────────────────────────

  snapshot(): {
    agents: Agent[];
    resources: Resource[];
    tasks: Task[];
    handoffs: Handoff[];
    lead: string | null;
    event_count: number;
  } {
    return {
      agents: this.getAllAgents(),
      resources: this.getAllResources(),
      tasks: this.getAllTasks(),
      handoffs: Array.from(this.handoffs.values()),
      lead: this.config.lead_agent,
      event_count: this.eventStore.count(),
    };
  }

  // ─── Utilities ─────────────────────────────────────────

  private hashFile(path: string): string {
    try {
      if (!existsSync(path)) return 'file_not_found';
      const content = readFileSync(path);
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      return 'hash_error';
    }
  }
}
