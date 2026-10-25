import { fetchPage } from './fetch-page.js';
import { extractLinks } from './links/extract.js';

/**
 * Expand wildcard paths: `/blog/*` → `/blog/` plus every page under `/blog/` reachable by following
 * links (breadth-first, same origin, HTML only); `/*` crawls the whole site. Plain paths are kept as is.
 * The result is deduplicated and capped at `maxPages`.
 */
export async function expandPaths(
  baseUrl: string,
  paths: string[],
  maxPages: number,
): Promise<string[]> {
  const out = new Set<string>();
  for (const p of paths) {
    if (!p.endsWith('*')) out.add(p);
    else for (const found of await crawl(baseUrl, p.slice(0, -1), maxPages)) out.add(found);
  }
  return [...out].slice(0, maxPages);
}

async function crawl(baseUrl: string, prefix: string, maxPages: number): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const seen = new Set<string>([prefix]);
  const pages: string[] = [prefix]; // the start page is always kept, so a 404 is reported by the audit
  const queue = [prefix];
  for (let i = 0; i < queue.length && pages.length < maxPages; i++) {
    let page;
    // One retry: a dropped keep-alive connection must not silently hide a whole branch of the site.
    for (let attempt = 0; attempt < 2 && !page; attempt++) {
      try {
        page = await fetchPage(baseUrl, queue[i]!);
      } catch {
        /* retry, then give up on this page (the audit reports it as page-unreachable if listed) */
      }
    }
    if (!page) continue;
    const isHtml = (page.headers['content-type'] ?? '').includes('html');
    if (queue[i] !== prefix) {
      if (page.status < 200 || page.status >= 300 || !isHtml) continue; // not an auditable page
      pages.push(queue[i]!);
    }
    if (!isHtml || page.status < 200 || page.status >= 300) continue;
    for (const link of extractLinks(page.html, page.finalUrl)) {
      const u = new URL(link);
      if (u.origin !== origin || !u.pathname.startsWith(prefix) || seen.has(u.pathname)) continue;
      seen.add(u.pathname);
      queue.push(u.pathname);
    }
  }
  return pages.slice(0, maxPages);
}
