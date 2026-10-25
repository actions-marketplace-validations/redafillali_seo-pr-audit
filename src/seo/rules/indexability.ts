import type { Rule } from '../types.js';

const hasNoindex = (v: string) => /(^|[\s,])(noindex|none)([\s,]|$)/i.test(v);

export const indexability: Rule = {
  name: 'indexability',
  run({ $, headers }) {
    const sources: string[] = [];
    $('meta[name="robots" i], meta[name="googlebot" i]').each((_, el) => {
      if (hasNoindex($(el).attr('content') ?? '')) sources.push('meta robots');
    });
    if (hasNoindex(headers['x-robots-tag'] ?? '')) sources.push('X-Robots-Tag header');
    if (sources.length === 0) return [];
    return [
      {
        rule: 'indexability',
        severity: 'warning',
        message: `page is noindex (${[...new Set(sources)].join(', ')})`,
      },
    ];
  },
};
