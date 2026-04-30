# templates/

Drop-in files for every component repo. Apply with:

```bash
# From the root of a component repo (e.g. ~/projects/openclaw):
TRUNK=~/path/to/NEMO-APP-v.1

mkdir -p .prana .github/workflows
cp "$TRUNK/templates/component.yaml.example"      .prana/component.yaml
cp "$TRUNK/templates/report-to-prana.yml"         .github/workflows/report-to-prana.yml

# Then:
# 1. Edit .prana/component.yaml — set id, role, cadence to match this repo
# 2. Add a PRANA_TRUNK_TOKEN secret in this repo's settings (a fine-grained
#    PAT with Issues: read+write on sentientsprite/NEMO-APP-v.1)
# 3. Append templates/child-readme-footer.md to your README.md
# 4. Commit + push
```

What each file does:

- **`component.yaml.example`** → goes to `.prana/component.yaml`. Declares
  this repo's role, cadence, dependencies. Read by the trunk's aggregator
  to know whether this repo is silent past tolerance.
- **`report-to-prana.yml`** → goes to `.github/workflows/`. Runs nightly
  (and on every CI completion). Files a `[status]` Issue on the trunk
  with structured state + metrics. The aggregator parses + rolls up.
- **`child-readme-footer.md`** → appended to the component's `README.md`.
  Declares this repo as part of Prana, links back to the trunk.

The matching trunk-side pieces:

- [`../components.yaml`](../components.yaml) — manifest of all components
- [`../.github/ISSUE_TEMPLATE/component-status.yml`](../.github/ISSUE_TEMPLATE/component-status.yml) — schema
- [`../.github/workflows/aggregate-status.yml`](../.github/workflows/aggregate-status.yml) — receiver / aggregator
- [`../STATUS.md`](../STATUS.md) — auto-updated dashboard
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — full protocol
