# P-Reinforce Roadmap

## Principle

This roadmap is ordered by dependency, not by glamour.

The rule is simple:

- never optimize UI before truth storage
- never optimize automation before auditability
- never optimize intelligence before reversibility

## Full Roadmap

### Step 0. Thesis Lock

Goal:

- lock the product around Karpathy's persistent wiki idea
- define invariants
- define the long-horizon safety rules

Deliverables:

- blueprint
- storage principles
- automation philosophy

Exit criteria:

- team can explain why raw, wiki, and schema are separate

### Step 1. Studio Prototype

Goal:

- create a high-quality ingest and proposal workspace

Deliverables:

- text + image input
- markdown generation
- graph proposal
- deployable web UI

Exit criteria:

- user can turn raw input into structured wiki proposals in one session

### Step 2. Persistent Knowledge Contracts

Goal:

- move from "generated output" to "durable knowledge objects"

Deliverables:

- RawSource schema
- WikiNode schema
- PolicyState schema
- EventLog schema
- file and folder contracts

Exit criteria:

- every ingest has a stable source ID
- every node has a stable node ID
- every meaningful action is loggable

### Step 3. Information Architecture Expansion

Goal:

- turn the single-screen tool into a system product

Deliverables:

- Inbox
- Studio
- Garden
- Reinforce
- Timeline
- Schema Lab

Exit criteria:

- product navigation matches the true lifecycle of knowledge

### Step 4. Apply and Persist

Goal:

- persist outputs instead of only previewing them

Deliverables:

- save raw bundles
- save wiki nodes
- generate index and graph cache
- append log and events

Exit criteria:

- a generated node can be reopened later with provenance

### Step 5. Reinforcement Loop

Goal:

- teach the system user preference without corrupting truth

Deliverables:

- feedback capture UI
- policy.json
- Policy.md rationale updates
- confidence and trust thresholds

Exit criteria:

- user corrections change future behavior

### Step 6. Garden Health and Lint

Goal:

- maintain wiki integrity as it grows

Deliverables:

- orphan detection
- contradiction candidate detection
- stale page detection
- missing concept suggestions

Exit criteria:

- the system can explain the health of the knowledge base

### Step 7. Local Workspace Agent

Goal:

- support real filesystem ownership and raw folder workflows

Deliverables:

- local watcher
- file writer
- queue system
- workspace sync

Exit criteria:

- raw files dropped locally can be ingested into the same knowledge system

### Step 8. Git and GitHub Automation

Goal:

- make the wiki operationally durable

Deliverables:

- atomic commits
- push workflow
- failure reporting
- commit references

Exit criteria:

- wiki evolution is preserved as a timeline

### Step 9. Rebuild and Migration System

Goal:

- protect the user from early design mistakes

Deliverables:

- schema migrations
- template versioning
- replay and rebuild jobs
- diff-based regeneration

Exit criteria:

- a new model or better policy can improve old knowledge safely

### Step 10. 10-Year Reliability Mode

Goal:

- design for continuity, not novelty

Deliverables:

- backup strategy
- export strategy
- provider portability
- observability
- failure runbooks

Exit criteria:

- the system can survive model changes, UI changes, and infrastructure changes

## Current Position

### Where you are now

You are here:

`Step 1 complete -> entering Step 2`

Updated runtime truth after Step 7 queue/watcher wiring:

- serverless runtime: `Step 4 blocked -> Steps 5 and 6 await durable runtime`
- local filesystem runtime: `Step 7 complete -> entering Step 8`

### What is now true

- `Reinforce` can append policy updates without mutating wiki truth
- `Garden` can surface lint health and append lint events
- `Timeline` can show reinforcement and lint as first-class durable operations
- the local agent can scan `00_Raw/`, queue durable jobs, and process queued ingest work
- the workspace can explain whether Step 8 is blocked by missing Git or ready for a checkpoint

### What is still not true

- Git checkpoints are planned but not auto-committed yet
- GitHub push and failure recovery are not active yet
- rebuild and migration safety rails are still ahead

## Current Step Definition

### Current step

- serverless runtime: `Step 4. Apply and Persist` remains the active blocker
- local filesystem runtime: `Step 8. Git and GitHub Automation` is the next active blocker

Reason:

- Step 4 is the hard boundary in serverless mode because no browser-facing deployment should pretend ephemeral storage is durable
- Step 8 becomes the next blocker in local mode because queue-driven ingest now exists, but Git checkpoints are not yet durable commits

### What the current transition means

- the product has moved past "proposal only" on local durable storage
- user feedback now changes policy rather than silently disappearing
- garden health now has measurable signals instead of purely visual graph exploration

### Why this still depends on Step 2

- stable IDs, append-only events, and canonical vs derived boundaries are still the reason Steps 5 and 6 can exist safely
- Step 2 is no longer the active step, but it remains the foundation every later step stands on

## Progress Model

To avoid ambiguity, use this simple status language.

- `Not started`
- `In design`
- `Contracted`
- `Implemented`
- `Operational`
- `Hardened`

Current assessment:

| Area | Status |
|---|---|
| Karpathy alignment | Contracted |
| Studio UI | Implemented |
| Deployable web app | Implemented |
| Persistent raw layer | Implemented in local filesystem mode |
| Persistent wiki contracts | Implemented |
| Reinforcement policy loop | Implemented in local filesystem mode |
| Garden health/lint | Implemented in local filesystem mode |
| Local workspace agent | Implemented in local filesystem mode |
| Git automation | In design |
| Migration/rebuild system | Not started |
| 10-year reliability mode | Not started |

## What You Should Understand Right Now

At this moment, your project is no longer "an LLM note generator".

It is in the transition from:

- `a generation interface`

to:

- `a durable knowledge operating system`

That means your next wins are not visual polish.
Your next wins are contracts, IDs, provenance, logs, and rebuildability.

## Next Recommended Build Slice

The next concrete implementation slice should be:

1. turn Git checkpoint plans into audited local commits
2. add push/failure reporting on top of checkpoint creation
3. keep replay and migration independent from provider choice
4. harden long-horizon backup/export rules before full autonomy

## Rule For Every Future Step

At the end of every future implementation phase, always state:

- full roadmap
- current position
- current step
- why this step matters
- what became true
- what is still not true

This rule is part of the product process itself, because long-horizon systems fail when the builder loses orientation.

## Dependency Gates

Every roadmap step must declare what it depends on before implementation starts.

Dependency chain:

- `Step 1` depends on `Step 0`
- `Step 2` depends on `Step 0`, `Step 1`
- `Step 3` depends on `Step 1`, `Step 2`
- `Step 4` depends on `Step 2`, `Step 3`
- `Step 5` depends on `Step 2`, `Step 4`
- `Step 6` depends on `Step 2`, `Step 4`
- `Step 7` depends on `Step 2`, `Step 4`
- `Step 8` depends on `Step 4`, `Step 7`
- `Step 9` depends on `Step 2`, `Step 4`, `Step 8`
- `Step 10` depends on `Step 2`, `Step 4`, `Step 9`

Interpretation:

- no step advances only because the UI looks complete
- a later step can be visually prototyped, but it cannot be marked complete until its dependencies are true
- dependency failures are product truth, not implementation inconvenience

## Reflection Rule

Before moving from one step to the next, run reflection and ask:

1. What are we assuming is durable that is not actually durable?
2. What identity or logging field can collide under real usage?
3. What data structure silently mixes canonical and derived truth?
4. What part of the runtime is pretending to be production-safe while still being a proposal?

If reflection finds a critical error, fix the contract before building on top of it.
