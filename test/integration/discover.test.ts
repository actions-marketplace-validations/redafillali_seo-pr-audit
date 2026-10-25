import { afterAll, beforeAll, expect, it } from 'vitest';
import { expandPaths } from '../../src/discover.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';

let t: Target;
beforeAll(async () => void (t = await startStaticServer('test/fixtures/crawl')));
afterAll(() => t.close());

it('plain paths are untouched', async () =>
  expect(await expandPaths(t.baseUrl, ['/x', '/docs/'], 50)).toEqual(['/x', '/docs/']));

it('/docs/* follows links under the prefix, nested and relative, not outside', async () =>
  expect((await expandPaths(t.baseUrl, ['/docs/*'], 50)).sort()).toEqual([
    '/docs/',
    '/docs/a/',
    '/docs/b/',
    '/docs/deep/',
  ]));

it('/* crawls the whole site', async () =>
  expect((await expandPaths(t.baseUrl, ['/*'], 50)).sort()).toEqual([
    '/',
    '/docs/',
    '/docs/a/',
    '/docs/b/',
    '/docs/deep/',
    '/other/',
  ]));

it('max-pages caps the result', async () =>
  expect(await expandPaths(t.baseUrl, ['/*'], 3)).toHaveLength(3));

it('a missing start page is kept so the audit reports it', async () =>
  expect(await expandPaths(t.baseUrl, ['/nope/*'], 50)).toEqual(['/nope/']));
