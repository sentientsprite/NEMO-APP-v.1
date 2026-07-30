# TOKEN-EFFICIENCY.md — Model routing

Route by task type. Default cheap; escalate when quality determines the outcome.

## NEMO Workspace factory (live AI)

| Agent role | Tier | Default model | Why |
|------------|------|---------------|-----|
| researcher | bulk | Kimi K2.7 | Long context, read-only |
| story_writer | **critical** | Opus 4.8 | Ambiguous requirements → acceptance criteria |
| spec_writer | bulk | Kimi K2.7 | Mechanical brief from approved story |
| builder | bulk | Kimi K2.7 | High-volume codegen after approval |
| test_verifier | bulk | Kimi K2.7 | Test scaffolding |
| validator | **critical** | Opus 4.8 | Final review before ship |

Env vars: `NEMO_AI_MODEL_BULK`, `NEMO_AI_MODEL_CRITICAL`. Disable routing: `NEMO_AI_ROUTING=0`.

## Cursor / daily dev

| Task | Model | Notes |
|------|-------|-------|
| CRUD, tests, docs, refactors | Kimi K2.7 | Default for all mechanical work |
| Architecture, security, debugging heisenbugs | Opus 4.8 | Escalate explicitly |
| Pre-merge review on auth/PII/payments | Opus 4.8 | Always |

Pattern: Kimi generates options → human approves → Opus picks the best → Kimi implements.

## OpenClaw (Mac Mini)

| Agent | Default | Escalate to Opus |
|-------|---------|------------------|
| Hunter (drafts) | Kimi or MLX | Multi-location strategy |
| Scout | Kimi / MLX | — |
| Architect | Kimi first pass | Always for final blueprint |
| Validator | — | Always |
| Aria (client copy) | Kimi drafts | Before PRANA-EXECUTE queue |

PinchTab extracts stay deterministic — do not re-read full pages through Opus.

## Rules

- Cache expensive calls when possible
- Pass only relevant memory context into prompts
- Keep agent contexts focused — one job per agent
- Final review on critical paths always runs Opus (or Validator agent in factory)
