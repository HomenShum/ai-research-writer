# Offline contract history

## 2026-10-15 — Exercise the actual v3 agent and CLI

A developer checking the existing v3 API encountered five assertions for removed
`analyzePaper`/`detectAiPatterns` exports. The v3 implementation intentionally uses
`analyze`/`deAi` and AgentResult; adding old aliases would misrepresent the prior
result contract. Align those five assertions and retain the 29 other checks.

Add eight offline scenarios that execute real wrappers, provider parsing, tools
and agent state. Only fetch is intercepted. Cover a planner/tool/final flow, all
nine commands, input truncation, missing key, selected-provider 503 without
fallback, unknown-tool/finite-budget behavior, two waves of six concurrent traces
and ten CLI cases. CLI children receive no provider keys, have a fetch guard and
finish under finite timeouts; their temporary guard file/directory is removed.
The transport and fake environment are restored after each workflow fixture.

Before: byte-identical original tests against a qualified external compilation
gave 34 tests, 29 passed and 5 failed. The normal source checkout lacked compiled
files because installation failed. After the [lock repair](../dependencies/lockfile.md),
normal build and tests passed: 42 tests, 0 failed, 0 skipped. Scripted responses
verify local behavior; they do not grade a real model, establish manuscript
quality, or prove response-size/deadline safety. See [test commands](../../README.md#tests).
