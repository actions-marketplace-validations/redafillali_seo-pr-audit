import type { Finding, Rule } from '../types.js';

export const metaDescription: Rule = {
  name: 'meta-description',
  run({ $, config }) {
    const tags = $('meta[name="description" i]');
    const f = (severity: Finding['severity'], message: string): Finding[] => [
      { rule: 'meta-description', severity, message },
    ];
    if (tags.length === 0) return f('error', 'missing <meta name="description">');
    const text = (tags.first().attr('content') ?? '').trim();
    if (!text) return f('error', 'empty <meta name="description">');
    const out: Finding[] = [];
    if (tags.length > 1)
      out.push(...f('warning', `${tags.length} <meta name="description"> tags (expected 1)`));
    const { min = 50, max = 160 } = config.rules['meta-description'];
    const n = [...text].length;
    if (n < min) out.push(...f('warning', `${n} characters (recommended ≥ ${min})`));
    else if (n > max) out.push(...f('warning', `${n} characters (recommended ≤ ${max})`));
    return out;
  },
};
