import * as cheerio from 'cheerio';

const SKIPPED = /^\s*(#|mailto:|tel:|javascript:)/i;

/** a[href] → absolute http(s) URLs, resolved against <base href> / finalUrl, without fragment, deduplicated. */
export function extractLinks(html: string, finalUrl: string): string[] {
  const $ = cheerio.load(html);
  let base = finalUrl;
  const baseHref = $('base[href]').first().attr('href');
  if (baseHref) {
    try {
      base = new URL(baseHref, finalUrl).toString();
    } catch {
      /* invalid <base>: keep finalUrl */
    }
  }
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!;
    if (SKIPPED.test(href)) return;
    try {
      const u = new URL(href.trim(), base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      u.hash = '';
      out.add(u.toString());
    } catch {
      /* unparsable href: not a checkable link */
    }
  });
  return [...out];
}

/** Apply `check-links` mode (none/internal/all) and `link-ignore` patterns. */
export function filterLinks(
  urls: string[],
  opts: { mode: 'none' | 'internal' | 'all'; ignore: RegExp[]; origin: string },
): string[] {
  if (opts.mode === 'none') return [];
  return urls.filter(
    (u) =>
      (opts.mode === 'all' || new URL(u).origin === opts.origin) &&
      !opts.ignore.some((re) => re.test(u)),
  );
}
