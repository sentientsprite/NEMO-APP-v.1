# AGENTS.md — Factory roles

NEMO Workspace runs a software factory behind six user-facing stages.

| Stage | Agent | Can edit files? |
|-------|-------|-----------------|
| Understand | Researcher | No |
| Plan | Story Writer, Spec Writer | No |
| Approve | Human checkpoint | — |
| Execute | Builder | Yes (scoped) |
| Verify | Test Verifier | Tests only |
| Report | Validator | No |

Human checkpoints: approve story, approve brief, review final report.
