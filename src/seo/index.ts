import type { CheerioAPI } from 'cheerio';
import type { Config } from '../config.js';
import { canonical } from './rules/canonical.js';
import { h1 } from './rules/h1.js';
import { indexability } from './rules/indexability.js';
import { lang } from './rules/lang.js';
import { metaDescription } from './rules/meta-description.js';
import { title } from './rules/title.js';
import type { Finding, Rule, RuleContext } from './types.js';

export const rules: Rule[] = [title, metaDescription, h1, canonical, indexability, lang];

/** `off` drops findings; `error`/`warning` forces the severity of every finding of that rule. */
function applySeverity(findings: Finding[], config: Config): Finding[] {
  return findings.flatMap((f) => {
    const sev = config.rules[f.rule as keyof Config['rules']]?.severity;
    if (sev === 'off') return [];
    return [sev ? { ...f, severity: sev } : f];
  });
}

export function runSeoRules(ctx: RuleContext): Finding[] {
  return applySeverity(
    rules.flatMap((r) => r.run(ctx)),
    ctx.config,
  );
}

const titleOf = ($: CheerioAPI) => $('head title').first().text().trim();

/** Cross-page check: path → findings for pages sharing a non-empty <title>. */
export function findDuplicateTitles(
  pages: { path: string; $: CheerioAPI }[],
  config: Config,
): Map<string, Finding[]> {
  const byTitle = new Map<string, string[]>();
  for (const p of pages) {
    const t = titleOf(p.$);
    if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), p.path]);
  }
  const out = new Map<string, Finding[]>();
  for (const [t, paths] of byTitle) {
    if (paths.length < 2) continue;
    for (const path of paths) {
      const others = paths.filter((x) => x !== path);
      const found = applySeverity(
        [
          {
            rule: 'title',
            severity: 'warning',
            message: `duplicate title "${t}"`,
            details: others.map((o) => `also used by ${o}`),
          },
        ],
        config,
      );
      if (found.length) out.set(path, found);
    }
  }
  return out;
}
