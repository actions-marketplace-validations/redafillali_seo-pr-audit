# Security Policy

## Supported versions

Only the latest `v1.x` release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through GitHub's
"Report a vulnerability" (Security tab) or by email to reda.elfillali@gmail.com.
You will get an answer within a few days.

## Notes for users

- Minimal permissions: `contents: read`, `pull-requests: write`.
- Avoid `pull_request_target` with untrusted code; use the `workflow_run` pattern for forks (see `docs/forks.md`).
