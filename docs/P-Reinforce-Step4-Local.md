# P-Reinforce Step 4 Local Runtime

## Why this step exists

Step 4 is the first time proposals are allowed to become durable artifacts.

That means:

- `00_Raw/` is written
- `10_Wiki/` is written
- `20_Meta/index.json` and `20_Meta/graph.cache.json` are regenerated
- append-only events become inspectable

## Reflection

The critical mistake to avoid is pretending that a browser preview equals durable knowledge.

Because of that:

- Vercel stays `proposal_only`
- local filesystem mode is the only runtime that can claim durable persistence
- the UI must read the workspace back after apply, not trust the write call blindly

## Local configuration

Add these values to `.env.local`:

```dotenv
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3-flash-preview
P_REINFORCE_STORAGE_MODE=filesystem
P_REINFORCE_WORKSPACE_ROOT=.
```

Then run:

```bash
npm run dev:cloud
```

Why `dev:cloud`:

- the front-end still uses Vercel API routes
- local filesystem mode needs those server routes active

## Verification rule

After every Step 4 change, verify three truths:

1. `Apply` writes raw, wiki, and meta artifacts.
2. the workspace snapshot can read them back.
3. the Garden and Timeline views reflect persisted state instead of only draft state.
