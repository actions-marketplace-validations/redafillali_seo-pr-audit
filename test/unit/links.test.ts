import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkPageLinks,
  createLinkChecker,
  linkFindings,
  USER_AGENT,
} from '../../src/links/check.js';
import { extractLinks, filterLinks } from '../../src/links/extract.js';

describe('extractLinks', () => {
  const html = `<base href="/docs/"><a href="a">1</a><a href="a#frag">dup</a><a href="/b?x=1#y">2</a>
  <a href="https://ext.com/z">3</a><a href="mailto:x@y.z">m</a><a href="tel:1">t</a>
  <a href="javascript:void(0)">j</a><a href="#top">top</a><a href="ftp://f/x">f</a><a>none</a>`;
  it('resolves, strips fragments, dedupes and skips non-http', () =>
    expect(extractLinks(html, 'http://s.test/page/')).toEqual([
      'http://s.test/docs/a',
      'http://s.test/b?x=1',
      'https://ext.com/z',
    ]));
  it('uses finalUrl without <base>', () =>
    expect(extractLinks('<a href="x">x</a>', 'http://s.test/dir/')).toEqual([
      'http://s.test/dir/x',
    ]));
});

describe('filterLinks', () => {
  const urls = ['http://s.test/a', 'http://s.test/admin/x', 'https://ext.com/z'];
  const o = { origin: 'http://s.test', ignore: [/\/admin\//] };
  it('internal', () =>
    expect(filterLinks(urls, { ...o, mode: 'internal' })).toEqual(['http://s.test/a']));
  it('all', () =>
    expect(filterLinks(urls, { ...o, mode: 'all' })).toEqual([
      'http://s.test/a',
      'https://ext.com/z',
    ]));
  it('none', () => expect(filterLinks(urls, { ...o, mode: 'none' })).toEqual([]));
});

describe('link checker (local server)', () => {
  let server: Server;
  let base: string;
  const hits: string[] = [];
  let ua = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      const u = req.url!;
      hits.push(`${req.method} ${u}`);
      ua = req.headers['user-agent'] ?? '';
      const hop = /^\/r(\d)$/.exec(u);
      if (u === '/ok') res.end('ok');
      else if (u === '/301') res.writeHead(301, { location: '/ok' }).end();
      else if (u === '/r9') res.end();
      else if (hop) res.writeHead(301, { location: `/r${Number(hop[1]) + 1}` }).end();
      else if (u === '/404') res.writeHead(404).end();
      else if (u === '/500') res.writeHead(500).end();
      else if (u === '/slow')
        return; // never answers
      else if (u === '/nohead') res.writeHead(req.method === 'HEAD' ? 405 : 200).end();
      else if (u === '/loop') res.writeHead(302, { location: '/loop' }).end();
      else res.writeHead(404).end();
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });
  const checker = () => createLinkChecker({ timeoutMs: 300, concurrency: 4 });

  it('200 / 301 / 404 / 500 / timeout / 405-on-HEAD', async () => {
    const c = checker();
    expect(await c.check(`${base}/ok`)).toMatchObject({ status: 200, redirects: 0 });
    expect(await c.check(`${base}/301`)).toMatchObject({ status: 200, redirects: 1 });
    expect(await c.check(`${base}/404`)).toMatchObject({ status: 404 });
    expect(await c.check(`${base}/500`)).toMatchObject({ status: 500 });
    expect(await c.check(`${base}/slow`)).toMatchObject({ error: 'timeout' });
    expect(await c.check(`${base}/nohead`)).toMatchObject({ status: 200 });
    expect(hits).toContain('HEAD /nohead');
    expect(hits).toContain('GET /nohead');
    expect(ua).toBe(USER_AGENT);
  });

  it('reports network errors and redirect loops', async () => {
    const c = checker();
    expect((await c.check('http://127.0.0.1:1/x')).error).toBeTruthy();
    expect(await c.check(`${base}/loop`)).toMatchObject({ error: 'too many redirects' });
  });

  it('checks a shared link only once', async () => {
    hits.length = 0;
    const c = checker();
    await Promise.all([c.check(`${base}/ok`), c.check(`${base}/ok`)]);
    await c.check(`${base}/ok`);
    expect(hits.filter((h) => h === 'HEAD /ok')).toHaveLength(1);
  });

  it('builds findings: broken (error) and chained redirects (warning)', async () => {
    const f = await checkPageLinks(checker(), [`${base}/ok`, `${base}/404`, `${base}/r6`]);
    expect(f).toEqual([
      {
        rule: 'broken-links',
        severity: 'error',
        message: '1 broken link',
        details: [`${base}/404 → 404`],
      },
      expect.objectContaining({ severity: 'warning', details: [`${base}/r6 → 3 redirects`] }),
    ]);
  });
});

describe('linkFindings', () => {
  it('no findings when everything is fine', () =>
    expect(linkFindings([{ url: 'u', status: 200, redirects: 1 }])).toEqual([]));
  it('lists at most 20 then "and N more"', () => {
    const rs = Array.from({ length: 23 }, (_, i) => ({ url: `/p${i}`, status: 404, redirects: 0 }));
    const [f] = linkFindings(rs);
    expect(f!.details).toHaveLength(21);
    expect(f!.details![20]).toBe('and 3 more');
    expect(f!.message).toBe('23 broken links');
  });
});
