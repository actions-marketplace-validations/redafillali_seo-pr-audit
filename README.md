# SEO PR Audit

> A GitHub Action that runs **Lighthouse** and a **basic SEO check** on every pull request, then posts the results as a single, auto-updated PR comment.

[![CI](https://github.com/redafillali/seo-pr-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/redafillali/seo-pr-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Catch SEO regressions **before** they reach production: a missing `<title>`, a deleted meta description, two `<h1>`, a wrong canonical, a broken internal link, or a performance drop.

---

## What it checks

| Area                 | Check                                                                 | Default severity         |
| -------------------- | --------------------------------------------------------------------- | ------------------------ |
| **Lighthouse**       | Performance, Accessibility, Best Practices, SEO scores (0–100)        | error if below threshold |
| **Title**            | Present, not empty, 10–60 characters, unique across audited pages     | error / warning          |
| **Meta description** | Present, 50–160 characters                                            | error / warning          |
| **H1**               | Exactly one `<h1>`, not empty                                         | error                    |
| **Canonical**        | Present, absolute URL, single tag, points to an indexable page        | warning / error          |
| **Broken links**     | Internal links (and optionally external) returning 4xx/5xx or failing | error                    |
| **Indexability**     | `noindex` in meta robots or `X-Robots-Tag`                            | warning                  |
| **Lang**             | `<html lang>` present                                                 | warning                  |

## Example comment

```markdown
## 🔎 SEO PR Audit — 2 errors, 1 warning

| Page     | Perf  | A11y  | BP     | SEO    | Checks      |
| -------- | ----- | ----- | ------ | ------ | ----------- |
| `/`      | 🟢 94 | 🟢 98 | 🟢 100 | 🟢 100 | ✅          |
| `/blog/` | 🟠 71 | 🟢 92 | 🟢 96  | 🔴 83  | ❌ 2 · ⚠️ 1 |

<details><summary>/blog/ — details</summary>

- ❌ **meta-description** — missing `<meta name="description">`
- ❌ **broken-links** — `/blog/old-post` → 404
- ⚠️ **title** — 72 characters (recommended ≤ 60)

</details>
```

## Quick start

### Static site (built in the workflow)

```yaml
name: SEO audit
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build

      - uses: redafillali/seo-pr-audit@v1
        with:
          static-dir: ./dist
          paths: |
            /
            /about/
            /blog/
```

### Running server (Laravel, Next.js, WordPress in Docker…)

```yaml
- uses: redafillali/seo-pr-audit@v1
  with:
    start-command: php artisan serve --port=8000
    base-url: http://127.0.0.1:8000
    wait-timeout: 60
    paths: |
      /
      /contact
```

### Preview deployment (Vercel, Netlify, Cloudflare Pages…)

```yaml
- uses: redafillali/seo-pr-audit@v1
  with:
    base-url: ${{ steps.preview.outputs.url }}
    paths: /,/pricing
```

## Inputs

| Input                | Default               | Description                                                                  |
| -------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `base-url`           | —                     | Base URL to audit. Required unless `static-dir` is set.                      |
| `static-dir`         | —                     | Directory to serve locally on a random port (e.g. `./dist`).                 |
| `start-command`      | —                     | Command that starts your server; the action waits for `base-url` to respond. |
| `wait-timeout`       | `60`                  | Seconds to wait for the server to be ready.                                  |
| `paths`              | `/`                   | Paths to audit (newline or comma separated).                                 |
| `lighthouse`         | `true`                | Run Lighthouse.                                                              |
| `lighthouse-preset`  | `mobile`              | `mobile` or `desktop`.                                                       |
| `lighthouse-runs`    | `1`                   | Number of runs per page; the median is kept.                                 |
| `min-performance`    | `0`                   | Minimum Performance score (0 = report only).                                 |
| `min-accessibility`  | `0`                   | Minimum Accessibility score.                                                 |
| `min-best-practices` | `0`                   | Minimum Best Practices score.                                                |
| `min-seo`            | `90`                  | Minimum Lighthouse SEO score.                                                |
| `check-links`        | `internal`            | `none`, `internal` or `all`.                                                 |
| `link-ignore`        | —                     | Regex patterns (one per line) of URLs to skip.                               |
| `link-timeout`       | `10`                  | Seconds per link request.                                                    |
| `link-concurrency`   | `8`                   | Parallel link requests.                                                      |
| `fail-on`            | `error`               | `error`, `warning` or `never`.                                               |
| `comment`            | `true`                | Post / update the PR comment.                                                |
| `comment-mode`       | `update`              | `update` (single sticky comment) or `new`.                                   |
| `config-file`        | `.seo-audit.yml`      | Optional config file (overrides inputs above).                               |
| `github-token`       | `${{ github.token }}` | Token used to post the comment.                                              |

## Outputs

| Output        | Description                                     |
| ------------- | ----------------------------------------------- |
| `report-path` | Path to the full JSON report.                   |
| `errors`      | Number of errors found.                         |
| `warnings`    | Number of warnings found.                       |
| `passed`      | `true` if no threshold or blocking rule failed. |

## Config file (optional)

```yaml
# .seo-audit.yml
paths: [/, /blog/, /contact]
lighthouse:
  preset: desktop
  runs: 3
  thresholds: { performance: 80, seo: 95 }
rules:
  title: { min: 15, max: 60 }
  meta-description: { min: 70, max: 160 }
  canonical: error # error | warning | off
  lang: off
links:
  mode: internal
  ignore:
    - "^https://twitter\\.com"
    - '/admin/'
```

## Forked pull requests

PRs from forks receive a **read-only** `GITHUB_TOKEN`, so the action cannot comment. It still runs, fails the check if needed, and writes the full report to the **job summary**. To comment on fork PRs, use the two-workflow pattern (`pull_request` + `workflow_run`) described in [docs/forks.md](docs/forks.md).

## How it works

1. Starts a target (static server, your command, or a remote URL) and waits until it responds.
2. Fetches each page and runs the SEO rules on the HTML (cheerio).
3. Extracts links and checks them in parallel (HEAD, then GET fallback).
4. Runs Lighthouse with the Chrome preinstalled on GitHub runners.
5. Builds a Markdown report → PR comment (updated in place) + job summary + JSON file.
6. Fails the job according to `fail-on` and the thresholds.

## Roadmap

- Score delta vs. the base branch (`compare-base: true`)
- Sitemap-driven page discovery
- Open Graph / Twitter Card and structured data (JSON-LD) checks
- Lighthouse HTML reports uploaded as artifacts

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm ci
npm test
npm run build   # bundles to dist/ (committed, required by GitHub Actions)
```

## License

[MIT](LICENSE) © Reda El Fillali
