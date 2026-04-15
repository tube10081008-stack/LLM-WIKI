# P-Reinforce Reflection 2026-04-15

## Critical Error Found

The previous implementation allowed a dangerous conflation:

- `generate`
- `apply`
- `persist`

could collapse into one action in local filesystem mode.

Why this is a critical error:

- it weakens reviewability
- it makes user approval ambiguous
- it breaks the conceptual boundary between proposal and durable knowledge
- it would make future reinforcement policy harder to reason about

In a 10-year system, this is not a UI detail.
It is a trust boundary.

## Correction

The flow is now:

1. `Generate`
2. `Review`
3. `Apply`

Meaning:

- `Generate` creates a proposal package
- `Apply` is the explicit write attempt
- persistence success or blockage is reported separately

## Why This Matters

This correction preserves three future capabilities:

- diff review before persistence
- policy-driven auto-apply later
- clean auditing of human-approved versus machine-proposed changes

## Rule Reinforced

Never let a proposal silently become truth.
