/**
 * File Watcher — Observes filesystem changes
 *
 * Watches the project directory for file modifications.
 * When a file changes, checks resource ownership and detects conflicts.
 * This is the primary detection mechanism for v0.1 (non-invasive).
 */

import chokidar from 'chokidar';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import type { StateManager } from '../core/state-manager.js';
import type { EventStore } from '../core/event-store.js';
import type { ProtocolConfig } from '../core/types.js';

export class FileWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private projectRoot: string;
  private lastHashes: Map<string, string> = new Map();

  constructor(
    projectRoot: string,
    private stateManager: StateManager,
    private eventStore: EventStore,
    private config: ProtocolConfig,
  ) {
    this.projectRoot = projectRoot;
  }

  start(): void {
    const watchPaths = this.config.tracked_paths.map(p =>
      `${this.projectRoot}/${p}`
    );

    this.watcher = chokidar.watch(watchPaths, {
      ignored: [
        ...this.config.ignored_paths.map(p => `**/${p}`),
        '**/.agent-protocol/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('change', (filePath: string) => this.handleChange(filePath))
      .on('add', (filePath: string) => this.handleAdd(filePath))
      .on('unlink', (filePath: string) => this.handleDelete(filePath));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private handleChange(absolutePath: string): void {
    const relPath = relative(this.projectRoot, absolutePath);
    const currentHash = this.hashFile(absolutePath);
    const previousHash = this.lastHashes.get(relPath);

    // Skip if hash hasn't actually changed (false positive)
    if (currentHash === previousHash) return;

    this.lastHashes.set(relPath, currentHash);

    const resource = this.stateManager.getResource(relPath);

    if (!resource) {
      // Untracked file changed — just log it
      this.eventStore.append({
        agent_id: 'watcher',
        action: 'resource.modified',
        resource: relPath,
        before_hash: previousHash ?? null,
        after_hash: currentHash,
        metadata: { tracked: false },
      });
      return;
    }

    if (resource.state === 'claimed' && resource.owner) {
      // File is claimed — check if the hash matches expectations
      if (resource.content_hash !== currentHash) {
        // The file changed while claimed — this is expected if the owner is editing
        // We record the modification
        this.eventStore.append({
          agent_id: resource.owner,
          action: 'resource.modified',
          resource: relPath,
          before_hash: resource.content_hash,
          after_hash: currentHash,
        });
        resource.content_hash = currentHash;
      }
    } else if (resource.state === 'free') {
      // Free file changed — someone is editing without claiming
      // This is a potential conflict source. Log it as an unclaimed modification
      this.eventStore.append({
        agent_id: 'unknown',
        action: 'resource.modified',
        resource: relPath,
        before_hash: resource.content_hash,
        after_hash: currentHash,
        metadata: { warning: 'unclaimed_modification' },
      });
      resource.content_hash = currentHash;
    }
  }

  private handleAdd(absolutePath: string): void {
    const relPath = relative(this.projectRoot, absolutePath);
    const hash = this.hashFile(absolutePath);
    this.lastHashes.set(relPath, hash);

    this.eventStore.append({
      agent_id: 'watcher',
      action: 'resource.modified',
      resource: relPath,
      after_hash: hash,
      metadata: { type: 'file_created' },
    });
  }

  private handleDelete(absolutePath: string): void {
    const relPath = relative(this.projectRoot, absolutePath);
    this.lastHashes.delete(relPath);

    this.eventStore.append({
      agent_id: 'watcher',
      action: 'resource.modified',
      resource: relPath,
      metadata: { type: 'file_deleted' },
    });
  }

  private hashFile(path: string): string {
    try {
      if (!existsSync(path)) return 'deleted';
      const content = readFileSync(path);
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      return 'hash_error';
    }
  }
}
