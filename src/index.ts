/**
 * Agent Protocol Daemon
 *
 * The coordination layer AI agents are missing.
 * Manages shared state, resource ownership, conflict detection,
 * and authority hierarchy for cross-tool AI coding agents.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventStore } from './core/event-store.js';
import { StateManager } from './core/state-manager.js';
import { createServer } from './api/server.js';
import { FileWatcher } from './watchers/file-watcher.js';
import { DEFAULT_CONFIG, type ProtocolConfig } from './core/types.js';

export interface DaemonOptions {
  projectRoot: string;
  config?: Partial<ProtocolConfig>;
}

export class Daemon {
  private eventStore!: EventStore;
  private stateManager!: StateManager;
  private fileWatcher!: FileWatcher;
  private config: ProtocolConfig;
  private projectRoot: string;
  private server: ReturnType<typeof createServer> | null = null;
  private httpServer: import('node:http').Server | null = null;
  private heartbeatChecker: ReturnType<typeof setInterval> | null = null;

  constructor(options: DaemonOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.projectRoot = resolve(options.projectRoot);

    const protocolDir = resolve(this.projectRoot, '.agent-protocol');
    if (!existsSync(protocolDir)) {
      mkdirSync(protocolDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    const dbPath = resolve(this.projectRoot, this.config.storage.path);
    this.eventStore = await EventStore.create(dbPath);
    this.stateManager = new StateManager(this.eventStore, this.config);
    this.fileWatcher = new FileWatcher(this.projectRoot, this.stateManager, this.eventStore, this.config);
    this.server = createServer(this.stateManager, this.eventStore, this.config);

    return new Promise((resolvePromise) => {
      this.httpServer = this.server!.listen(this.config.port, () => {
        console.log(`\n  Agent Protocol Daemon v${this.config.version}`);
        console.log(`  Project: ${this.config.project}`);
        console.log(`  Listening on: http://localhost:${this.config.port}`);
        console.log(`  File watcher: active`);
        console.log(`  Status: http://localhost:${this.config.port}/status\n`);

        this.eventStore.append({
          agent_id: 'system',
          action: 'agent.joined',
          metadata: { type: 'daemon_started', port: this.config.port },
        });

        // Start file watcher
        this.fileWatcher.start();

        // Start periodic heartbeat checker
        this.heartbeatChecker = setInterval(() => {
          this.stateManager.checkDeadAgents();
        }, this.config.heartbeat_interval_ms);

        resolvePromise();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
    }

    this.fileWatcher.stop();

    return new Promise((resolvePromise) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.eventStore?.close();
          console.log('\n  Daemon stopped.\n');
          resolvePromise();
        });
      } else {
        this.eventStore?.close();
        resolvePromise();
      }
    });
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  getEventStore(): EventStore {
    return this.eventStore;
  }

  getConfig(): ProtocolConfig {
    return this.config;
  }
}

// Direct execution — only when run as main entry point (not when imported by tests)
const isDirectExecution = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectExecution && !process.argv[1]?.includes('vitest') && !process.argv[1]?.includes('node_modules')) {
  const daemon = new Daemon({
    projectRoot: process.cwd(),
    config: { project: process.cwd().split('/').pop() ?? 'unnamed' },
  });

  daemon.start().catch(console.error);

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });
}
