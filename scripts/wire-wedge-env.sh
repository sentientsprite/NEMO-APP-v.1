#!/usr/bin/env bash
# Wire wedge env vars to Vercel production. Run from NEMO-APP-v.1 root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPRYTE_CWD="$(mktemp -d)/spryte-vercel"
NEMO_CWD="$(mktemp -d)/nemo-vercel"
trap 'rm -rf "$(dirname "$SPRYTE_CWD")"' EXIT

mkdir -p "$SPRYTE_CWD/.vercel" "$NEMO_CWD/.vercel"
echo '{"projectId":"prj_b8lyvZQDeKdaesS2jngY6ECt4qxz","orgId":"team_GQN1fj7cDy5xqTy4heKzMqbJ","projectName":"spryte-site"}' > "$SPRYTE_CWD/.vercel/project.json"
echo '{"projectId":"prj_UOJwqdh1P8fSytCgttyh5H7uV2pf","orgId":"team_GQN1fj7cDy5xqTy4heKzMqbJ","projectName":"nemo-app-v-1"}' > "$NEMO_CWD/.vercel/project.json"

add_env() {
  local cwd="$1" name="$2" value="$3"
  if [ -z "$value" ]; then return 0; fi
  printf '%s' "$value" | vercel env add "$name" production --cwd "$cwd" --yes 2>/dev/null || \
    printf '%s' "$value" | vercel env update "$name" production --cwd "$cwd" --yes
  echo "  ✓ $name"
}

echo ""
echo "=== Spryte Site (spryte-site.vercel.app) ==="
echo "Paste SUPABASE_SERVICE_ROLE_KEY (or leave empty to skip):"
read -rs SUPABASE_SERVICE_ROLE_KEY
echo ""
add_env "$SPRYTE_CWD" "SUPABASE_URL" "https://bhedzgbrndsrnvwkmqbp.supabase.co"
add_env "$SPRYTE_CWD" "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"

echo "Paste LEAD_WEBHOOK_SECRET (same as HUNTER_WEBHOOK_SECRET, or empty to skip):"
read -rs LEAD_WEBHOOK_SECRET
echo ""
add_env "$SPRYTE_CWD" "LEAD_WEBHOOK_URL" "https://outbound-crm-five.vercel.app/api/webhooks/hunter"
add_env "$SPRYTE_CWD" "LEAD_WEBHOOK_SECRET" "$LEAD_WEBHOOK_SECRET"

echo ""
echo "=== Nemo Local (nemo-app-v-1.vercel.app) ==="
echo "Paste GOOGLE_MAPS_API_KEY (or empty to skip):"
read -rs GOOGLE_MAPS_API_KEY
echo ""
add_env "$NEMO_CWD" "GOOGLE_MAPS_API_KEY" "$GOOGLE_MAPS_API_KEY"

echo "Paste RESEND_API_KEY (or empty to skip):"
read -rs RESEND_API_KEY
echo ""
add_env "$NEMO_CWD" "RESEND_API_KEY" "$RESEND_API_KEY"

echo "RESEND_FROM_EMAIL [Nemo Local <reports@nemo.local>]:"
read -r RESEND_FROM_EMAIL
RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-Nemo Local <reports@nemo.local>}"
add_env "$NEMO_CWD" "RESEND_FROM_EMAIL" "$RESEND_FROM_EMAIL"

echo ""
echo "Done. Redeploy spryte-site and nemo-app-v-1 from Vercel dashboard or push to trigger builds."
echo "See docs/WEDGE_ENV_SETUP.md for verification curl commands."
