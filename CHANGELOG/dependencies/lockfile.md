# Source installation history

## 2026-10-15 — Match the existing v3 manifest

A developer following the source setup could not install the declared tools.
The v3 manifest had changed while its lock root still described version 1.0.0
and Node 25 typings. Normal `npm ci` rejected that mismatch before compilation.

Regenerate the lock for the unchanged version 3.0.0 manifest, Node >=18 engine,
Node typings ^22.15.2 and TypeScript ^5.4.0. The resulting Node typings 22.20.5 use
undici-types 6.21.0; TypeScript 5.9.3 is retained. No runtime dependency, manifest
range, executable, script, provider or public API changed.

Before: normal `npm ci` exited 1 with EUSAGE. After: normal `npm ci` and
`npm run build` exited 0; `npm audit --audit-level=low` found 0 vulnerabilities.
These are installation/dependency checks on Node 22.22.2/npm 10.9.7, not proof of
Node 18 or production/provider compatibility. See [setup](../../README.md#quick-start)
and the [offline tests](../tests/index.md).
