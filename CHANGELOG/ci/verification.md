# Offline verification history

## 2026-10-15 — Check pull requests and master updates

A developer changing this package previously had to run every check manually;
there was no checked-in Actions workflow. Add one Ubuntu/Node22 job that installs
the lockfile, builds, runs the offline suite and audits at the existing low
threshold. Use pinned official actions, read-only repository permissions and a
ten-minute job budget. No provider keys, publishing or deployment are involved.

The same commands passed locally before adding the workflow. Actual GitHub CI is
still pending; this entry does not establish Node18 compatibility, live-provider
quality or fixes for the existing provider-budget/body-size and maxSteps limits.
