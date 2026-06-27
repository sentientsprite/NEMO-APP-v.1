# MEMORY.md — Workspace memory

Persistent facts NEMO should remember across sessions.

## Stack defaults
- Web dashboard on port 8420
- Local workspace data in `.nemo-workspace/`
- Demo mode works without API keys; live mode uses configured provider keys

## Architecture rules
- Business logic lives in packages (`orchestrator`, `memory`, `agents`)
- API routes stay thin
- Every agent output: structured JSON + readable Markdown
- Important claims must cite indexed memory or user input

## Don't do
- Do not run external actions without approval
- Do not log secrets or raw credential payloads
- Do not skip approval gates at story or brief stages
