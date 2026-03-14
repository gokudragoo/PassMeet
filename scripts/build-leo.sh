#!/usr/bin/env bash
# Build Leo contracts. Requires Leo CLI: https://docs.leo-lang.org/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LEO_ARGS=()
# Leo prints `.env` values when not quiet; default to quiet to avoid leaking secrets.
if [[ "${LEO_VERBOSE:-0}" != "1" ]]; then
  LEO_ARGS+=(-q)
fi

for dir in contracts/passmeet_events_7788 contracts/passmeet_subs_7788; do
  echo "Building $dir..."
  (cd "$dir" && leo "${LEO_ARGS[@]}" build) || { echo "Failed to build $dir. Is Leo CLI installed? Run: leo --version"; exit 1; }
done
echo "All contracts built successfully."
