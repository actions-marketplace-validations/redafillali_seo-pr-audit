# Pull requests from forks

PRs from forks get a **read-only** `GITHUB_TOKEN`, so the action cannot comment on them. It still runs, fails the check when needed and writes the full report to the **job summary**.

To comment on fork PRs, split the work in two workflows: the untrusted one only **audits and uploads the JSON report**; a trusted `workflow_run` workflow downloads it and posts the comment.

> **Never** run untrusted PR code with `pull_request_target` (it has a write token and secrets). The pattern below keeps the PR code in the unprivileged `pull_request` workflow.

## 1. Audit workflow (`pull_request`, no write access needed)

```yaml
# .github/workflows/seo-audit.yml
name: SEO audit
on: pull_request

permissions:
  contents: read

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build

      - id: audit
        uses: redafillali/seo-pr-audit@v1
        with:
          static-dir: ./dist
          paths: /,/about/
          comment: 'false' # default; fork tokens are read-only
          fail-on: never # let the second workflow report; set `error` to also fail the check

      - name: Save PR number next to the report
        run: echo "${{ github.event.pull_request.number }}" > .seo-audit/pr-number

      - uses: actions/upload-artifact@v4
        with:
          name: seo-audit
          path: .seo-audit/
```

## 2. Comment workflow (`workflow_run`, trusted)

It runs from the default branch with a write token, and **only handles data** (it never checks out or executes PR code). The report is rendered by your own script, so the PR cannot inject anything beyond text that is escaped here.

```yaml
# .github/workflows/seo-comment.yml
name: SEO audit comment
on:
  workflow_run:
    workflows: ['SEO audit']
    types: [completed]

permissions:
  pull-requests: write
  actions: read

jobs:
  comment:
    if: github.event.workflow_run.event == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: seo-audit
          path: seo-audit
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}

      - uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const pr = Number(fs.readFileSync('seo-audit/pr-number', 'utf8').trim());
            if (!Number.isInteger(pr)) throw new Error('invalid PR number');
            const r = JSON.parse(fs.readFileSync('seo-audit/report.json', 'utf8'));
            const esc = (s) => String(s).replace(/[&<>|`@]/g, (c) => `&#${c.charCodeAt(0)};`);
            const { errors, warnings } = r.summary;
            const rows = r.pages.map((p) => {
              const e = p.findings.filter((f) => f.severity === 'error').length;
              const w = p.findings.filter((f) => f.severity === 'warning').length;
              return `| \`${esc(p.path)}\` | ${e || w ? `❌ ${e} · ⚠️ ${w}` : '✅'} |`;
            });
            const body = [
              '<!-- seo-pr-audit:v1 -->',
              `## 🔎 SEO PR Audit — ${errors} errors, ${warnings} warnings`,
              '',
              '| Page | Checks |',
              '|---|---|',
              ...rows,
            ].join('\n');
            const { owner, repo } = context.repo;
            const comments = await github.paginate(github.rest.issues.listComments, {
              owner, repo, issue_number: pr, per_page: 100,
            });
            const mine = comments.find(
              (c) => c.user?.login === 'github-actions[bot]' && c.body?.includes('<!-- seo-pr-audit:v1 -->'),
            );
            if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
            else await github.rest.issues.createComment({ owner, repo, issue_number: pr, body });
```

Notes:

- Treat the artifact as **untrusted input**: validate the PR number and escape everything you print.
- The comment is looked up by marker **and** author (`github-actions[bot]`), so a contributor cannot hijack it by pasting the marker in their own comment.
