import { afterAll, beforeAll, expect, it } from 'vitest';
import { fetchPage } from '../../src/fetch-page.js';
import { checkPageLinks, createLinkChecker } from '../../src/links/check.js';
import { extractLinks, filterLinks } from '../../src/links/extract.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';

let target: Target;
beforeAll(async () => void (target = await startStaticServer('test/fixtures/site')));
afterAll(() => target.close());

async function linkFindingsFor(path: string) {
  const page = await fetchPage(target.baseUrl, path);
  const urls = filterLinks(extractLinks(page.html, page.finalUrl), {
    mode: 'internal',
    ignore: [],
    origin: new URL(target.baseUrl).origin,
  });
  return checkPageLinks(createLinkChecker({ timeoutMs: 2000, concurrency: 4 }), urls);
}

it('/bad/ reports /missing as broken', async () =>
  expect(await linkFindingsFor('/bad/')).toEqual([
    {
      rule: 'broken-links',
      severity: 'error',
      message: '1 broken link',
      details: [`${target.baseUrl}/missing → 404`],
    },
  ]));

it('/ and /about/ have no broken links', async () => {
  expect(await linkFindingsFor('/')).toEqual([]);
  expect(await linkFindingsFor('/about/')).toEqual([]);
});
