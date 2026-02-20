# Agent Protocol

**The cross-tool coordination layer AI agents are missing.**

When you run multiple AI coding agents (Claude Code, Cursor, Codex, Copilot) on the same codebase, they overwrite each other's files, duplicate work, lose context, and ignore hierarchy. No existing protocol solves this.

Agent Protocol gives cross-tool AI agents a **shared state layer** — resource ownership, conflict detection, authority hierarchy, and structured handoffs — without modifying the agents themselves.

## What It Solves

| Problem | Solution |
|---|---|
| Agents overwrite each other's files | Resource ownership — must claim before edit |
| Duplicated work across agents | Task tracking — agents see what others are doing |
| No awareness of other agents | State injection — CLAUDE.md / workspace markers |
| Ignoring lead orchestrator | Authority hierarchy — lead assigns, workers execute |
| Silent handoff failures | Structured handoffs with context and file lists |

## Quick Start

```bash
# Initialize in your project
npx agent-protocol init

# Start the daemon
npx agent-protocol start

# Check status
npx agent-protocol status

# View event log
npx agent-protocol log
```

## Architecture

```
┌─────────────────────────────────────────┐
│            Agent Protocol Daemon         │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ HTTP API  │ │Event Bus │ │File Watch ││
│  └─────┬────┘ └────┬─────┘ └────┬─────┘│
│        └───────────┼────────────┘       │
│              ┌─────┴─────┐              │
│              │   State    │              │
│              │  Manager   │              │
│              └─────┬─────┘              │
│              ┌─────┴─────┐              │
│              │  SQLite DB │              │
│              └───────────┘              │
└─────────────────────────────────────────┘
        ▲                    ▲
        │                    │
  ┌─────┴──────┐      ┌─────┴──────┐
  │Claude Code │      │  Cursor    │
  │  Adapter   │      │  Adapter   │
  └────────────┘      └────────────┘
```

## Status

**v0.1** — Protocol spec + daemon + Claude Code adapter. Two-agent coordination (Claude Code + Cursor).

## License

Apache-2.0
