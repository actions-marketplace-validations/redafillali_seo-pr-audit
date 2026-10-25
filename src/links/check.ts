import pLimit from 'p-limit';
import type { Finding } from '../seo/types.js';

export interface LinkResult {
  url: string;
  /** Final status after redirects; undefined on network error / timeout. */
  status?: number;
  error?: string;
  redirects: number;
}

export interface LinkChecker {
  check(url: string): Promise<LinkResult>;
}

const MAX_REDIRECTS = 10;
const RETRY_WITH_GET = new Set([403, 405, 501]);
export const USER_AGENT = 'seo-pr-audit (+https://github.com/redafillali/seo-pr-audit)';

function describe(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
  return err.cause?.code ?? err.message;
}

async function request(url: string, method: 'HEAD' | 'GET', timeoutMs: number) {
  const res = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT },
  });
  await res.body?.cancel();
  return res;
}

async function probe(start: string, timeoutMs: number): Promise<LinkResult> {
  let url = start;
  let method: 'HEAD' | 'GET' = 'HEAD';
  let redirects = 0;
  try {
    for (;;) {
      let res = await request(url, method, timeoutMs);
      if (method === 'HEAD' && RETRY_WITH_GET.has(res.status)) {
        method = 'GET';
        res = await request(url, method, timeoutMs);
      }
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (++redirects > MAX_REDIRECTS)
          return { url: start, error: 'too many redirects', redirects };
        url = new URL(location, url).toString();
        if (!/^https?:/.test(url))
          return { url: start, error: 'redirect to non-http URL', redirects };
        continue;
      }
      return { url: start, status: res.status, redirects };
    }
  } catch (e) {
    return { url: start, error: describe(e), redirects };
  }
}

/** Checker with a cache shared across pages: each URL is requested at most once. */
export function createLinkChecker(opts: { timeoutMs: number; concurrency: number }): LinkChecker {
  const limit = pLimit(opts.concurrency);
  const cache = new Map<string, Promise<LinkResult>>();
  return {
    check(url) {
      let p = cache.get(url);
      if (!p) {
        p = limit(() => probe(url, opts.timeoutMs));
        cache.set(url, p);
      }
      return p;
    },
  };
}

const MAX_LISTED = 20;
const list = (lines: string[]): string[] =>
  lines.length > MAX_LISTED
    ? [...lines.slice(0, MAX_LISTED), `and ${lines.length - MAX_LISTED} more`]
    : lines;

/** Pure: turn link results of one page into `broken-links` findings. */
export function linkFindings(results: LinkResult[]): Finding[] {
  const broken = results.filter((r) => r.error || (r.status ?? 0) >= 400);
  const chained = results.filter((r) => !r.error && (r.status ?? 0) < 400 && r.redirects > 2);
  const out: Finding[] = [];
  if (broken.length)
    out.push({
      rule: 'broken-links',
      severity: 'error',
      message: `${broken.length} broken link${broken.length > 1 ? 's' : ''}`,
      details: list(broken.map((r) => `${r.url} → ${r.error ?? r.status}`)),
    });
  if (chained.length)
    out.push({
      rule: 'broken-links',
      severity: 'warning',
      message: `${chained.length} link${chained.length > 1 ? 's' : ''} with more than 2 redirects`,
      details: list(chained.map((r) => `${r.url} → ${r.redirects} redirects`)),
    });
  return out;
}

/** Check all `urls` of one page and return its findings. */
export async function checkPageLinks(checker: LinkChecker, urls: string[]): Promise<Finding[]> {
  return linkFindings(await Promise.all(urls.map((u) => checker.check(u))));
}
