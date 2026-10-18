---
name: BiasX type semantics
description: Keep binary correlations available without imposing an order on nominal categories.
---

Treat binary categorical outcomes and features as eligible for absolute Pearson correlation; exclude nominal categories with three or more labels from Pearson.

**Why:** Blocking Pearson for every categorical column hid valid numeric-feature correlations when binary outcomes such as approved were inferred as categorical.

**How to apply:** When changing type inference or metric applicability, check numeric-to-binary and binary-to-binary cases as well as multiclass nominal cases. Type detection is a heuristic, not proof of a column's meaning.
