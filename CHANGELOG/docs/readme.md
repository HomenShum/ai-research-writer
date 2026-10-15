# README history

## 2026-10-15 — Align onboarding with the v3 agent API

Correct the old offline analyzer instructions so developers know that `analyze`
and `demo` contact an LLM. Document the current commands, result fields, provider
selection, local help path and existing lockfile/test mismatches; remove unsupported
JSON flags and score-based acceptance claims.

**Base**: `df156e31f4e77296b10af951c9b7cc25338420e5`.
**Validation**: the same source-bound documentation check changed from 0/10 to
10/10; five local links resolve. Runtime source, manifests, lockfile and tests are
unchanged. The normal build could not start because `tsc` was unavailable; no
dependencies were installed and no tests or provider commands were executed.
