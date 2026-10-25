export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  html: string;
}

/** GET a page (following redirects). Throws on network error or timeout. */
export async function fetchPage(
  baseUrl: string,
  path: string,
  timeoutMs = 30_000,
): Promise<FetchedPage> {
  const url = new URL(path, baseUrl).toString();
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'seo-pr-audit', accept: 'text/html,*/*;q=0.8' },
  });
  return {
    url,
    finalUrl: res.url || url,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    html: await res.text(),
  };
}
