# BiasX

BiasX audits CSV datasets for hidden bias and proxy variables.

## Preserve the existing apps

Keep the original Streamlit app and AuditorRerun sandbox. The user requested removal of the separate BiasX Web App and its launcher; do not recreate it unless explicitly asked. Do not change the original apps' analysis behavior or design as part of cleanup.

The root Python entry points stay in place so their working directories, Streamlit configuration, and publishing command remain compatible.

## Run & operate

Use the **Project** workflow to run the original three services:

- `artifacts/api-server: Streamlit` — original `app.py`, port 5000, routed at `/`.
- `artifacts/api-server: Python API` — original Flask `api.py`, port 8080, routed at `/columns` and `/run-audit`.
- `artifacts/mockup-sandbox: Component Preview Server` — existing React mockups, port 8081, routed at `/__mockup`.

Python services are declared in `artifacts/api-server/.replit-artifact/artifact.toml`. This manifest intentionally hosts the original Python services instead of the unused Express scaffold. The scaffold's TypeScript files and shared libraries remain available for future work; they are not required by the Python apps.

Install dependencies with `bash scripts/post-merge.sh`. Python 3.11 and Node.js 24 are configured together. The script uses pnpm for workspace packages and uv with `--prefix` to install Python requirements into the project's writable user-base, including its `bin` commands. Do not use a default `python -m pip install`: Nix's immutable interpreter is externally managed (PEP 668). Do not use `--target` for this setup: it places console scripts inside the package directory instead of the executable path. The script does not push a database schema: these apps do not require a database.

## Publishing

Keep `.replit` publishing pointed at:

```sh
streamlit run app.py --server.port 5000 --server.address 0.0.0.0
```

Do not redirect publishing to the mockup sandbox. The Python artifact's production command runs the original Streamlit entry point from the workspace root. Publishing requires the user's later confirmation.

## Source map

- `app.py`: original Streamlit app (unchanged).
- `main.py`: preserved alternate Python entry point.
- `api.py`: original Flask endpoints (unchanged).
- `.streamlit/config.toml`: original Streamlit settings (unchanged).
- `requirements.txt`: original Python dependencies plus Flask and Flask-CORS, previously installed but not declared.
- `artifacts/mockup-sandbox/src/components/mockups/bias-auditor/`: original BiasX React mockups, including the live API-connected screen.
- `artifacts/mockup-sandbox/src/index.css`: original visual tokens.
- `.migration-backup/`: migration archive, not an active application; excluded from dependency discovery and deployment.

## Routing

The workspace proxy routes by most-specific path, without stripping prefixes. Flask keeps its original endpoint paths. Browser code calls those same-origin paths instead of hardcoding a development host or port. Streamlit owns `/`, including its WebSocket and health routes.

Future artifacts must use their own paths without overwriting the existing apps. If a future web app takes `/`, move Streamlit deliberately and update its base URL, service routes, and verification together; do not silently shadow it.
