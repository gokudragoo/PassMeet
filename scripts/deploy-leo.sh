#!/usr/bin/env bash
# Deploy Leo contracts to Aleo (WSL-friendly). Requires Leo CLI and a funded account.
#
# Usage (recommended):
#   export PRIVATE_KEY="APrivateKey1..."
#   export NETWORK="testnet"
#   export ENDPOINT="https://api.explorer.provable.com/v1"
#   ./scripts/deploy-leo.sh
#
# Notes:
# - The private key is never written to disk by this script.
# - If your Leo version doesn't support `--private-key` on `leo deploy`, import the key first with Leo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-${ALEO_NETWORK:-testnet}}"
PRIVATE_KEY="${PRIVATE_KEY:-${ALEO_PRIVATE_KEY:-}}"
ENDPOINT="${ENDPOINT:-${ALEO_ENDPOINT:-}}"
if [[ -z "${ENDPOINT}" ]]; then
  ENDPOINT="https://api.explorer.provable.com/v1"
fi

export NETWORK ENDPOINT

if ! command -v leo >/dev/null 2>&1; then
  echo "Error: leo CLI not found. Install Leo and confirm with: leo --version" >&2
  exit 1
fi

if [[ -z "${PRIVATE_KEY}" ]]; then
  read -r -s -p "Aleo private key (input hidden): " PRIVATE_KEY
  echo
fi

if [[ -z "${PRIVATE_KEY}" ]]; then
  echo "Error: missing PRIVATE_KEY (or ALEO_PRIVATE_KEY)." >&2
  exit 1
fi

LEO_ARGS=()
# Leo prints `.env` values when not quiet; default to quiet to avoid leaking secrets.
if [[ "${LEO_VERBOSE:-0}" != "1" ]]; then
  LEO_ARGS+=(-q)
fi

DEPLOY_EXTRA_ARGS=()
if leo deploy --help 2>&1 | grep -q -- "--private-key"; then
  DEPLOY_EXTRA_ARGS+=(--private-key "${PRIVATE_KEY}")
else
  echo "Warning: your leo CLI doesn't advertise --private-key for deploy." >&2
  echo "Make sure your Leo account is configured before deploying (e.g. leo account import)." >&2
fi
if [[ -n "${ENDPOINT}" ]] && leo deploy --help 2>&1 | grep -q -- "--endpoint"; then
  DEPLOY_EXTRA_ARGS+=(--endpoint "${ENDPOINT}")
fi

CONTRACT_DIRS=(
  "contracts/passmeet_v1_7788"
  "contracts/passmeet_subs_7788"
)

for dir in "${CONTRACT_DIRS[@]}"; do
  program_name="$(cd "${dir}" && sed -n 's/.*"program"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' program.json | head -n 1)"
  if [[ -n "${program_name}" ]]; then
    # If the program already exists on-chain, Leo will fail with a confusing error.
    # Pre-check and guide the user to bump program IDs (contracts are @noupgrade).
    if leo -q query program "${program_name}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null 2>&1; then
      echo "Error: program already exists on-chain: ${program_name}" >&2
      echo "If you changed the contract after deploying, bump program IDs and retry:" >&2
      echo "  bash scripts/bump-program-ids.sh" >&2
      exit 1
    fi
  fi

  echo "Building ${dir}..."
  (cd "${dir}" && leo "${LEO_ARGS[@]}" build)

  echo "Deploying ${dir} (network=${NETWORK})..."
  (cd "${dir}" && leo "${LEO_ARGS[@]}" deploy --broadcast --network "${NETWORK}" "${DEPLOY_EXTRA_ARGS[@]}") || {
    echo "Deploy failed for ${dir}." >&2
    exit 1
  }
  if [[ -n "${program_name}" ]]; then
    echo "Verifying ${program_name} is live..."
    verified=0
    for _ in $(seq 1 15); do
      if leo -q query program "${program_name}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null 2>&1; then
        verified=1
        break
      fi
      sleep 2
    done
    if [[ "${verified}" == "1" ]]; then
      echo "Verified ${program_name}."
    else
      echo "Warning: could not confirm ${program_name} via leo query yet. It may still be indexing; try again in 1-2 minutes." >&2
      leo -q query program "${program_name}" --network "${NETWORK}" --endpoint "${ENDPOINT}" >/dev/null || true
    fi
  else
    echo "Warning: could not parse program name from ${dir}/program.json for verification." >&2
  fi
done

echo "All contracts deployed."
