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
# - .env.local + .env (if present): updates only NEXT_PUBLIC_PASSMEET_* program IDs
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

program_exists() {
  local program="$1"

  if command -v leo >/dev/null 2>&1; then
    leo -q query program "${program}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null 2>&1
    return $?
  fi

  if command -v curl >/dev/null 2>&1; then
    local url="${ENDPOINT}/${NETWORK}/program/${program}"
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" "${url}" || true)"
    if [[ "${code}" == "200" ]]; then
      return 0
    fi
    if [[ "${code}" == "404" ]]; then
      return 1
    fi
    echo "Error: could not determine if program exists (${program}); got HTTP ${code} from ${url}" >&2
    exit 1
  fi

  echo "Error: neither leo nor curl is available to check program ID availability." >&2
  echo "Run this script in WSL (with leo installed) or install curl." >&2
  exit 1
}

pick_available() {
  local candidate_v="$1"
  local tries=0
  while true; do
    tries=$((tries + 1))
    if [[ "${tries}" -gt 200 ]]; then
      echo "Error: too many attempts while picking an available program ID. Check ENDPOINT/NETWORK." >&2
      exit 1
    fi

    local cand_events="passmeet_v${candidate_v}_${suffix}.aleo"
    local cand_subs="passmeet_subs_v${candidate_v}_${suffix}.aleo"

    # If either program exists, bump again.
    if program_exists "${cand_events}"; then
      candidate_v=$((candidate_v + 1))
      continue
    fi
    if program_exists "${cand_subs}"; then
      candidate_v=$((candidate_v + 1))
      continue
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
    # Not all files contain both program IDs (events vs subs). Missing is fine.
    sys.exit(0)
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

update_env_file() {
  local env_file="$1"
  if [[ ! -f "${env_file}" ]]; then
    return 0
  fi
  python3 - "${env_file}" "${new_events}" "${new_subs}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
events = sys.argv[2]
subs = sys.argv[3]

raw = path.read_text(encoding="utf-8", errors="ignore").splitlines(True)

def set_var(lines, key, value):
    out = []
    found = False
    for line in lines:
        if line.startswith(key + "="):
            out.append(f"{key}={value}\n")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}\n")
    return out

raw = set_var(raw, "NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID", events)
raw = set_var(raw, "NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID", subs)

path.write_text("".join(raw), encoding="utf-8")
PY
}

# Keep local dev env in sync without touching secrets.
update_env_file ".env.local"
update_env_file ".env"

echo "Updated program IDs:"
echo "  events: ${current_events} -> ${new_events}"
echo "  subs:   ${current_subs} -> ${new_subs}"
echo
echo "Next steps:"
echo "  export NETWORK=${NETWORK}"
echo "  export ENDPOINT=${ENDPOINT}"
echo "  bash scripts/deploy-leo.sh"
