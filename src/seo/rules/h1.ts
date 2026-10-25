import type { Rule } from '../types.js';

export const h1: Rule = {
  name: 'h1',
  run({ $ }) {
    const tags = $('h1');
    const err = (message: string) => [{ rule: 'h1', severity: 'error' as const, message }];
    if (tags.length === 0) return err('missing <h1>');
    if (tags.length > 1) return err(`${tags.length} <h1> tags (expected exactly 1)`);
    if (!tags.first().text().trim()) return err('empty <h1>');
    return [];
  },
};
