# P-Reinforce Final Architecture

## Thesis

P-Reinforce exists because Andrej Karpathy's LLM Wiki idea is correct at the foundation:

- raw material must stay immutable
- knowledge should accumulate in a persistent wiki
- schema and maintenance logic should sit above both

This system is not a note beautifier.
It is a long-horizon knowledge operating system designed to survive model changes, UI rewrites, and infrastructure changes.

Reference:

- Karpathy LLM Wiki: <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

## Core Invariants

These rules are the non-negotiable center of the product:

1. `00_Raw/` is immutable source-of-truth input.
2. `10_Wiki/` is persistent knowledge, but always reconstructable from raw + policy + schema + event history.
3. `20_Meta/` contains the machine-readable operating memory of the system.
4. `30_Ops/` contains operational runtime state such as queues, watcher state, and future checkpoint jobs.
5. stable IDs matter more than filenames.
6. provenance matters more than summaries.
7. policy must influence future actions without mutating past truth silently.
8. derived artifacts such as `index.json` and `graph.cache.json` are rebuildable, not canonical.

## Filesystem Layers

```text
root/
+-- 00_Raw/
|   +-- YYYY/MM/DD/source_<id>/
|       +-- manifest.json
|       +-- source.md
|       +-- attachments/
|
+-- 10_Wiki/
|   +-- Projects/
|   +-- Topics/
|   +-- Decisions/
|   +-- Skills/
|
+-- 20_Meta/
|   +-- index.json
|   +-- graph.cache.json
|   +-- policy.json
|   +-- Policy.md
|   +-- events/
|
+-- 30_Ops/
    +-- jobs/
        +-- queue.json
        +-- agent-status.json
```

## Canonical vs Derived Artifacts

Canonical artifacts:

- `RawSourceManifest`
- `WikiNodeFrontmatter`
- `PolicyState`
- `EventLogEntry`
- `JobQueue`
- `AgentStatus`

Derived artifacts:

- `IndexJson`
- `GraphCache`

Interpretation:

- canonical artifacts must be durable and validated
- derived artifacts may be regenerated after corruption or migration
- no step may claim completion by updating derived views alone

## Runtime Modes

### 1. Serverless preview mode

Used by the deployed web app.

Truths:

- multimodal Gemini proposal generation works
- Markdown and graph previews work
- structural reflection works
- workspace truth is intentionally limited

Limits:

- no durable local filesystem ownership
- no durable apply path
- no real Step 5 to Step 8 completion claims

### 2. Local filesystem mode

Used for real long-term ownership.

Truths:

- raw bundles can persist
- wiki nodes can persist
- policy and lint artifacts can persist
- local queue and watcher state can persist
- persisted nodes can be reopened and inspected

Limits:

- Git automation is not fully operational yet
- rebuild and migration still need hardening

## Product Surface

### Inbox

Collects raw text and images before knowledge is formed.

### Studio

The current multimodal generation workspace.
It creates proposals, not truth.

### Garden

Shows the persisted knowledge terrain:

- category structure
- graph focus
- health and lint signals

### Reinforce

Captures user reward signals:

- confirm category
- move category
- tighten links

### Timeline

Shows durable operational events:

- capture
- propose
- apply
- reinforce
- lint
- agent activity

### Schema Lab

Shows the machine contract of the system:

- roadmap gates
- integrity state
- agent artifacts
- Git readiness

## Operational Flows

### Flow A. Capture

1. user enters text and optional images
2. raw bundle is formed with stable `source_id`
3. raw evidence is stored or proposed depending on runtime

### Flow B. Propose

1. Gemini analyzes the raw material
2. a draft wiki node is created
3. graph relationships are proposed
4. reflection warns if the proposal is not durable truth

### Flow C. Apply

1. proposal is explicitly applied
2. `10_Wiki/` node is persisted
3. `20_Meta/index.json` and `graph.cache.json` are regenerated
4. append-only event logs are written

### Flow D. Reinforce

1. user approves or corrects categorization or linking
2. `policy.json` and `Policy.md` update
3. future actions shift without rewriting historical truth

### Flow E. Lint

1. graph and index are scanned
2. orphan, weak-link, stale, contradiction candidates are surfaced
3. lint events are appended for later auditing

### Flow F. Local Agent

1. scan `00_Raw/`
2. queue ingest jobs in `30_Ops/jobs/queue.json`
3. process queued jobs into persisted knowledge
4. report status in `agent-status.json`

### Flow G. Git Checkpoint

Current state:

- Git readiness is detected
- dirty files are summarized
- a checkpoint plan is suggested

Not yet complete:

- audited commit execution
- push and retry logic
- remote failure handling

## Dependency Model

Roadmap steps must advance by dependency, not by UI completeness.

1. `Step 0. Thesis Lock`
2. `Step 1. Studio Prototype`
3. `Step 2. Persistent Knowledge Contracts`
4. `Step 3. Information Architecture Expansion`
5. `Step 4. Apply and Persist`
6. `Step 5. Reinforcement Loop`
7. `Step 6. Garden Health and Lint`
8. `Step 7. Local Workspace Agent`
9. `Step 8. Git and GitHub Automation`
10. `Step 9. Rebuild and Migration System`
11. `Step 10. 10-Year Reliability Mode`

Key dependencies:

- `Step 4` depends on `Step 2` and `Step 3`
- `Step 5`, `Step 6`, and `Step 7` depend on `Step 2` and `Step 4`
- `Step 8` depends on `Step 4` and `Step 7`
- `Step 9` depends on `Step 2`, `Step 4`, and `Step 8`
- `Step 10` depends on `Step 2`, `Step 4`, and `Step 9`

## Current Roadmap Position

Global position:

- the product has passed the single-screen prototype phase
- the product is now a durable local knowledge system with a partial operations layer

Runtime truth:

- serverless runtime: `Step 4 blocked -> Steps 5 and 6 await durable runtime`
- local filesystem runtime: `Step 7 complete -> entering Step 8`

Current step:

- serverless: `Step 4. Apply and Persist`
- local durable runtime: `Step 8. Git and GitHub Automation`

## What Is True Now

- multimodal proposal generation is live
- explicit apply flow separates proposal from truth
- persisted raw, wiki, policy, index, graph, and event artifacts exist in local mode
- persisted nodes can be reopened from Garden and Timeline
- reinforcement updates change policy without rewriting old wiki truth
- lint health is measurable and durable
- the local agent can scan raw manifests, queue ingest jobs, and process the queue
- Git readiness can explain whether Step 8 is blocked and can propose a checkpoint scope

## What Is Not True Yet

- Git commits are not automatically created by the product
- GitHub push and remote failure recovery are not operational
- replay and migration jobs are not complete
- backup/export hardening is not finished
- provider portability is not fully abstracted beyond the current Gemini-first path

## Commands

Development:

- `npm run dev`
- `npm run build`

Validation:

- `npm run verify:integrity`
- `npm run verify:workspace`

Local operations:

- `npm run agent:scan`
- `npm run agent:watch`
- `npm run git:status`

Required env for durable local mode:

- `P_REINFORCE_STORAGE_MODE=filesystem`
- `P_REINFORCE_WORKSPACE_ROOT=<workspace path>`

Optional:

- `P_REINFORCE_AGENT_MODE=manual`

## Reflection Rule

Before every roadmap transition, answer these questions:

1. what are we treating as durable that is not actually durable?
2. what can silently overwrite or erase knowledge?
3. what can no longer be reconstructed if the current provider disappears?
4. what would make a 10-year user regret the early architecture?

If any answer is uncomfortable, the step is not complete.

## Final Design Principle

P-Reinforce should never optimize for the illusion of intelligence over the durability of knowledge.

The right order is:

- truth
- provenance
- reversibility
- automation
- intelligence

Never the reverse.
