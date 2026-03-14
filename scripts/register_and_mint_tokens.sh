#!/usr/bin/env bash
set -euo pipefail

# WSL-friendly wrapper for scripts/register_and_mint_tokens.mjs.
# Uses Linux `node` if available, otherwise falls back to Windows `node.exe`.

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
  echo "" >&2
  echo "Fix options:" >&2
  echo "  1) Run from Windows PowerShell (recommended):" >&2
  echo "     cd C:\\Users\\BMSIT\\PassMeet" >&2
  echo "     \$env:PRIVATE_KEY='APrivateKey1...'" >&2
  echo "     node .\\scripts\\register_and_mint_tokens.mjs" >&2
  echo "" >&2
  echo "  2) Install Node.js in WSL (Node 18+):" >&2
  echo "     sudo apt update && sudo apt install -y nodejs npm" >&2
  echo "" >&2
  exit 1
fi

if [[ -z "${PRIVATE_KEY:-}" ]] && [[ -z "${ALEO_PRIVATE_KEY:-}" ]]; then
  read -r -s -p "Aleo private key (input hidden): " PRIVATE_KEY
  echo
  export PRIVATE_KEY
fi

exec "${NODE_BIN}" "scripts/register_and_mint_tokens.mjs" "$@"
