#!/usr/bin/env bash
# Deploy Leo contracts to Aleo (WSL-friendly). Requires Leo CLI and a funded account.
#
# Usage (recommended):
#   export PRIVATE_KEY="APrivateKey1..."
#   export NETWORK="testnet"
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

DEPLOY_EXTRA_ARGS=()
if leo deploy --help 2>&1 | grep -q -- "--private-key"; then
  DEPLOY_EXTRA_ARGS+=(--private-key "${PRIVATE_KEY}")
else
  echo "Warning: your leo CLI doesn't advertise --private-key for deploy." >&2
  echo "Make sure your Leo account is configured before deploying (e.g. leo account import)." >&2
fi

CONTRACT_DIRS=(
  "contracts/passmeet_v1_7788"
  "contracts/passmeet_subs_7788"
)

for dir in "${CONTRACT_DIRS[@]}"; do
  echo "Building ${dir}..."
  (cd "${dir}" && leo build)

  echo "Deploying ${dir} (network=${NETWORK})..."
  (cd "${dir}" && leo deploy --network "${NETWORK}" "${DEPLOY_EXTRA_ARGS[@]}") || {
    echo "Deploy failed for ${dir}." >&2
    exit 1
  }
done

echo "All contracts deployed."
