/**
 * HTTP API Server — JSON-RPC over HTTP
 *
 * All adapter-to-daemon communication goes through this API.
 * SSE endpoint for real-time event streaming.
 */

import express, { type Request, type Response } from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StateManager } from '../core/state-manager.js';
import type { EventStore } from '../core/event-store.js';
import type { EventAction, ProtocolConfig } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createServer(
  stateManager: StateManager,
  eventStore: EventStore,
  config: ProtocolConfig,
): express.Application {
  const app = express();
  app.use(express.json());

  // ─── Dashboard Static Files ────────────────────────────
  app.use('/dashboard', express.static(resolve(__dirname, '../../dashboard')));

  // ─── Health ──────────────────────────────────────────

  app.get('/status', (_req: Request, res: Response) => {
    const snapshot = stateManager.snapshot();
    res.json({
      version: config.version,
      project: config.project,
      port: config.port,
      agents: {
        total: snapshot.agents.length,
        active: snapshot.agents.filter(a => a.status !== 'offline').length,
        lead: snapshot.lead,
      },
      resources: {
        total: snapshot.resources.length,
        claimed: snapshot.resources.filter(r => r.state === 'claimed').length,
        conflicted: snapshot.resources.filter(r => r.state === 'conflicted').length,
      },
      tasks: {
        total: snapshot.tasks.length,
        in_progress: snapshot.tasks.filter(t => t.status === 'in_progress').length,
        done: snapshot.tasks.filter(t => t.status === 'done').length,
      },
      event_count: snapshot.event_count,
    });
  });

  app.get('/state', (_req: Request, res: Response) => {
    res.json(stateManager.snapshot());
  });

  // ─── Agents ──────────────────────────────────────────

  app.post('/agents/announce', (req: Request, res: Response) => {
    const { id, tool, role, capabilities } = req.body;
    if (!id || !tool) {
      res.status(400).json({ error: 'id and tool are required' });
      return;
    }

    const agent = stateManager.registerAgent({
      id,
      tool,
      role: role ?? 'worker',
      capabilities: capabilities ?? ['code'],
    });

    res.status(201).json(agent);
  });

  app.post('/agents/:id/heartbeat', (req: Request, res: Response) => {
    const agent = stateManager.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    stateManager.heartbeat(req.params.id);
    res.json({ ok: true });
  });

  app.patch('/agents/:id/status', (req: Request, res: Response) => {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    stateManager.updateAgentStatus(req.params.id, status);
    res.json({ ok: true });
  });

  app.delete('/agents/:id', (req: Request, res: Response) => {
    stateManager.removeAgent(req.params.id);
    res.json({ ok: true });
  });

  app.get('/agents', (_req: Request, res: Response) => {
    res.json(stateManager.getAllAgents());
  });

  app.get('/agents/:id', (req: Request, res: Response) => {
    const agent = stateManager.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  // ─── Resources ───────────────────────────────────────

  app.post('/resources/claim', (req: Request, res: Response) => {
    const { path, agent_id, task_id } = req.body;
    if (!path || !agent_id) {
      res.status(400).json({ error: 'path and agent_id are required' });
      return;
    }
    const result = stateManager.claimResource(path, agent_id, task_id);
    res.status(result.granted ? 200 : 409).json(result);
  });

  app.post('/resources/release', (req: Request, res: Response) => {
    const { path, agent_id } = req.body;
    if (!path || !agent_id) {
      res.status(400).json({ error: 'path and agent_id are required' });
      return;
    }
    const released = stateManager.releaseResource(path, agent_id);
    res.json({ released });
  });

  app.get('/resources', (_req: Request, res: Response) => {
    const filter = (_req.query as Record<string, string>).filter;
    if (filter === 'claimed') {
      res.json(stateManager.getClaimedResources());
    } else if (filter === 'conflicted') {
      res.json(stateManager.getConflictedResources());
    } else {
      res.json(stateManager.getAllResources());
    }
  });

  app.get('/resources/:path(*)', (req: Request, res: Response) => {
    if (req.params.path.includes('..')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    const resource = stateManager.getResource(req.params.path);
    if (!resource) {
      res.status(404).json({ error: 'Resource not tracked' });
      return;
    }
    res.json(resource);
  });

  // ─── Tasks ───────────────────────────────────────────

  app.post('/tasks', (req: Request, res: Response) => {
    const { title, description, assigned_to, assigned_by, resources, depends_on } = req.body;
    if (!title || !assigned_by) {
      res.status(400).json({ error: 'title and assigned_by are required' });
      return;
    }
    const task = stateManager.createTask({
      title,
      description: description ?? '',
      assigned_to,
      assigned_by,
      resources,
      depends_on,
    });
    res.status(201).json(task);
  });

  app.patch('/tasks/:id', (req: Request, res: Response) => {
    const { status, agent_id } = req.body;
    if (!status || !agent_id) {
      res.status(400).json({ error: 'status and agent_id are required' });
      return;
    }
    const updated = stateManager.updateTaskStatus(req.params.id, status, agent_id);
    if (!updated) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/tasks', (_req: Request, res: Response) => {
    res.json(stateManager.getAllTasks());
  });

  // ─── Handoffs ────────────────────────────────────────

  app.post('/handoffs', (req: Request, res: Response) => {
    const { from_agent, task_id, summary } = req.body;
    if (!from_agent || !task_id || !summary) {
      res.status(400).json({ error: 'from_agent, task_id, and summary are required' });
      return;
    }
    const handoff = stateManager.createHandoff(req.body);
    res.status(201).json(handoff);
  });

  app.patch('/handoffs/:id/accept', (req: Request, res: Response) => {
    const { agent_id } = req.body;
    if (!agent_id) {
      res.status(400).json({ error: 'agent_id required' });
      return;
    }
    const accepted = stateManager.acceptHandoff(req.params.id, agent_id);
    res.json({ accepted });
  });

  app.patch('/handoffs/:id/reject', (req: Request, res: Response) => {
    const { agent_id, reason } = req.body;
    if (!agent_id) {
      res.status(400).json({ error: 'agent_id required' });
      return;
    }
    const rejected = stateManager.rejectHandoff(req.params.id, agent_id, reason ?? '');
    res.json({ rejected });
  });

  // ─── Events ──────────────────────────────────────────

  app.get('/events', (req: Request, res: Response) => {
    const query = req.query as Record<string, string>;
    const events = eventStore.query({
      agent_id: query.agent_id,
      action: query.action as EventAction | undefined,
      resource: query.resource,
      since: query.since ? parseInt(query.since) : undefined,
      limit: query.limit ? parseInt(query.limit) : 100,
    });
    res.json(events);
  });

  app.post('/events', (req: Request, res: Response) => {
    const event = eventStore.append(req.body);
    res.status(201).json(event);
  });

  // ─── SSE Event Stream ────────────────────────────────

  app.get('/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = eventStore.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  return app;
}
