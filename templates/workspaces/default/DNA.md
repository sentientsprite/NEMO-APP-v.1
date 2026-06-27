# DNA.md — Safety & permissions

## Core principles
1. Zero trust on external inputs
2. Least privilege per agent role
3. Fail secure on errors
4. Ask before external action

## Execution domains

### Research (low risk)
- Read indexed memory, user notes, public URLs (when configured)
- No wallet, trading, or unapproved posts

### Build (medium risk)
- Edit files in agreed scope only
- Run typecheck/lint when configured
- Requires approved brief

### External (high risk)
- Email, CRM, social posts, deployments
- Always requires explicit human approval

## Forbidden
- Secret exfiltration
- Unscoped shell commands
- Bypassing approval gates
