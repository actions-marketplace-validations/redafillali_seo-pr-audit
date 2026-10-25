# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
