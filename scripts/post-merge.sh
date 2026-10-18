#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile

# The Nix-managed interpreter is externally managed (PEP 668). Install the
# project's Python dependencies into its writable user-site instead of trying
# to modify the immutable interpreter environment.
python_user_site="$(python -m site --user-site)"
mkdir -p "$python_user_site"
python -m pip install \
  --target "$python_user_site" \
  --disable-pip-version-check \
  -r requirements.txt
