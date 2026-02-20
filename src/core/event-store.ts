/**
 * Event Store — Append-only immutable event log
 *
 * Every action in the protocol produces an event.
 * Events are the source of truth. State is derived from events.
 * Uses sql.js (pure JS SQLite) — no native build tools required.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import initSqlJs, { type SqlJsDatabase } from 'sql.js';
import { nanoid } from 'nanoid';
import type { ProtocolEvent, EventAction } from './types.js';

export class EventStore {
  private db: SqlJsDatabase;
  private dbPath: string;
  private listeners: Array<(event: ProtocolEvent) => void> = [];

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<EventStore> {
    const SQL = await initSqlJs();
    let db: SqlJsDatabase;

    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(buffer));
    } else {
      db = new SQL.Database();
    }

    const store = new EventStore(db, dbPath);
    store.initSchema();
    return store;
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        task_id TEXT,
        before_hash TEXT,
        after_hash TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_resource ON events(resource)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_action ON events(action)`);
  }

  private persist(): void {
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  /**
   * Append an event to the store. Returns the full event with generated id/timestamp.
   */
  append(params: {
    agent_id: string;
    action: EventAction;
    resource?: string | null;
    task_id?: string | null;
    before_hash?: string | null;
    after_hash?: string | null;
    metadata?: Record<string, unknown>;
  }): ProtocolEvent {
    const event: ProtocolEvent = {
      id: `evt_${nanoid(12)}`,
      timestamp: Date.now(),
      agent_id: params.agent_id,
      action: params.action,
      resource: params.resource ?? null,
      task_id: params.task_id ?? null,
      before_hash: params.before_hash ?? null,
      after_hash: params.after_hash ?? null,
      metadata: params.metadata ?? {},
    };

    const stmt = this.db.prepare(`
      INSERT INTO events (id, timestamp, agent_id, action, resource, task_id, before_hash, after_hash, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      event.id,
      event.timestamp,
      event.agent_id,
      event.action,
      event.resource,
      event.task_id,
      event.before_hash,
      event.after_hash,
      JSON.stringify(event.metadata),
    ]);
    stmt.step();
    stmt.free();

    this.persist();

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the event store
      }
    }

    return event;
  }

  /**
   * Query events with optional filters
   */
  query(filters?: {
    agent_id?: string;
    action?: EventAction;
    resource?: string;
    since?: number;
    limit?: number;
  }): ProtocolEvent[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.agent_id) {
      conditions.push('agent_id = ?');
      params.push(filters.agent_id);
    }
    if (filters?.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }
    if (filters?.resource) {
      conditions.push('resource = ?');
      params.push(filters.resource);
    }
    if (filters?.since) {
      conditions.push('timestamp >= ?');
      params.push(filters.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 1000;

    const stmt = this.db.prepare(
      `SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ?`
    );
    stmt.bind([...params, limit]);

    const rows: Array<Record<string, unknown>> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      rows.push(row);
    }
    stmt.free();

    return rows.map(row => ({
      ...row,
      metadata: JSON.parse(row.metadata as string),
    })) as ProtocolEvent[];
  }

  /**
   * Get the last event for a specific resource
   */
  lastEventForResource(path: string): ProtocolEvent | null {
    const stmt = this.db.prepare(
      'SELECT * FROM events WHERE resource = ? ORDER BY timestamp DESC LIMIT 1'
    );
    stmt.bind([path]);
    const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : null;
    stmt.free();

    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata as string) } as ProtocolEvent;
  }

  /**
   * Subscribe to new events in real-time
   */
  subscribe(callback: (event: ProtocolEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Get total event count
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
