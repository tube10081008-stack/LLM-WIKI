# Step 7 Local Workspace Agent

## Purpose

Step 7 exists to move from "durable files" to "durable operations".

The local agent does three things first:

- scans `00_Raw/` for persisted raw manifests
- creates durable ingest jobs in `30_Ops/jobs/queue.json`
- records watcher state in `30_Ops/jobs/agent-status.json`

## Commands

- `npm run agent:scan`
- `npm run agent:watch`

Both commands require:

- `P_REINFORCE_STORAGE_MODE=filesystem`
- `P_REINFORCE_WORKSPACE_ROOT=<workspace path>`

## What is true now

- the queue is durable
- the watcher status is durable
- manual scans can append queue jobs and capture events
- the UI can read queue depth, recent jobs, and watcher state

## What is not true yet

- queued jobs are not executed automatically into ingest/apply
- retries and backoff are not implemented
- Git automation is not connected yet
