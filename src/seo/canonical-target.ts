import * as cheerio from 'cheerio';
import type { Config } from '../config.js';
import { fetchPage } from '../fetch-page.js';
import { runSeoRules } from './index.js';
import type { Finding } from './types.js';

const NOINDEX = /(^|[\s,])(noindex|none)([\s,]|$)/i;

/**
 * "canonical points to an indexable page": fetch the canonical target and error if it is not 2xx or is noindex.
 * Only same-origin targets are fetched (no outbound requests driven by page content); the target of an
 * audited page is mapped back onto the audited base URL, since canonicals usually carry the production host.
 */
export async function canonicalTargetFindings(
  html: string,
  pageUrl: string,
  baseUrl: string,
  config: Config,
): Promise<Finding[]> {
  if (config.rules.canonical.severity === 'off') return [];
  const $ = cheerio.load(html);
  const links = $('link[rel~="canonical" i]');
  if (links.length !== 1) return [];
  let target: URL;
  try {
    target = new URL(links.attr('href') ?? '', pageUrl);
  } catch {
    return [];
  }
  const base = new URL(baseUrl);
  if (!/^https?:$/.test(target.protocol)) return [];
  // Canonicals carry the production host: probe the same path on the audited target instead.
  const probe = new URL(target.pathname + target.search, base);
  if (probe.toString() === new URL(pageUrl).toString()) return [];
  const make = (message: string): Finding[] => [
    {
      rule: 'canonical',
      severity: config.rules.canonical.severity === 'warning' ? 'warning' : 'error',
      message,
    },
  ];
  try {
    const res = await fetchPage(baseUrl, probe.pathname + probe.search, 15_000);
    if (res.status < 200 || res.status >= 300)
      return make(`canonical target ${target.pathname} is not indexable (HTTP ${res.status})`);
    const noindex =
      NOINDEX.test(res.headers['x-robots-tag'] ?? '') ||
      runSeoRules({
        $: cheerio.load(res.html),
        url: res.finalUrl,
        headers: res.headers,
        config,
      }).some((f) => f.rule === 'indexability');
    if (noindex) return make(`canonical target ${target.pathname} is not indexable (noindex)`);
  } catch (e) {
    return make(
      `canonical target ${target.pathname} could not be fetched (${(e as Error).message})`,
    );
  }
  return [];
}
