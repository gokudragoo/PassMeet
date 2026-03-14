#!/usr/bin/env bash
set -euo pipefail

# WSL-friendly wrapper for scripts/check_tokens.mjs.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: Node.js not found in this environment." >&2
  echo "Run from Windows PowerShell: node .\\scripts\\check_tokens.mjs" >&2
  exit 1
fi

exec "${NODE_BIN}" "scripts/check_tokens.mjs"

