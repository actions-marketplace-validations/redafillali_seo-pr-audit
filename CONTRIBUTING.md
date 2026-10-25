# Contributing

Thanks for helping! Issues and PRs are welcome.

## Setup

```bash
nvm use        # Node 22
npm ci
npm run all    # lint + test + build
```

## Rules

- TypeScript `strict`, ESM, explicit imports.
- SEO rules and Markdown rendering are **pure functions**; I/O stays in `target/*`, `links/check`, `lighthouse/run`, `github/comment`.
- User-facing messages (logs, comment, errors) are in English.
- Every SEO rule has an OK case, an error case and a warning case. Unit tests never hit the external network.
- `dist/` is committed: run `npm run build` and commit it whenever `src/` changes (CI checks it).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- No new dependency without a note in `docs/DECISIONS.md`.
