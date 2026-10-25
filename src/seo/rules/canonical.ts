import type { Rule } from '../types.js';

export const canonical: Rule = {
  name: 'canonical',
  run({ $, url }) {
    const tags = $('link[rel~="canonical" i]');
    const f = (severity: 'error' | 'warning', message: string) => [
      { rule: 'canonical', severity, message },
    ];
    if (tags.length === 0) return f('warning', 'missing <link rel="canonical">');
    if (tags.length > 1) return f('error', `${tags.length} canonical tags (expected 1)`);
    const href = (tags.attr('href') ?? '').trim();
    if (!href) return f('error', 'canonical has an empty href');
    let target: URL;
    try {
      target = new URL(href);
    } catch {
      // Not absolute: a valid relative reference is a warning, anything else is invalid.
      try {
        new URL(href, url);
        return f('warning', `canonical is relative (${href}); use an absolute URL`);
      } catch {
        return f('error', `canonical is not a valid URL (${href})`);
      }
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      return f('error', `canonical is not a valid URL (${href})`);
    if (target.hostname !== new URL(url).hostname)
      return f('warning', `canonical points to another domain (${target.hostname})`);
    return [];
  },
};
