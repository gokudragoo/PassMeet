#!/usr/bin/env bash
# Bump Aleo program IDs for PassMeet contracts.
#
# Why: these programs are marked `@noupgrade`, so after a successful deploy you must
# deploy under new (unique) program IDs to ship contract changes.
#
# Usage:
#   export NETWORK=testnet
#   export ENDPOINT=https://api.explorer.provable.com/v1
#   bash scripts/bump-program-ids.sh
#
# This script updates:
# - contracts/*/src/main.leo + program.json
# - src/lib/aleo.ts defaults
# - .env.example + README.md references
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-${ALEO_NETWORK:-testnet}}"
ENDPOINT="${ENDPOINT:-${ALEO_ENDPOINT:-https://api.explorer.provable.com/v1}}"

EVENTS_DIR="contracts/passmeet_events_7788"
SUBS_DIR="contracts/passmeet_subs_7788"

if [[ ! -f "${EVENTS_DIR}/program.json" ]] || [[ ! -f "${SUBS_DIR}/program.json" ]]; then
  echo "Error: expected ${EVENTS_DIR}/program.json and ${SUBS_DIR}/program.json" >&2
  exit 1
fi

current_events="$(sed -n 's/.*"program"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${EVENTS_DIR}/program.json" | head -n 1)"
current_subs="$(sed -n 's/.*"program"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${SUBS_DIR}/program.json" | head -n 1)"

if [[ -z "${current_events}" ]] || [[ -z "${current_subs}" ]]; then
  echo "Error: could not parse current program IDs from program.json" >&2
  exit 1
fi

if [[ ! "${current_events}" =~ ^passmeet_v([0-9]+)_([0-9]+)\.aleo$ ]]; then
  echo "Error: unexpected events program id format: ${current_events}" >&2
  exit 1
fi
curr_v="${BASH_REMATCH[1]}"
suffix="${BASH_REMATCH[2]}"

if [[ ! "${current_subs}" =~ ^passmeet_subs_v([0-9]+)_([0-9]+)\.aleo$ ]]; then
  echo "Error: unexpected subs program id format: ${current_subs}" >&2
  exit 1
fi
subs_v="${BASH_REMATCH[1]}"
subs_suffix="${BASH_REMATCH[2]}"

if [[ "${subs_v}" != "${curr_v}" ]] || [[ "${subs_suffix}" != "${suffix}" ]]; then
  echo "Error: events/subs versions do not match:" >&2
  echo "  events=${current_events}" >&2
  echo "  subs=${current_subs}" >&2
  exit 1
fi

next_v=$((curr_v + 1))

pick_available() {
  local candidate_v="$1"
  while true; do
    local cand_events="passmeet_v${candidate_v}_${suffix}.aleo"
    local cand_subs="passmeet_subs_v${candidate_v}_${suffix}.aleo"

    if command -v leo >/dev/null 2>&1; then
      # If either program exists, bump again.
      if leo -q query program "${cand_events}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null 2>&1; then
        candidate_v=$((candidate_v + 1))
        continue
      fi
      if leo -q query program "${cand_subs}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null 2>&1; then
        candidate_v=$((candidate_v + 1))
        continue
      fi
    fi

    echo "${candidate_v}"
    return 0
  done
}

next_v="$(pick_available "${next_v}")"

new_events="passmeet_v${next_v}_${suffix}.aleo"
new_subs="passmeet_subs_v${next_v}_${suffix}.aleo"

replace_bytes() {
  local file="$1"
  local from="$2"
  local to="$3"
  python3 - "${file}" "${from}" "${to}" <<'PY'
import sys
from_s = sys.argv[2].encode("utf-8")
to_s = sys.argv[3].encode("utf-8")
path = sys.argv[1]
data = open(path, "rb").read()
if from_s not in data:
    raise SystemExit(f"Error: '{sys.argv[2]}' not found in {path}")
open(path, "wb").write(data.replace(from_s, to_s))
PY
}

files=(
  "${EVENTS_DIR}/src/main.leo"
  "${EVENTS_DIR}/program.json"
  "${SUBS_DIR}/src/main.leo"
  "${SUBS_DIR}/program.json"
  "src/lib/aleo.ts"
  ".env.example"
  "README.md"
)

for f in "${files[@]}"; do
  if [[ -f "${f}" ]]; then
    replace_bytes "${f}" "${current_events}" "${new_events}" || true
    replace_bytes "${f}" "${current_subs}" "${new_subs}" || true
  fi
done

echo "Updated program IDs:"
echo "  events: ${current_events} -> ${new_events}"
echo "  subs:   ${current_subs} -> ${new_subs}"
echo
echo "Next steps:"
echo "  export NETWORK=${NETWORK}"
echo "  export ENDPOINT=${ENDPOINT}"
echo "  bash scripts/deploy-leo.sh"
