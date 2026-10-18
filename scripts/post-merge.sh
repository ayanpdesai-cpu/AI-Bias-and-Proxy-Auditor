#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
python -m pip install --disable-pip-version-check -r requirements.txt
