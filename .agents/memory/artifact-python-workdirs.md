---
name: Python artifact working directories
description: Why legacy Python entrypoints need different development and production command paths.
---

Managed development services run from their artifact directory, but production commands use workspace-root paths. Preserve the original Python working directory in both cases.

**Why:** The migration's first managed starts failed to find the preserved root Python entrypoints when development commands assumed they ran from the workspace root. Moving entrypoints instead would also change where Streamlit finds its configuration.

**How to apply:** When changing Python service commands, make the development working directory explicit and verify production paths separately. Do not copy the development directory change into a production command that already starts at the workspace root.
