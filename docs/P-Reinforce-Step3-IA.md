# P-Reinforce Step 3 Information Architecture

## Step

`Step 3. Information Architecture Expansion`

This step does not replace the Studio.
It places the Studio inside the full lifecycle of knowledge.

## Why This Step Exists

The Step 1 prototype proved that raw input can become a proposal.

But a 10-year knowledge system cannot live inside one screen.
The user must be able to see:

- where raw evidence begins
- where structured knowledge is proposed
- where the graph and category system are inspected
- where policy learning happens
- where the timeline of actions is preserved
- where contracts and schemas stay visible

## Dependency Rule

Step 3 depends on:

- `Step 1`
- `Step 2`

Interpretation:

- the navigation can ship now
- the data contracts must stay the source of truth
- no new section may pretend to be operational if its backing step is still gated

## Workspace Sections

### Inbox

Purpose:

- show the raw capture layer
- preview what will become immutable source bundles

Current runtime status:

- visible
- blocked from true persistence until `Step 4`

### Studio

Purpose:

- generate markdown proposals
- inspect graph previews
- review reflection and integrity status

Current runtime status:

- operational as a proposal workspace

### Garden

Purpose:

- inspect graph topology
- inspect category roots
- surface structural health signals

Current runtime status:

- previewable
- blocked from canonical graph health until `Step 4` and later `Step 6`

### Reinforce

Purpose:

- turn user feedback into policy updates
- keep truth separate from preference

Current runtime status:

- conceptually visible
- blocked until `Step 5`

### Timeline

Purpose:

- make semantic operations traceable
- show capture, proposal, and persistence states

Current runtime status:

- partially visible through proposal metadata
- blocked from true operational history until `Step 4`

### Schema Lab

Purpose:

- keep contracts and dependency gates visible
- prevent the team from losing orientation

Current runtime status:

- visible now
- should remain available in every future phase

## Reflection Notes

Step 3 introduced a common failure mode:

- adding sections can create the illusion that those sections are already backed by durable data

To avoid that, every section must declare one of:

- `Visible in current runtime`
- `Blocked by stepX`

This is not cosmetic.
It is part of the product truth model.
