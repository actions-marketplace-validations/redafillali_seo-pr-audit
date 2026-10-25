# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-10-25

### Changed

- **`comment` now defaults to `false`.** Set `comment: true` to post the PR / commit comment (needs `pull-requests: write` or `contents: write`). The job summary, JSON report and outputs are always produced.

## [1.1.1] - 2026-10-25

### Fixed

- Commenting is optional: without write permission the comment is skipped with a notice (not a warning) naming the missing permission (`contents: write` on push, `pull-requests: write` on PR).

## [1.1.0] - 2026-10-25

### Added

- `canonical` rule: error when the canonical target is not 2xx or is `noindex` (same-origin probing only).
- Screenshot of a real PR comment in the README; E2E workflow now also posts a real comment on PRs.

## [1.0.1] - 2026-10-25

### Security

- `start-command`, `base-url` and `static-dir` are no longer accepted from `.seo-audit.yml` (the file comes from the audited repository); they only come from action inputs.
- Page paths that resolve outside `base-url` are rejected; link redirects to non-http(s) URLs are rejected.
- Lighthouse is installed with `npm install --ignore-scripts`.
- Markdown control characters are escaped in report text; an existing comment is only reused when written by a bot.

## [1.0.0] - 2026-10-25

### Added

- Inputs / `.seo-audit.yml` configuration validated with zod.
- Static server, command server and remote URL targets.
- SEO rules: `title`, `meta-description`, `h1`, `canonical`, `indexability`, `lang`, duplicate titles.
- Broken link detection (HEAD → GET fallback, shared cache, redirect counting).
- Lighthouse scores (median of N runs, mobile/desktop, thresholds); installed on first use.
- Markdown report: sticky PR comment (or commit comment on `push`), job summary, JSON report, outputs.
- `fail-on` modes, `page-unreachable` handling, fork guidance (`docs/forks.md`) and workflow examples.

## [0.1.0] - 2026-10-25

### Added

- Repository scaffold: TypeScript, ncc bundling, vitest, ESLint, Prettier, CI, `action.yml`.
