# Release & Marketplace checklist

## Cut a release

1. Move `[Unreleased]` entries of `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
2. `npm run all` and commit `dist/` (CI checks it is up to date).
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. `release.yml` verifies `dist/`, creates the GitHub Release from the CHANGELOG section and moves the floating major tag (`v1`).

## Marketplace checklist

- [ ] Unique action `name` (check on the Marketplace: "SEO PR Audit" may be taken; rename in `action.yml` if so).
- [ ] `description` in `action.yml` is ≤ 125 characters.
- [ ] `branding` set (`icon: search`, `color: green`).
- [ ] Category chosen when publishing (suggested: _Code quality_, secondary: _Testing_).
- [ ] README has usage examples and the inputs/outputs tables (`scripts/check-readme.ts` keeps them in sync).
- [ ] `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md` present.
- [ ] Release created from the GitHub UI with "Publish this Action to the GitHub Marketplace" ticked (needs accepting the Marketplace developer agreement once).
- [x] Add a real screenshot of the PR comment at `docs/assets/comment.png` and reference it in the README.
