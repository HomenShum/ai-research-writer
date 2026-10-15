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

## 2026-10-15 — Restore the verified local setup sequence

Remove only the now-resolved lockfile and obsolete-test warnings after the actual
clean install, build and offline suite passed on Node 22.22.2/npm 10.9.7. Keep build
before test, BYOK consent, the current AgentResult contract and provider/quality
limits. The Node >=18 engine remains declared; Node 18 was not exercised here.

Before: normal `npm ci` rejected incompatible locked Node typings; build could
not find `tsc`, and tests could not import absent compiled files. A separately
qualified offline compilation exposed 29 passing and 5 obsolete-export failures.
After: normal `npm ci`, `npm run build`, `npm test` and the unchanged low-threshold
audit passed; 42 tests passed with 0 skipped. See the [dependency entry](../dependencies/lockfile.md)
and [offline-contract entry](../tests/index.md). No provider compatibility or
manuscript-quality result is inferred from the scripted responses.
