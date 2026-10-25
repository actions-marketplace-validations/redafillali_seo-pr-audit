import * as cheerio from 'cheerio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config.js';
import { fetchPage } from '../../src/fetch-page.js';
import { findDuplicateTitles, runSeoRules } from '../../src/seo/index.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';

let target: Target;
beforeAll(async () => void (target = await startStaticServer('test/fixtures/site')));
afterAll(() => target.close());

const config = () => resolveConfig({ 'static-dir': 'x' });
async function audit(path: string) {
  const p = await fetchPage(target.baseUrl, path);
  return runSeoRules({
    $: cheerio.load(p.html),
    url: p.finalUrl,
    headers: p.headers,
    config: config(),
  });
}
const brief = (fs: { rule: string; severity: string }[]) =>
  fs.map((f) => `${f.severity}:${f.rule}`);

describe('fixtures', () => {
  it.each(['/', '/about/'])('%s has no findings', async (p) => expect(await audit(p)).toEqual([]));

  it('/bad/ has exactly the expected findings', async () =>
    expect(brief(await audit('/bad/'))).toEqual([
      'error:title',
      'error:meta-description',
      'error:h1',
      'warning:canonical',
    ]));

  it('/noindex/ is flagged noindex only', async () =>
    expect(brief(await audit('/noindex/'))).toEqual(['warning:indexability']));

  it('/long-title/ has title and description length warnings', async () =>
    expect(await audit('/long-title/')).toEqual([
      { rule: 'title', severity: 'warning', message: '82 characters (recommended ≤ 60)' },
      {
        rule: 'meta-description',
        severity: 'warning',
        message: '27 characters (recommended ≥ 50)',
      },
    ]));

  it('fixtures have no duplicate titles', async () => {
    const pages = await Promise.all(
      ['/', '/about/', '/noindex/', '/long-title/'].map(async (path) => ({
        path,
        $: cheerio.load((await fetchPage(target.baseUrl, path)).html),
      })),
    );
    expect(findDuplicateTitles(pages, config()).size).toBe(0);
  });
});
