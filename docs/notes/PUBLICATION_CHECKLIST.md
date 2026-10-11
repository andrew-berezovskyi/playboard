# Publication gate — user permission required

The user authorized pushing source to andrew-berezovskyi/playboard on 11 October 2026. Deployment and paid services are not authorized. Local Git is initialized; release limitations remain documented.

- Obtain explicit permission before creating a GitHub repository, push, deployment, paid plan or chargeable resource.
- Verify brand/trademark/domain and third-game IP; do not infer clearance from web search.
- Recheck hosting Free conditions, cookies/proxy/WS routing and SMTP limits; enable only zero-cost plans, no automatic paid upgrades.
- Implement and pass remaining Definition of Done from PROJECT_SPEC.md; a finished foundation is not a finished platform.
- Recheck direct/transitive package licenses, Stockfish corresponding-source obligations before distribution.
- .env and .local ignored; inspect tracked files, not only ignore patterns. Run npm audit and check the built frontend for secrets.
- Install official Gitleaks binary and run `gitleaks dir . --redact` before publication (configure ignored generated/vendor directories), then `gitleaks git . --redact` once a Git history exists. A script is provided; it fails if scanner/history are unavailable rather than claiming success.
- Review all Git history and staged diff, rotate any accidentally committed secret, remove local seed/outbox/dumps from publication.
- Configure HTTPS/WSS, secure cookies, same-origin routing, CSP on frontend host, exact Origin allowlist, trusted-proxy policy.
- Verify fresh DB migration, backup/restore, retention, account deletion, reconnect/restart consistency, real-device accessibility and CI.

Current tooling: scripts/check-publication.ps1 scans a clean copy of staged publication files and then history; original local mail/database files remain ignored. Backup/restore round trip and maintenance dry run were executed; production scheduling remains open. See ITERATION_2026-10-11.md for current release gates and scan results.

Source beta published on 11 October 2026 to https://github.com/andrew-berezovskyi/playboard. Initial commit: dce2298b845e8fbdc61b18ab8c81aa9fd78546e2. Gitleaks scanned the staged publication files and the initial commit history with no findings. [The first GitHub CI run](https://github.com/andrew-berezovskyi/playboard/actions/runs/38161169479) independently passed its secret scan, migrations, build/unit checks and complete Chromium/Firefox/WebKit browser suite. Both READMEs include a checks badge. This source publication does not close the documented production release gates or deploy a website.
