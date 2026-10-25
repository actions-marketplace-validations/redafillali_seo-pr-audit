import * as cheerio from 'cheerio';
import * as core from '@actions/core';
import type { Config } from './config.js';
import { expandPaths } from './discover.js';
import { fetchPage } from './fetch-page.js';
import { checkPageLinks, createLinkChecker } from './links/check.js';
import { extractLinks, filterLinks } from './links/extract.js';
import { startLighthouse } from './lighthouse/run.js';
import { thresholdFailures } from './lighthouse/scores.js';
import { buildReport } from './report/aggregate.js';
import type { AuditReport, PageResult } from './report/types.js';
import { canonicalTargetFindings } from './seo/canonical-target.js';
import { findDuplicateTitles, runSeoRules } from './seo/index.js';
import type { Finding } from './seo/types.js';

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> =>
  core.group(label, async () => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      core.info(`${label} took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  });

/** Fetch + SEO rules + links for one path. An unreachable page yields `page-unreachable`, never throws. */
async function auditPage(
  baseUrl: string,
  path: string,
  config: Config,
  checker: ReturnType<typeof createLinkChecker>,
): Promise<{ result: PageResult; $?: cheerio.CheerioAPI }> {
  const url = new URL(path, baseUrl).toString();
  let page;
  try {
    page = await fetchPage(baseUrl, path);
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message;
    return {
      result: {
        path,
        url,
        status: 0,
        findings: [
          { rule: 'page-unreachable', severity: 'error', message: `request failed (${msg})` },
        ],
      },
    };
  }
  if (page.status < 200 || page.status >= 300) {
    return {
      result: {
        path,
        url,
        status: page.status,
        findings: [{ rule: 'page-unreachable', severity: 'error', message: `HTTP ${page.status}` }],
      },
    };
  }
  const $ = cheerio.load(page.html);
  const links = filterLinks(extractLinks(page.html, page.finalUrl), {
    mode: config.links.mode,
    ignore: config.links.ignore,
    origin: new URL(baseUrl).origin,
  });
  const [seo, linkFindings, canonicalTarget] = await Promise.all([
    Promise.resolve(runSeoRules({ $, url: page.finalUrl, headers: page.headers, config })),
    checkPageLinks(checker, links),
    canonicalTargetFindings(page.html, page.finalUrl, baseUrl, config),
  ]);
  return {
    result: {
      path,
      url,
      status: page.status,
      findings: [...seo, ...canonicalTarget, ...linkFindings],
    },
    $,
  };
}

/** Pages in parallel (SEO + links), then Lighthouse sequentially, then aggregation. */
export async function runAudit(baseUrl: string, config: Config): Promise<AuditReport> {
  const checker = createLinkChecker({
    timeoutMs: config.links.timeout * 1000,
    concurrency: config.links.concurrency,
  });

  const paths = await timed('Discover pages', () =>
    expandPaths(baseUrl, config.paths, config.maxPages),
  );
  core.info(`${paths.length} page(s) to audit`);
  const audited = await timed('SEO rules and links', () =>
    Promise.all(paths.map((p) => auditPage(baseUrl, p, config, checker))),
  );
  const pages = audited.map((a) => a.result);

  const dupes = findDuplicateTitles(
    audited.flatMap((a) => (a.$ ? [{ path: a.result.path, $: a.$ }] : [])),
    config,
  );
  for (const p of pages) p.findings.push(...(dupes.get(p.path) ?? ([] as Finding[])));

  const failures: string[] = [];
  if (config.lighthouse.enabled) {
    await timed('Lighthouse', async () => {
      const lh = await startLighthouse(config.lighthouse);
      if (!lh) return;
      try {
        for (const p of pages.filter((p) => p.status >= 200 && p.status < 300)) {
          core.info(`Auditing ${p.path}`);
          p.lighthouse = await lh.audit(p.url);
          if (p.lighthouse)
            failures.push(...thresholdFailures(p.path, p.lighthouse, config.lighthouse.thresholds));
          else core.warning(`No Lighthouse result for ${p.path}`);
        }
      } finally {
        await lh.close();
      }
    });
  }

  return buildReport(baseUrl, pages, failures, config.failOn);
}
