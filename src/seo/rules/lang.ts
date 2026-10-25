import type { Rule } from '../types.js';

export const lang: Rule = {
  name: 'lang',
  run({ $ }) {
    if (($('html').attr('lang') ?? '').trim()) return [];
    return [{ rule: 'lang', severity: 'warning', message: 'missing <html lang>' }];
  },
};
