# TOKEN-EFFICIENCY.md — Model routing

| Task | Model tier | Notes |
|------|------------|-------|
| Main conversation | High capability | Complex reasoning |
| Sub-agents / cron | Low cost | Batch-friendly tasks |
| Embeddings | Local / free tier | Memory search |
| Demo mode | Deterministic | No API key required |

## Rules
- Cache expensive calls when possible
- Pass only relevant memory context into prompts
- Keep agent contexts focused — one job per agent
