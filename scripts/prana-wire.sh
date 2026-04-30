#!/usr/bin/env bash
# prana-wire.sh — wire a component repo to the NEMO-APP-v.1 trunk.
# Run from the root of the component repo.
#
# Usage:
#   COMPONENT_ID=openclaw COMPONENT_ROLE=agent_runtime ./prana-wire.sh
#   (or set them in env first)
#
# Optional:
#   TRUNK=/path/to/NEMO-APP-v.1   (default: $HOME/NEMO-APP-v.1)

set -euo pipefail

: "${COMPONENT_ID:?Set COMPONENT_ID (must match an id in NEMO-APP-v.1/components.yaml)}"
: "${COMPONENT_ROLE:?Set COMPONENT_ROLE (short snake_case role)}"
TRUNK="${TRUNK:-$HOME/NEMO-APP-v.1}"

if [[ ! -d "$TRUNK/templates" ]]; then
  echo "Error: $TRUNK/templates not found. Set TRUNK or clone NEMO-APP-v.1 first." >&2
  exit 1
fi

if [[ ! -d ".git" ]]; then
  echo "Error: not in a git repo. Run from the component repo root." >&2
  exit 1
fi

mkdir -p .prana .github/workflows

# 1. .prana/component.yaml
cp "$TRUNK/templates/component.yaml.example" .prana/component.yaml

# Cross-platform sed (BSD on macOS vs GNU on Linux)
if [[ "$(uname)" == "Darwin" ]]; then
  SED_INPLACE=(-i '')
else
  SED_INPLACE=(-i)
fi

sed "${SED_INPLACE[@]}" "s/^id:.*/id: $COMPONENT_ID/"     .prana/component.yaml
sed "${SED_INPLACE[@]}" "s/^role:.*/role: $COMPONENT_ROLE/" .prana/component.yaml

# 2. .github/workflows/report-to-prana.yml
if [[ -f .github/workflows/report-to-prana.yml ]]; then
  echo "→ .github/workflows/report-to-prana.yml already exists, leaving as-is"
else
  cp "$TRUNK/templates/report-to-prana.yml" .github/workflows/report-to-prana.yml
fi

# 3. README footer
if [[ -f README.md ]] && ! grep -q "Part of Prana Marketing Solutions" README.md; then
  echo "" >> README.md
  cat "$TRUNK/templates/child-readme-footer.md" >> README.md
  echo "→ Appended Prana footer to README.md (edit the TODO lines)"
fi

git add .prana .github/workflows/report-to-prana.yml README.md 2>/dev/null || true

cat <<EOF

✓ Wired this repo to NEMO-APP-v.1 as component '$COMPONENT_ID' (role: $COMPONENT_ROLE)

Next steps:
  1. Edit .prana/component.yaml — fill in cadence, provides, depends_on, owners
  2. Edit README.md footer — fill in the two TODO lines (role, cadence)
  3. Add the PRANA_TRUNK_TOKEN secret to this repo:
     gh secret set PRANA_TRUNK_TOKEN --body '<paste token>'
  4. Review and commit:
     git diff --staged
     git commit -m "chore(prana): wire to NEMO-APP-v.1 trunk"
     git push
  5. (Optional) trigger the first report manually:
     gh workflow run report-to-prana.yml
EOF
