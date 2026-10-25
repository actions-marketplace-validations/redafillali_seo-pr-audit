import type { Scores } from '../lighthouse/scores.js';
import type { Finding } from '../seo/types.js';
import type { AuditReport, PageResult } from './types.js';

export const COMMENT_MARKER = '<!-- seo-pr-audit:v1 -->';
export const COMMENT_LIMIT = 65_000;

/** Neutralise HTML, table pipes, backticks and @mentions in text that may come from page content. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'")
    .replace(/@/g, '@​')
    .replace(/\r?\n/g, ' ');
}

const dot = (n: number) => (n >= 90 ? '🟢' : n >= 50 ? '🟠' : '🔴');
const score = (n: number | undefined) => (n === undefined ? '—' : `${dot(n)} ${n}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ICON = { error: '❌', warning: '⚠️', info: 'ℹ️' } as const;

export function runUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : undefined;
}

function title(r: AuditReport): string {
  const { errors, warnings } = r.summary;
  const parts = [errors && plural(errors, 'error'), warnings && plural(warnings, 'warning')].filter(
    Boolean,
  );
  return `## 🔎 SEO PR Audit — ${parts.length ? parts.join(', ') : 'all checks passed'}`;
}

function checks(p: PageResult): string {
  const e = p.findings.filter((f) => f.severity === 'error').length;
  const w = p.findings.filter((f) => f.severity === 'warning').length;
  return [e && `❌ ${e}`, w && `⚠️ ${w}`].filter(Boolean).join(' · ') || '✅';
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function findingLines(findings: Finding[], withDetails: boolean): string[] {
  return [...findings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .flatMap((f) => [
      `- ${ICON[f.severity]} **${esc(f.rule)}** — ${esc(f.message)}`,
      ...(withDetails ? (f.details ?? []).map((d) => `  - \`${esc(d)}\``) : []),
    ]);
}

function table(pages: PageResult[]): string[] {
  const lh = pages.some((p) => p.lighthouse);
  const head = lh ? '| Page | Perf | A11y | BP | SEO | Checks |' : '| Page | Checks |';
  const sep = lh ? '|---|---|---|---|---|---|' : '|---|---|';
  const rows = pages.map((p) => {
    const s: Scores | undefined = p.lighthouse;
    const cells = lh
      ? [score(s?.performance), score(s?.accessibility), score(s?.bestPractices), score(s?.seo)]
      : [];
    return `| \`${esc(p.path)}\` | ${[...cells, checks(p)].join(' | ')} |`;
  });
  return [head, sep, ...rows];
}

type Level = 'full' | 'no-details' | 'table-only';

function render(r: AuditReport, level: Level, link: string | undefined, note: boolean): string {
  const out = [COMMENT_MARKER, title(r), '', ...table(r.pages), ''];
  if (r.summary.thresholdFailures.length) {
    out.push(
      '**Threshold failures**',
      '',
      ...r.summary.thresholdFailures.map((t) => `- ❌ ${esc(t)}`),
      '',
    );
  }
  if (level !== 'table-only') {
    for (const p of r.pages.filter((p) => p.findings.length)) {
      out.push(
        `<details><summary>${esc(p.path)} — details</summary>`,
        '',
        ...findingLines(p.findings, level === 'full'),
        '',
        '</details>',
        '',
      );
    }
  }
  if (note)
    out.push(
      '_Output truncated to fit the comment size limit — see the job summary for all details._',
      '',
    );
  if (link) out.push(`<sub>[View workflow run](${link})</sub>`);
  return out.join('\n').trimEnd() + '\n';
}

/** Render the report; degrades (drop sub-details → drop per-page sections → hard cut) to stay under `maxLength`. */
export function renderMarkdown(
  report: AuditReport,
  { maxLength = COMMENT_LIMIT, link = runUrl() }: { maxLength?: number; link?: string } = {},
): string {
  const full = render(report, 'full', link, false);
  if (full.length <= maxLength) return full;
  for (const level of ['no-details', 'table-only'] as const) {
    const md = render(report, level, link, true);
    if (md.length <= maxLength) return md;
  }
  const md = render(report, 'table-only', link, true);
  const cut = md.slice(0, maxLength - 100);
  return cut.slice(0, cut.lastIndexOf('\n')) + '\n\n_…truncated_\n';
}
