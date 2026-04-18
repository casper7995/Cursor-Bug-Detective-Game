#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! grep -q "vibej.am/2026/widget.js" "$ROOT/dist/index.html"; then
  echo "missing vibej.am/2026/widget.js in dist/index.html" >&2
  exit 1
fi
