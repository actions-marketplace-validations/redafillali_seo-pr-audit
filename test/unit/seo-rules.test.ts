import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { resolveConfig, type Config } from '../../src/config.js';
import { findDuplicateTitles, runSeoRules } from '../../src/seo/index.js';

const URL_ = 'https://example.com/page/';
const cfg = (file = ''): Config => resolveConfig({ 'base-url': 'https://example.com' }, file);

const GOOD = `<!doctype html><html lang="en"><head>
<title>A perfectly fine title</title>
<meta name="description" content="${'d'.repeat(80)}">
<link rel="canonical" href="https://example.com/page/">
</head><body><h1>Hello</h1></body></html>`;

const run = (html: string, opts: { headers?: Record<string, string>; config?: Config } = {}) =>
  runSeoRules({
    $: cheerio.load(html),
    url: URL_,
    headers: opts.headers ?? {},
    config: opts.config ?? cfg(),
  });
const only = (rule: string, html: string, opts = {}) =>
  run(html, opts).filter((f) => f.rule === rule);
const swap = (from: RegExp | string, to: string) => GOOD.replace(from, to);

describe('perfect page', () => {
  it('has no findings', () => expect(run(GOOD)).toEqual([]));
});

describe('title', () => {
  it('error: missing', () =>
    expect(only('title', swap(/<title>.*<\/title>/, ''))).toMatchObject([
      { severity: 'error', message: 'missing <title>' },
    ]));
  it('error: empty', () =>
    expect(only('title', swap(/<title>.*<\/title>/, '<title>  </title>'))).toMatchObject([
      { severity: 'error', message: 'empty <title>' },
    ]));
  it('warning: too long', () =>
    expect(only('title', swap('A perfectly fine title', 'x'.repeat(72)))).toEqual([
      { rule: 'title', severity: 'warning', message: '72 characters (recommended ≤ 60)' },
    ]));
  it('warning: too short', () =>
    expect(only('title', swap('A perfectly fine title', 'Hi'))[0]).toMatchObject({
      severity: 'warning',
    }));
  it('honours min/max', () =>
    expect(only('title', GOOD, { config: cfg('rules: { title: { min: 30 } }') })).toHaveLength(1));
});

describe('meta-description', () => {
  it('error: missing', () =>
    expect(only('meta-description', swap(/<meta name="description".*>/, ''))[0]).toMatchObject({
      severity: 'error',
    }));
  it('error: empty', () =>
    expect(only('meta-description', swap(/content="d+"/, 'content=""'))[0]).toMatchObject({
      severity: 'error',
    }));
  it('warning: too short', () =>
    expect(only('meta-description', swap(/content="d+"/, 'content="short"'))[0]).toMatchObject({
      severity: 'warning',
      message: '5 characters (recommended ≥ 50)',
    }));
  it('warning: too long', () =>
    expect(
      only('meta-description', swap(/content="d+"/, `content="${'d'.repeat(200)}"`))[0],
    ).toMatchObject({
      severity: 'warning',
    }));
  it('warning: several tags', () =>
    expect(
      only(
        'meta-description',
        swap('</head>', `<meta name="description" content="${'e'.repeat(80)}"></head>`),
      )[0],
    ).toMatchObject({ severity: 'warning', message: expect.stringContaining('2 <meta') }));
});

describe('h1', () => {
  it('error: none', () =>
    expect(only('h1', swap('<h1>Hello</h1>', ''))[0]).toMatchObject({ severity: 'error' }));
  it('error: two', () =>
    expect(only('h1', swap('<h1>Hello</h1>', '<h1>A</h1><h1>B</h1>'))[0]).toMatchObject({
      severity: 'error',
    }));
  it('error: empty', () =>
    expect(only('h1', swap('<h1>Hello</h1>', '<h1> </h1>'))[0]).toMatchObject({
      severity: 'error',
    }));
});

describe('canonical', () => {
  const link = (href: string) => swap(/<link rel="canonical".*>/, href);
  it('warning: absent', () =>
    expect(only('canonical', link(''))[0]).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('missing'),
    }));
  it('warning: relative', () =>
    expect(only('canonical', link('<link rel="canonical" href="/page/">'))[0]).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('relative'),
    }));
  it('warning: other domain', () =>
    expect(
      only('canonical', link('<link rel="canonical" href="https://other.com/">'))[0],
    ).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('other.com'),
    }));
  it('error: two tags', () =>
    expect(
      only(
        'canonical',
        swap('</head>', '<link rel="canonical" href="https://example.com/x"></head>'),
      )[0],
    ).toMatchObject({ severity: 'error' }));
  it('error: invalid URL', () =>
    expect(only('canonical', link('<link rel="canonical" href="http://">'))[0]).toMatchObject({
      severity: 'error',
    }));
  it('error: empty href', () =>
    expect(only('canonical', link('<link rel="canonical" href="">'))[0]).toMatchObject({
      severity: 'error',
    }));
});

describe('indexability', () => {
  it('warning: meta noindex', () =>
    expect(
      only('indexability', swap('</head>', '<meta name="robots" content="index, NoIndex"></head>')),
    ).toHaveLength(1));
  it('warning: X-Robots-Tag', () =>
    expect(
      only('indexability', GOOD, { headers: { 'x-robots-tag': 'noindex, nofollow' } })[0],
    ).toMatchObject({
      severity: 'warning',
    }));
  it('ok: index,follow', () =>
    expect(
      only('indexability', swap('</head>', '<meta name="robots" content="index,follow"></head>')),
    ).toEqual([]));
});

describe('lang', () => {
  it('warning: missing', () =>
    expect(only('lang', swap('<html lang="en">', '<html>'))[0]).toMatchObject({
      severity: 'warning',
    }));
  it('warning: empty', () =>
    expect(only('lang', swap('lang="en"', 'lang=""'))[0]).toMatchObject({ severity: 'warning' }));
});

describe('configurable severity', () => {
  const noLang = swap('<html lang="en">', '<html>');
  it('off disables', () =>
    expect(run(noLang, { config: cfg('rules: { lang: off }') })).toEqual([]));
  it('can promote to error', () =>
    expect(run(noLang, { config: cfg('rules: { lang: error }') })[0]).toMatchObject({
      severity: 'error',
    }));
  it('can demote to warning', () =>
    expect(
      run(swap('<h1>Hello</h1>', ''), { config: cfg('rules: { h1: warning }') })[0],
    ).toMatchObject({
      severity: 'warning',
    }));
});

describe('duplicate titles', () => {
  const page = (path: string, t: string) => ({ path, $: cheerio.load(`<title>${t}</title>`) });
  it('flags every page sharing a title', () => {
    const r = findDuplicateTitles(
      [page('/a', 'Same'), page('/b', 'Same'), page('/c', 'Other')],
      cfg(),
    );
    expect([...r.keys()]).toEqual(['/a', '/b']);
    expect(r.get('/a')![0]).toMatchObject({
      rule: 'title',
      severity: 'warning',
      details: ['also used by /b'],
    });
  });
  it('ignores unique and empty titles', () =>
    expect(findDuplicateTitles([page('/a', ''), page('/b', ''), page('/c', 'x')], cfg()).size).toBe(
      0,
    ));
  it('respects off', () =>
    expect(
      findDuplicateTitles([page('/a', 'S'), page('/b', 'S')], cfg('rules: { title: off }')).size,
    ).toBe(0));
});
