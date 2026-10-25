# Conception — SEO PR Audit

## 1. Objectif

Fournir une GitHub Action réutilisable qui, à chaque pull request, audite un ensemble de pages d'un site (Lighthouse + règles SEO de base + liens cassés) et publie un rapport lisible en commentaire de PR, mis à jour à chaque push.

**Critères de succès**
- Installation en < 5 minutes avec un workflow de 15 lignes.
- Exécution < 3 min pour 5 pages (1 run Lighthouse / page).
- Un seul commentaire par PR, mis à jour (pas de spam).
- Zéro faux positif sur le site de fixtures du projet.
- Publiable sur le GitHub Marketplace.

**Hors périmètre v1** : crawl complet, comparaison avec la branche de base, données structurées, rapports HTML en artefacts (→ roadmap).

## 2. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Type d'action | JavaScript action (`runs.using: node24`) | Démarrage rapide, pas de build Docker, multi-OS possible |
| Langage | TypeScript (strict) | Typage des rapports et des règles |
| Bundling | `@vercel/ncc` → `dist/index.js` commité | Standard des actions JS (pas de `npm install` à l'exécution) |
| Lighthouse | `lighthouse` (API Node) + `chrome-launcher` | Chrome est préinstallé sur `ubuntu-latest` |
| Parsing HTML | `cheerio` | Léger, rapide, API type jQuery |
| HTTP | `fetch` natif (undici) + `AbortSignal.timeout` | Pas de dépendance |
| Concurrence | `p-limit` | Limiter les requêtes de liens |
| Serveur statique | `sirv` + `node:http` sur port aléatoire | Minimal |
| Toolkit GitHub | `@actions/core`, `@actions/github`, `@actions/exec` | Officiels |
| Config | `yaml` + validation `zod` | Messages d'erreur clairs |
| Tests | `vitest` | Rapide, ESM natif |
| Qualité | ESLint (flat config) + Prettier | — |

> Note : vérifier au démarrage la version de runtime Node supportée par GitHub Actions (`node24` attendu en 2026 ; repli `node20` si nécessaire).

## 3. Architecture

```
seo-pr-audit/
├── action.yml                  # Métadonnées, inputs, outputs, runs: node24
├── src/
│   ├── main.ts                 # Orchestration + gestion d'erreurs + exit code
│   ├── config.ts               # Lecture inputs + .seo-audit.yml → Config (zod)
│   ├── target/
│   │   ├── static-server.ts    # Sert static-dir sur un port libre
│   │   ├── command-server.ts   # Lance start-command, l'arrête en fin de job
│   │   └── wait-for-url.ts     # Polling jusqu'à 2xx/3xx ou timeout
│   ├── fetch-page.ts           # GET page → { url, status, headers, html, finalUrl }
│   ├── seo/
│   │   ├── types.ts            # Rule, Finding, Severity
│   │   ├── index.ts            # Registre + exécution des règles
│   │   └── rules/
│   │       ├── title.ts
│   │       ├── meta-description.ts
│   │       ├── h1.ts
│   │       ├── canonical.ts
│   │       ├── indexability.ts
│   │       └── lang.ts
│   ├── links/
│   │   ├── extract.ts          # a[href] → URLs absolues, dédoublonnées, filtrées
│   │   └── check.ts            # HEAD → GET fallback, timeout, cache, concurrence
│   ├── lighthouse/
│   │   └── run.ts              # Lance Chrome, N runs, médiane, scores 0–100
│   ├── report/
│   │   ├── types.ts            # AuditReport (JSON stable, versionné)
│   │   ├── aggregate.ts        # Calcul errors/warnings/passed
│   │   └── markdown.ts         # Rendu commentaire + job summary
│   └── github/
│       └── comment.ts          # Upsert du commentaire via marqueur HTML
├── test/
│   ├── fixtures/site/          # Pages HTML bonnes / mauvaises
│   ├── unit/                   # Une suite par règle + markdown + config
│   └── integration/            # Pipeline complet sur le site de fixtures (sans Lighthouse)
├── .github/workflows/
│   ├── ci.yml                  # lint, test, build, check dist à jour
│   ├── e2e.yml                 # Utilise l'action (uses: ./) sur les fixtures
│   └── release.yml             # Tag vX.Y.Z → déplace le tag majeur vX
└── docs/
```

## 4. Flux d'exécution

```
inputs/config ─► démarrer la cible ─► attendre base-url
                                          │
            ┌─────────────────────────────┼──────────────────────────┐
            ▼ pour chaque path            ▼                          ▼
      fetch HTML ─► règles SEO     extraire liens ─► check     Lighthouse (séquentiel)
            └─────────────────────────────┼──────────────────────────┘
                                          ▼
                     AuditReport (JSON) ─► agrégation ─► Markdown
                                          │
             ┌────────────────────────────┼─────────────────────────┐
             ▼                            ▼                         ▼
   commentaire PR (upsert)        job summary               fichier JSON + outputs
                                          ▼
                       arrêt de la cible ─► setFailed selon fail-on
```

- Lighthouse s'exécute **séquentiellement** (mesures de perf stables) ; règles SEO et liens en parallèle.
- La cible est **toujours arrêtée** (bloc `finally`).
- Une page en erreur (timeout, 500) produit un finding `page-unreachable` (erreur) sans interrompre les autres.

## 5. Modèle de données

```ts
type Severity = 'error' | 'warning' | 'info';

interface Finding {
  rule: string;            // 'title', 'h1', 'broken-links'…
  severity: Severity;
  message: string;         // lisible, en anglais
  details?: string[];      // ex. liste des liens cassés
}

interface PageResult {
  path: string;
  url: string;
  status: number;
  lighthouse?: { performance: number; accessibility: number; bestPractices: number; seo: number };
  findings: Finding[];
}

interface AuditReport {
  version: 1;
  baseUrl: string;
  generatedAt: string;
  pages: PageResult[];
  summary: { errors: number; warnings: number; passed: boolean; thresholdFailures: string[] };
}
```

## 6. Règles SEO (v1)

| Règle | Erreur | Avertissement | Configurable |
|---|---|---|---|
| `title` | absent ou vide | longueur hors [min,max] (déf. 10–60) ; doublon entre pages | min, max, sévérité |
| `meta-description` | absente ou vide | longueur hors [50,160] ; plusieurs balises | min, max, sévérité |
| `h1` | 0 ou > 1 h1 ; h1 vide | — | sévérité |
| `canonical` | > 1 balise ; URL invalide | absente ; relative ; pointe vers un autre domaine | sévérité |
| `indexability` | — | `noindex` (meta robots ou `X-Robots-Tag`) | sévérité |
| `lang` | — | `<html lang>` absent | sévérité |
| `broken-links` | lien → 4xx/5xx ou erreur réseau | redirection 3xx chaînée (> 2) | mode, ignore, timeout, concurrence |
| `page-unreachable` | page auditée non 2xx | — | non |

Chaque règle est une fonction pure `(ctx: { $, url, headers, config }) => Finding[]` → testable unitairement sans réseau.

**Liens** : seuls `http(s)` ; ignorer `mailto:`, `tel:`, `javascript:`, ancres `#…` ; normaliser (supprimer le fragment) ; cache partagé entre pages ; `HEAD` puis `GET` si 405/403/501 ; User-Agent explicite `seo-pr-audit`.

## 7. Commentaire de PR

- Marqueur caché : `<!-- seo-pr-audit:v1 -->` (+ `:{job}` si plusieurs jobs) pour retrouver et **mettre à jour** le commentaire.
- Structure : titre avec bilan → tableau récapitulatif (scores avec 🟢 ≥ 90, 🟠 50–89, 🔴 < 50) → `<details>` par page → pied avec lien vers le run.
- Limite GitHub de 65 536 caractères : tronquer les détails et renvoyer vers le job summary.
- Si l'événement n'est pas une PR, ou si le token est en lecture seule (fork, 403), on ignore le commentaire avec un `core.warning`, sans faire échouer le job.

## 8. Gestion des échecs

| Situation | Comportement |
|---|---|
| Config invalide | `setFailed` avec message zod lisible, avant toute exécution |
| Serveur jamais prêt | `setFailed` « target not ready after Ns » + derniers logs du process |
| Chrome indisponible | Lighthouse désactivé avec warning, le reste s'exécute |
| Seuil non atteint | Ajouté à `thresholdFailures`, compte comme erreur |
| `fail-on: never` | Ne fait jamais échouer le job (mode reporting) |

## 9. Sécurité

- Permissions minimales documentées : `contents: read`, `pull-requests: write`.
- Ne jamais logger le token ; aucune donnée envoyée hors de GitHub.
- `start-command` exécuté via `@actions/exec` (pas d'interpolation shell de contenu PR).
- Documenter le risque de `pull_request_target` et recommander le pattern `workflow_run` pour les forks.

## 10. Distribution

- Versionnage SemVer ; tags `v1.0.0` + tag flottant `v1`.
- `dist/` commité ; la CI vérifie qu'il est à jour.
- Branding Marketplace dans `action.yml` (`icon: search`, `color: green`).
- Fichiers communautaires : LICENSE (MIT), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, templates d'issues/PR, CHANGELOG.
