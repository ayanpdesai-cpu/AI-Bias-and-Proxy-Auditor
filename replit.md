# BiasX

BiasX audits CSV datasets for hidden bias and proxy variables.

## Preserve the existing apps

The user chose to keep the original Streamlit app and add React as a separate web app, not replace Streamlit. Do not change analysis behavior or design as part of workspace migration.

The root Python entry points stay in place so their working directories, Streamlit configuration, and publishing command remain compatible. The separate React app lives in `artifacts/biasx/` and uses `/biasx/`; it does not replace Streamlit or the design sandbox.

## Run & operate

Use the **Project** workflow to run all four services:

- `artifacts/api-server: Streamlit` — original `app.py`, port 5000, routed at `/`.
- `artifacts/api-server: Python API` — original Flask `api.py`, port 8080, routed at `/columns` and `/run-audit`.
- `artifacts/mockup-sandbox: Component Preview Server` — existing React mockups, port 8081, routed at `/__mockup`.
- `artifacts/biasx: web` — publishable React app, port 20053, routed at `/biasx/`.

Python services are declared in `artifacts/api-server/.replit-artifact/artifact.toml`. This manifest intentionally hosts the original Python services instead of the unused Express scaffold. The scaffold's TypeScript files and shared libraries remain available for future work; they are not required by the Python apps.

Install dependencies with `bash scripts/post-merge.sh`. Python 3.11 and Node.js 24 are configured together. The script uses pnpm for workspace packages and uv with `--prefix` to install Python requirements into the project's writable user-base, including its `bin` commands. Do not use a default `python -m pip install`: Nix's immutable interpreter is externally managed (PEP 668). Do not use `--target` for this setup: it places console scripts inside the package directory instead of the executable path. The script does not push a database schema: these apps do not require a database.

## Publishing

Keep `.replit` publishing pointed at:

```sh
streamlit run app.py --server.port 5000 --server.address 0.0.0.0
```

Do not redirect publishing to the mockup sandbox. The React app has its own artifact manifest and static production build; its build is `pnpm --filter @workspace/biasx run build` and its output is `artifacts/biasx/dist/public`. The Python artifact's production command runs the original Streamlit entry point from the workspace root. Publishing requires the user's later confirmation.

## React app data and checks

The web app starts empty and analyzes explicit example selections or CSV uploads entirely in the browser. It does not send uploaded datasets to the Python API or persist them across reloads. NUM/CAT overrides and target changes recompute the same data used by the dashboard and downloadable PDF. Missing values and invalid NUM values are excluded pairwise and reported in Data Preview. Risk flags are screening heuristics, not evidence that discrimination occurred or that a low-risk dataset is fair. Group disparity means a maximum-minus-minimum binary outcome-rate gap, not the four-fifths ratio.

Run the app type check and production build:

```sh
pnpm --filter @workspace/biasx run typecheck
pnpm --filter @workspace/biasx run build
```

Run the CSV, type-semantics, metrics, heatmap, and PDF regressions:

```sh
pnpm --filter @workspace/api-server exec esbuild ../../tests/biasx-audit.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/biasx-audit.test.cjs
node --test /tmp/biasx-audit.test.cjs
```

## Source map

- `app.py`: original Streamlit app (unchanged).
- `main.py`: preserved alternate Python entry point.
- `api.py`: original Flask endpoints (unchanged).
- `artifacts/biasx/src/pages/home.tsx`: React upload, example selection, target/type controls, and dashboard state.
- `artifacts/biasx/src/lib/audit.ts`: CSV parsing, type inference, metrics, risk classification, and full-column heatmap.
- `artifacts/biasx/src/lib/pdf.ts`: downloadable PDF built from the current analysis results.
- `artifacts/biasx/src/components/biasx/`: graduated dashboard, charts, controls, and 1.5-second startup splash.
- `.streamlit/config.toml`: original Streamlit settings (unchanged).
- `requirements.txt`: original Python dependencies plus Flask and Flask-CORS, previously installed but not declared.
- `artifacts/mockup-sandbox/src/components/mockups/bias-auditor/`: original BiasX React mockups, including the live API-connected screen.
- `artifacts/mockup-sandbox/src/index.css`: original visual tokens.
- `.migration-backup/`: migration archive, not an active application; excluded from dependency discovery and deployment.

## Routing

The workspace proxy routes by most-specific path, without stripping prefixes. Flask keeps its original endpoint paths. Browser code calls those same-origin paths instead of hardcoding a development host or port. Streamlit owns `/`, including its WebSocket and health routes.

Future artifacts must use their own paths without overwriting the existing apps. If a future web app takes `/`, move Streamlit deliberately and update its base URL, service routes, and verification together; do not silently shadow it.
