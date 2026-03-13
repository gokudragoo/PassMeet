#!/usr/bin/env bash
# Build Leo contracts. Requires Leo CLI: https://docs.leo-lang.org/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for dir in contracts/passmeet_v1_7788 contracts/passmeet_subs_7788; do
  echo "Building $dir..."
  (cd "$dir" && leo build) || { echo "Failed to build $dir. Is Leo CLI installed? Run: leo --version"; exit 1; }
done
echo "All contracts built successfully."
