# Migration — wire each sibling repo to NEMO-APP-v.1

> **Turn-key checklist:** [`docs/TRUNK_LOOP_SETUP.md`](docs/TRUNK_LOOP_SETUP.md) (PAT, labels, secrets, smoke test).

> Step-by-step for connecting each existing component repo to this trunk.
> ~5 minutes per repo. The canonical implementation is
> [`scripts/prana-wire.sh`](scripts/prana-wire.sh) — this doc covers the
> one-time prereqs and the verification step.

## What gets wired per repo

For every repo in [`components.yaml`](components.yaml), `prana-wire.sh`
adds three files:

1. `.prana/component.yaml` — declares the repo's role and cadence
   (template: [`templates/component.yaml.example`](templates/component.yaml.example))
2. `.github/workflows/report-to-prana.yml` — nightly status reporter
   (template: [`templates/report-to-prana.yml`](templates/report-to-prana.yml))
3. README footer block — links readers back to the trunk
   (template: [`templates/child-readme-footer.md`](templates/child-readme-footer.md))

After wiring, the trunk's
[`aggregate-status.yml`](.github/workflows/aggregate-status.yml) runs hourly
and rolls every nightly report into [`STATUS.md`](STATUS.md).

---

## One-time prereqs

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

### 2. Add `PRANA_TRUNK_TOKEN` to each component repo

```bash
gh secret set PRANA_TRUNK_TOKEN \
  --repo sentientsprite/<component-repo> \
  --body "<paste token>"
```

### 3. Clone the trunk locally

```bash
git clone https://github.com/sentientsprite/NEMO-APP-v.1.git ~/NEMO-APP-v.1
```

---

## Per-repo migration

Run [`scripts/prana-wire.sh`](scripts/prana-wire.sh) from each component
repo root. Save it to `~/bin/` once, then:

```bash
cd ~/path/to/openclaw           && COMPONENT_ID=openclaw              COMPONENT_ROLE=agent_runtime           prana-wire.sh
cd ~/path/to/paperclip-workspace && COMPONENT_ID=paperclip-workspace   COMPONENT_ROLE=orchestration           prana-wire.sh
cd ~/path/to/nemo-workspace     && COMPONENT_ID=nemo-workspace        COMPONENT_ROLE=dashboard_and_config    prana-wire.sh
cd ~/path/to/nemo-agent         && COMPONENT_ID=nemo-agent            COMPONENT_ROLE=agent_runtime_next      prana-wire.sh
cd ~/path/to/MKTG-Chrome-Extenstion && COMPONENT_ID=mktg-chrome-extension COMPONENT_ROLE=in_browser_companion prana-wire.sh
# autoagent is already wired (see autoagent/.prana/component.yaml)
```

Then for each repo: edit the README footer's two TODO lines, review
`git diff --staged`, commit, and push.

---

## Per-component metric customization

The default `report-to-prana.yml` reports generic state (commit activity).
Each component customizes the **"Compose status report"** step to gather
its own metrics — see the `# Examples:` block at the bottom of
[`templates/report-to-prana.yml`](templates/report-to-prana.yml) for
sample blocks per component (openclaw, paperclip, nemo-workspace,
mktg-chrome-extension).

`autoagent` is already customized — see
[`autoagent/.github/workflows/report-to-prana.yml`](https://github.com/sentientsprite/autoagent/blob/main/.github/workflows/report-to-prana.yml).
It reports SkillEval skill count, case count, harness presence, and
Phase 4 scaffold liveness.

---

## Verifying it works

After wiring at least one component:

```bash
gh workflow run report-to-prana.yml --repo sentientsprite/<component>
gh issue list --repo sentientsprite/NEMO-APP-v.1 --label component-status
# Wait ≤ 1 hour for the aggregator
gh api repos/sentientsprite/NEMO-APP-v.1/contents/STATUS.md \
  --jq '.content' | base64 -d | head -30
```

The just-aggregated Issue should be auto-closed (unless `red`).

---

## Decommissioning a component

1. Delete `.prana/component.yaml` and `.github/workflows/report-to-prana.yml` in that repo
2. Remove its row from `components.yaml` here
3. Remove its row from the table in `README.md` here
4. Add an ADR under `decisions/` documenting why
5. Open a PR

The aggregator stops expecting reports after the next run.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Workflow runs but no Issue appears on trunk | `PRANA_TRUNK_TOKEN` missing or wrong scope | Recreate token with `Issues: read+write` on `NEMO-APP-v.1` only; `gh secret set` again |
| Aggregator never updates `STATUS.md` | No issues yet, or `components.yaml` `id` mismatch | Check that the issue title `[status] <id> — <date>` matches a row in `components.yaml` |
| Status-stale issues opening too aggressively | Wrong `cadence` in `.prana/component.yaml` | Switch to `weekly` for components without nightly CI |
| Too many issues in trunk | Aggregator broken, not auto-closing | Re-run `aggregate-status.yml` manually; check Actions tab for errors |
