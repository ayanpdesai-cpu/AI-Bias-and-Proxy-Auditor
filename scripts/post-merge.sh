#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile

# The Nix-managed interpreter is externally managed (PEP 668). Install the
# project's Python dependencies into its writable user-base instead of trying
# to modify the immutable interpreter environment.
python_user_base="$(python -m site --user-base)"
mkdir -p "$python_user_base"
uv pip install --prefix "$python_user_base" -r requirements.txt
