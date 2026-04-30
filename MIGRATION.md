# Migration — wire each sibling repo to NEMO-APP-v.1

> Step-by-step for connecting each existing component repo to this trunk.
> Run once per repo. ~5 minutes per repo.

## What you'll do per repo

For every repo in [`components.yaml`](components.yaml):

1. Add a `.prana/component.yaml` — declares the repo's role and cadence
2. Add a `.github/workflows/report-to-prana.yml` — nightly status reporter
3. Add the README footer — links readers back to the trunk
4. Create a `PRANA_TRUNK_TOKEN` secret in the repo settings
5. Commit + push

After all repos are wired, the trunk's
[`aggregate-status.yml`](.github/workflows/aggregate-status.yml) workflow
runs hourly and rolls every nightly report into [`STATUS.md`](STATUS.md).

---

## Prereqs (one-time)

### 1. Create the cross-repo PAT

GitHub → your account → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token:

| Field | Value |
|---|---|
| Token name | `prana-trunk-status-reporter` |
| Resource owner | `sentientsprite` |
| Repository access | Only select repositories → `sentientsprite/NEMO-APP-v.1` |
| Repository permissions | **Issues**: Read and write (only this) |
| Expiration | 1 year |

Copy the token (`github_pat_…`).

### 2. Add it as a secret to each component repo

For every component repo (`openclaw`, `nemo-agent`, `nemo-workspace`,
`paperclip-workspace`, `MKTG-Chrome-Extenstion`, `autoagent`):

```bash
gh secret set PRANA_TRUNK_TOKEN \
  --repo sentientsprite/<component-repo> \
  --body "<paste token>"
```

(Or use the GitHub UI: repo → Settings → Secrets and variables →
Actions → New repository secret.)

### 3. Clone the trunk locally if you haven't already

```bash
git clone https://github.com/sentientsprite/NEMO-APP-v.1.git ~/NEMO-APP-v.1
```

---

## Per-repo migration (run for each component)

This script does steps 1–3 in one shot. Run from the root of the
component repo. Edit the two variables at the top before running.

```bash
#!/usr/bin/env bash
set -euo pipefail

# === EDIT THESE TWO LINES ===
COMPONENT_ID="openclaw"           # must match an id in NEMO-APP-v.1/components.yaml
COMPONENT_ROLE="agent_runtime"    # short, snake_case
# ===========================

TRUNK="${TRUNK:-$HOME/NEMO-APP-v.1}"

mkdir -p .prana .github/workflows

# 1. .prana/component.yaml
cp "$TRUNK/templates/component.yaml.example" .prana/component.yaml
# Replace the example id + role with this repo's values
sed -i.bak "s/^id:.*/id: $COMPONENT_ID/" .prana/component.yaml
sed -i.bak "s/^role:.*/role: $COMPONENT_ROLE/" .prana/component.yaml
rm -f .prana/component.yaml.bak

# 2. .github/workflows/report-to-prana.yml
cp "$TRUNK/templates/report-to-prana.yml" .github/workflows/report-to-prana.yml

# 3. README footer (only append if not already present)
if ! grep -q "Part of Prana Marketing Solutions" README.md 2>/dev/null; then
  echo "" >> README.md
  cat "$TRUNK/templates/child-readme-footer.md" >> README.md
  echo ""
  echo "⚠  Edit README.md to fill in the two TODO lines in the footer (role + cadence)."
fi

git add .prana .github/workflows/report-to-prana.yml README.md
git status
echo ""
echo "Review the diff above, then:"
echo "  git commit -m 'chore(prana): wire to NEMO-APP-v.1 trunk'"
echo "  git push"
```

Save as `~/bin/prana-wire.sh`, `chmod +x`, then for each repo:

```bash
cd ~/path/to/openclaw           && COMPONENT_ID=openclaw              COMPONENT_ROLE=agent_runtime           prana-wire.sh
cd ~/path/to/paperclip-workspace && COMPONENT_ID=paperclip-workspace   COMPONENT_ROLE=orchestration           prana-wire.sh
cd ~/path/to/nemo-workspace     && COMPONENT_ID=nemo-workspace        COMPONENT_ROLE=dashboard_and_config    prana-wire.sh
cd ~/path/to/nemo-agent         && COMPONENT_ID=nemo-agent            COMPONENT_ROLE=agent_runtime_next      prana-wire.sh
cd ~/path/to/MKTG-Chrome-Extenstion && COMPONENT_ID=mktg-chrome-extension COMPONENT_ROLE=in_browser_companion prana-wire.sh
# autoagent is already wired (see autoagent/.prana/component.yaml)
```

---

## Per-component customization (optional but recommended)

The default `report-to-prana.yml` reports a generic state (commit
activity + green/red on file presence). Each component should customize
the **"Compose status report"** step to gather its own real metrics.

Examples (edit the `compose` step in
`.github/workflows/report-to-prana.yml`):

### `openclaw`

```js
metrics.agents_active = JSON.parse(execSync('cat ~/.openclaw/openclaw.json')).agents.length;
metrics.agent_runs_24h = parseInt(execSync('grep -c agent_run ~/.openclaw/logs/$(date +%Y-%m-%d).log').trim());
metrics.errors_24h = parseInt(execSync('grep -c ERROR ~/.openclaw/logs/$(date +%Y-%m-%d).log').trim());

if (metrics.errors_24h > 0) state = 'yellow';
if (metrics.agents_active < 5) { state = 'red'; summary = `Only ${metrics.agents_active}/5 agents active`; }
```

### `paperclip-workspace`

```js
const pending = JSON.parse(execSync('cat ~/.paperclip/instances/*/pending.json'));
metrics.approvals_pending = pending.length;
metrics.approvals_24h = parseInt(execSync('grep -c approved ~/.paperclip/instances/*/log').trim());
metrics.budget_used_pct = JSON.parse(execSync('cat ~/.paperclip/instances/*/budget.json')).used_pct;

if (metrics.approvals_pending > 10) { state = 'yellow'; summary = `${metrics.approvals_pending} approvals waiting on Raymond`; }
if (metrics.budget_used_pct > 90) { state = 'red'; summary = `Budget at ${metrics.budget_used_pct}%`; }
```

### `nemo-workspace`

```js
metrics.dashboard_uptime_pct = /* read from prana-status output */;
metrics.pipeline_rows = parseInt(execSync('wc -l < pipeline.csv').trim());
metrics.beacon_clients = /* count clients with beacon=true */;
metrics.echo_clients = /* count */;
metrics.bloom_clients = /* count */;
```

### `MKTG-Chrome-Extenstion`

Cadence is `weekly`, not `nightly`. Change the cron to:

```yaml
on:
  schedule:
    - cron: '0 14 * * 1'   # 14:00 UTC Monday
```

```js
metrics.manifest_version = JSON.parse(fs.readFileSync('manifest.json')).version;
metrics.last_release_age_days = /* from git tag --sort=-creatordate | head -1 */;

if (metrics.last_release_age_days > 30) state = 'yellow';
```

### `autoagent`

Already customized; see [`autoagent/.github/workflows/report-to-prana.yml`](https://github.com/sentientsprite/autoagent/blob/main/.github/workflows/report-to-prana.yml).
Reports SkillEval skill count, case count, harness presence, and
Phase 4 scaffold liveness.

---

## Verifying it works

After wiring at least one component:

1. Manually trigger the workflow:
   ```bash
   gh workflow run report-to-prana.yml --repo sentientsprite/<component>
   ```
2. Check that an Issue appeared on the trunk:
   ```bash
   gh issue list --repo sentientsprite/NEMO-APP-v.1 --label component-status
   ```
3. Wait ≤ 1 hour for the aggregator, then check `STATUS.md`:
   ```bash
   gh api repos/sentientsprite/NEMO-APP-v.1/contents/STATUS.md \
     --jq '.content' | base64 -d | head -30
   ```
4. The just-aggregated Issue should be auto-closed (unless `red`).

---

## Decommissioning a component

If a repo stops being part of Prana:

1. Delete `.prana/component.yaml` and `.github/workflows/report-to-prana.yml` in that repo
2. Remove its row from `components.yaml` here
3. Remove its row from the table in `README.md` here
4. Add an ADR under `decisions/` documenting why
5. Open a PR

The aggregator will stop expecting reports from it after the next run.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Workflow runs but no Issue appears on trunk | `PRANA_TRUNK_TOKEN` missing or wrong scope | Recreate token with `Issues: read+write` on `NEMO-APP-v.1` only; `gh secret set` again |
| Aggregator never updates `STATUS.md` | No issues yet, or `components.yaml` `id` mismatch | Check that the issue title `[status] <id> — <date>` matches a row in `components.yaml` |
| Status-stale issues opening too aggressively | Wrong `cadence` in `.prana/component.yaml` | Switch to `weekly` for components without nightly CI |
| Too many issues in trunk | Aggregator broken, not auto-closing | Re-run `aggregate-status.yml` manually; check Actions tab for errors |
