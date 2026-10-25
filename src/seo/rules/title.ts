import type { Rule } from '../types.js';

export const title: Rule = {
  name: 'title',
  run({ $, config }) {
    const text = $('head title').first().text().trim();
    if ($('head title').length === 0)
      return [{ rule: 'title', severity: 'error', message: 'missing <title>' }];
    if (!text) return [{ rule: 'title', severity: 'error', message: 'empty <title>' }];
    const { min = 10, max = 60 } = config.rules.title;
    const n = [...text].length;
    if (n < min)
      return [
        { rule: 'title', severity: 'warning', message: `${n} characters (recommended ≥ ${min})` },
      ];
    if (n > max)
      return [
        { rule: 'title', severity: 'warning', message: `${n} characters (recommended ≤ ${max})` },
      ];
    return [];
  },
};
