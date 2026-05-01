# Trunk loop setup (step 1)

Wire every Prana component repo so it opens a nightly **`[status] <id> — <date>`** Issue on **`sentientsprite/NEMO-APP-v.1`**. The trunk workflow **`aggregate-status.yml`** rolls those into **`STATUS.md`** and closes non-`red` issues.

## 0. Prerequisites

- Repos exist on GitHub under **`sentientsprite`** (same names as in **`components.yaml`**).
- You can push to each repo’s **`main`** branch (or merge PRs).
- GitHub Actions are **enabled** on each repo (Settings → Actions).

## 1. Create the PAT (once)

Fine-grained personal access token:

| Field | Value |
|-------|--------|
| Resource owner | **`sentientsprite`** |
| Repository access | **Only selected** → **`NEMO-APP-v.1`** |
| Permissions | **Issues: Read and write** (nothing else required for this flow) |
| Expiration | Your choice (90d–1y is fine) |

Copy the token (`github_pat_…`).

## 2. Ensure trunk Issue labels exist (once)

On **`NEMO-APP-v.1`**:

1. Actions → **Ensure Prana labels** → **Run workflow**.

This creates **`component-status`**, **`status-stale`**, **`escalation`** if missing. Without **`component-status`**, creating Issues from components may return **422**.

## 3. Add `PRANA_TRUNK_TOKEN` to every component repo

Same secret **name** everywhere: **`PRANA_TRUNK_TOKEN`**  
Value: the PAT from §1.

Repos that must have it (see **`components.yaml`**):

| Repo | Secret |
|------|--------|
| `sentientsprite/openclaw` | `PRANA_TRUNK_TOKEN` |
| `sentientsprite/paperclip-workspace` | `PRANA_TRUNK_TOKEN` |
| `sentientsprite/nemo-workspace` | `PRANA_TRUNK_TOKEN` |
| `sentientsprite/nemo-agent` | `PRANA_TRUNK_TOKEN` |
| `sentientsprite/MKTG-Chrome-Extenstion` | `PRANA_TRUNK_TOKEN` |
| `sentientsprite/autoagent` | `PRANA_TRUNK_TOKEN` |

CLI:

```bash
TOKEN='github_pat_...'   # paste once; do not commit

for repo in openclaw paperclip-workspace nemo-workspace nemo-agent MKTG-Chrome-Extenstion autoagent; do
  gh secret set PRANA_TRUNK_TOKEN --repo "sentientsprite/$repo" --body "$TOKEN"
done
```

## 4. Wire files in each component repo

Each component needs:

- **`.prana/component.yaml`** — `id` must match **`components.yaml`** (`openclaw`, `paperclip-workspace`, `nemo-workspace`, `nemo-agent`, `mktg-chrome-extension`, `autoagent`).
- **`.github/workflows/report-to-prana.yml`** — copy from **`NEMO-APP-v.1/templates/report-to-prana.yml`** (or use the tailored **`openclaw`** variant below).

**`autoagent`** already carries a tailored workflow (SkillEval + `nemo-saas/` probe); keep it unless you intentionally switch to the generic template.

### Drop-in for repos you don’t have cloned locally

Copy from trunk:

```bash
TRUNK="$HOME/NEMO-APP-v.1"   # adjust

# Example: after cloning paperclip-workspace
cd ~/paperclip-workspace
mkdir -p .prana .github/workflows
cp "$TRUNK/templates/component.yaml.example" .prana/component.yaml
# Edit .prana/component.yaml: set id + role for THIS repo (see components.yaml)
cp "$TRUNK/templates/report-to-prana.yml" .github/workflows/report-to-prana.yml
git add .prana .github/workflows/report-to-prana.yml
git commit -m "chore(prana): report nightly status to NEMO-APP-v.1 trunk"
git push
```

### `openclaw` — also fire after CI completes

After copying **`templates/report-to-prana.yml`**, add under **`on:`**:

```yaml
  workflow_run:
    workflows: ["CI"]
    types: [completed]
```

(`openclaw`’s main workflow is literally named **`CI`**.)

## 5. Smoke test (same day)

For **each** wired repo:

1. Actions → **Report status to Prana trunk** → **Run workflow**.
2. On **`NEMO-APP-v.1`**: Issues → confirm a new **`[status] …`** Issue with label **`component-status`**.
3. Actions → **Aggregate component status** → **Run workflow** (or wait until **:15** past the hour).
4. Confirm **`STATUS.md`** updated between **`BEGIN_AUTO_STATUS`** / **`END_AUTO_STATUS`**.

## 6. Branch protection

If **`main`** blocks **`github-actions[bot]`** pushes, either:

- Allow the GitHub Actions app to push to **`main`** for this repo, or  
- Change **`aggregate-status.yml`** to open a PR instead of **`git push`** (not implemented yet).

## 7. PAT rotation

When the PAT expires, regenerate and **`gh secret set PRANA_TRUNK_TOKEN`** again on **each** component repo. No trunk change required.

---

**Related:** [**`MIGRATION.md`**](../MIGRATION.md) · [**`CONTRIBUTING.md`**](../CONTRIBUTING.md) · [**`components.yaml`**](../components.yaml)
