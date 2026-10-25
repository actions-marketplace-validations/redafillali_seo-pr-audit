# Plan de développement — à exécuter avec Claude Code

> **Pour Claude Code** : lis d'abord `README.md` (contrat public : inputs, outputs, comportement) puis `docs/CONCEPTION.md` (architecture, règles, modèle de données). Ces deux documents font foi. Exécute les phases **dans l'ordre**. À la fin de chaque phase : `npm run lint && npm test && npm run build` doivent passer, puis fais un commit (Conventional Commits). Ne passe pas à la phase suivante tant que les critères d'acceptation ne sont pas remplis. En cas d'ambiguïté, choisis l'option la plus simple compatible avec le README et note-la dans `docs/DECISIONS.md`.

## Conventions

- Node 22 en local, TypeScript `strict`, ESM, imports explicites.
- Fonctions pures pour les règles SEO et le rendu Markdown ; I/O isolées (`fetch-page`, `links/check`, `lighthouse/run`, `github/comment`, `target/*`).
- Messages utilisateur (logs, commentaire, erreurs) **en anglais**.
- Pas de dépendance non listée dans `CONCEPTION.md` sans justification dans `DECISIONS.md`.
- Tests : chaque règle a un cas OK, un cas erreur, un cas avertissement. Aucun test unitaire ne touche le réseau externe.
- `dist/` est régénéré et commité à chaque phase qui modifie `src/`.

---

## Phase 0 — Initialisation du dépôt

**Tâches**
1. `git init`, branche `main`, `.gitignore` (node_modules, coverage, `.seo-audit/`), `.nvmrc` (22), `.editorconfig`.
2. `package.json` (`"type": "module"`, scripts : `build`, `test`, `test:watch`, `lint`, `format`, `all`).
3. Installer : `typescript`, `@vercel/ncc`, `vitest`, `eslint`, `typescript-eslint`, `prettier`, `@types/node` (dev) ; `@actions/core`, `@actions/github`, `@actions/exec` (prod).
4. `tsconfig.json` (strict, `module: NodeNext`, `target: ES2022`).
5. `action.yml` complet d'après le tableau des inputs/outputs du README, `runs.using: node24` (vérifier le runtime supporté, repli `node20`), `main: dist/index.js`, branding.
6. `src/main.ts` minimal : lit les inputs, log « hello », `core.setOutput('passed','true')`.
7. LICENSE MIT (Reda El Fillali), CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`.
8. `.github/workflows/ci.yml` : checkout, setup-node, `npm ci`, lint, test, build, puis `git diff --exit-code dist/` (dist à jour).

**Acceptation** : `npm run all` passe ; `node dist/index.js` s'exécute sans erreur avec `INPUT_PATHS=/`.

---

## Phase 1 — Configuration

**Tâches**
1. `src/config.ts` : schéma `zod` du type `Config` couvrant tous les inputs du README + le fichier `.seo-audit.yml` (le fichier surcharge les inputs).
2. Parsing des listes (`paths`, `link-ignore`) acceptant virgules et retours ligne ; normalisation des paths (préfixe `/`).
3. Validation : exactement une source de cible parmi `static-dir` / `base-url` (avec ou sans `start-command`) ; erreur claire sinon.
4. Tests unitaires : valeurs par défaut, surcharge par fichier, erreurs de validation lisibles.

**Acceptation** : 100 % des inputs du README sont mappés ; message d'erreur explicite pour une config invalide.

---

## Phase 2 — Cible (serveur) et récupération des pages

**Tâches**
1. `target/static-server.ts` : `sirv` sur port libre (`listen(0)`), retourne `{ baseUrl, close() }`. Servir `index.html` pour les dossiers.
2. `target/command-server.ts` : lance `start-command` en arrière-plan (process détaché), capture les 50 dernières lignes de logs, `close()` tue le groupe de process.
3. `target/wait-for-url.ts` : polling toutes les 500 ms jusqu'à statut < 500 ou `wait-timeout`.
4. `fetch-page.ts` : GET avec timeout, suit les redirections, retourne `{ url, finalUrl, status, headers, html }`.
5. Créer `test/fixtures/site/` :
   - `index.html` (parfait), `about/index.html` (parfait),
   - `bad/index.html` (pas de title, pas de description, 2 h1, canonical relative, lien vers `/missing`),
   - `noindex/index.html`, `long-title/index.html` (title 80 car., description 30 car.).
6. Test d'intégration : servir les fixtures, récupérer chaque page, vérifier statuts.

**Acceptation** : serveur démarré/arrêté proprement dans les tests (aucun handle ouvert) ; timeout testé.

---

## Phase 3 — Règles SEO

**Tâches**
1. `seo/types.ts`, `seo/index.ts` (registre, application des sévérités configurées, `off` désactive).
2. Implémenter les règles du tableau §6 de `CONCEPTION.md` : `title`, `meta-description`, `h1`, `canonical`, `indexability`, `lang`.
3. Détection des titres en doublon entre pages (post-traitement dans `seo/index.ts`).
4. Tests unitaires par règle (HTML inline), + test d'intégration sur les fixtures avec snapshot des findings.

**Acceptation** : `index.html` → 0 finding ; `bad/` → exactement les erreurs attendues ; sévérités configurables testées.

---

## Phase 4 — Liens cassés

**Tâches**
1. `links/extract.ts` : `a[href]` → URLs absolues (résolues sur `finalUrl` / `<base>`), sans fragment, dédoublonnées ; exclure `mailto:`, `tel:`, `javascript:`, `#`.
2. Filtrage `check-links` (`none`/`internal`/`all`) et `link-ignore` (regex).
3. `links/check.ts` : `p-limit(concurrency)`, `HEAD` puis `GET` sur 403/405/501, timeout, User-Agent `seo-pr-audit (+repo URL)`, cache global partagé entre pages, compteur de redirections.
4. Finding `broken-links` par page avec `details` = `url → statut/erreur` (max 20 listés + « and N more »).
5. Tests : serveur local qui renvoie 200/301/404/500/timeout/405-sur-HEAD.

**Acceptation** : `/missing` détecté sur `bad/` ; aucun appel réseau externe en test ; un lien partagé n'est vérifié qu'une fois.

---

## Phase 5 — Lighthouse

**Tâches**
1. Ajouter `lighthouse` et `chrome-launcher`.
2. `lighthouse/run.ts` : lancer Chrome headless (`--no-sandbox --headless=new`) une fois, auditer chaque page séquentiellement, catégories perf/a11y/best-practices/seo, preset `mobile`/`desktop`, `runs` N → médiane par catégorie, scores ×100 arrondis.
3. Si Chrome est introuvable : `core.warning` et retour `undefined` (pas d'échec).
4. Seuils `min-*` → `thresholdFailures` (« /blog/: performance 71 < 80 »).
5. Vérifier que `ncc` embarque correctement Lighthouse (assets, locales). Si le bundle pose problème, documenter la solution dans `DECISIONS.md` (ex. options ncc, ou exclusion + installation à l'exécution en dernier recours).
6. Tests : unitaires sur médiane et seuils (mock du runner) ; Lighthouse réel uniquement dans `e2e.yml`.

**Acceptation** : `node dist/index.js` sur les fixtures produit des scores en local (Chrome installé) ; taille de `dist/` raisonnable et notée dans `DECISIONS.md`.

---

## Phase 6 — Rapport et commentaire

**Tâches**
1. `report/types.ts` (`AuditReport` v1), `report/aggregate.ts` (errors, warnings, passed selon `fail-on` et seuils).
2. `report/markdown.ts` : rendu identique à l'exemple du README (titre bilan, tableau, `<details>` par page, pastilles 🟢🟠🔴, lien vers le run via `GITHUB_SERVER_URL/REPOSITORY/actions/runs/RUN_ID`). Troncature sous 65 000 caractères.
3. `github/comment.ts` : upsert via marqueur `<!-- seo-pr-audit:v1 -->` (lister les commentaires paginés, mettre à jour ou créer) ; `comment-mode: new` crée toujours ; gérer 403 (fork) → warning.
4. Écrire le job summary (`core.summary`), le JSON dans `.seo-audit/report.json`, les outputs `report-path`, `errors`, `warnings`, `passed`.
5. Tests : snapshots Markdown (rapport OK, rapport avec erreurs, rapport tronqué) ; `comment.ts` avec Octokit mocké (création, mise à jour, 403).

**Acceptation** : snapshots relus et cohérents avec le README ; aucune exception si l'événement n'est pas `pull_request`.

---

## Phase 7 — Orchestration et codes de sortie

**Tâches**
1. `main.ts` : config → cible → (SEO + liens en parallèle par page, Lighthouse séquentiel) → rapport → publication → `finally` arrêt de la cible → `setFailed` selon `fail-on`.
2. Logs groupés (`core.group`) par étape ; durée de chaque étape.
3. Page injoignable → finding `page-unreachable`, poursuite des autres pages.
4. Test d'intégration du pipeline complet (Lighthouse désactivé) sur les fixtures avec `fail-on` = error / warning / never.

**Acceptation** : comportements du tableau §8 de `CONCEPTION.md` couverts par des tests.

---

## Phase 8 — E2E et documentation

**Tâches**
1. `.github/workflows/e2e.yml` (sur `pull_request`) : deux jobs utilisant `uses: ./`
   - `good` : fixtures parfaites, `fail-on: error`, doit réussir ;
   - `bad` : page `bad/`, `continue-on-error: true` + étape qui vérifie `outputs.passed == 'false'` et `errors > 0`.
2. `docs/forks.md` : pattern `pull_request` (upload du JSON en artefact) + `workflow_run` (téléchargement et commentaire) avec exemple complet.
3. `examples/` : workflows prêts à copier (statique Vite, Laravel `php artisan serve`, Next.js `next start`, URL de preview).
4. Vérifier que chaque input/output du README existe dans `action.yml` et inversement (script `scripts/check-readme.ts` exécuté en CI).
5. Remplacer `OWNER` dans le README par le compte GitHub final (demander à l'utilisateur si inconnu).

**Acceptation** : e2e verts sur une PR de test ; README et `action.yml` synchronisés.

---

## Phase 9 — Release v1.0.0

**Tâches**
1. `.github/workflows/release.yml` : sur tag `v*.*.*`, vérifie `dist/`, crée la GitHub Release (notes depuis CHANGELOG) et déplace le tag majeur `v1`.
2. CHANGELOG `1.0.0`.
3. Checklist Marketplace dans `docs/RELEASE.md` (nom unique, branding, description ≤ 125 car., catégorie).
4. Ajouter une capture du commentaire réel (`docs/assets/comment.png`) dans le README.

**Acceptation** : `git tag v1.0.0 && git push --tags` produit une release et le tag `v1`.

---

## Après la v1 (roadmap, ne pas implémenter maintenant)

- `compare-base` : audit de la branche de base et colonnes de delta (▲▼).
- Découverte des pages via `sitemap.xml`.
- Règles Open Graph / Twitter Card / JSON-LD.
- Upload des rapports HTML Lighthouse en artefacts.

## Prompt de lancement suggéré

```
Lis README.md, docs/CONCEPTION.md et docs/PLAN_DEVELOPPEMENT.md.
Exécute la Phase 0, vérifie les critères d'acceptation, commit, puis arrête-toi
et résume ce qui a été fait et les décisions prises avant la phase suivante.
```
