#!/usr/bin/env bash
# Deploy Leo contracts to Aleo testnet. Requires Leo CLI and funded account.
# Set PRIVATE_KEY env or use leo's default.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for dir in contracts/passmeet_v1_7788 contracts/passmeet_subs_7788; do
  echo "Deploying $dir..."
  (cd "$dir" && leo deploy --network testnet) || { echo "Deploy failed for $dir."; exit 1; }
done
echo "All contracts deployed."
