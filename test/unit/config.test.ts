import { describe, expect, it } from 'vitest';
import { ConfigError, INPUT_NAMES, resolveConfig } from '../../src/config.js';

const base = { 'static-dir': './dist' };

describe('resolveConfig', () => {
  it('applies README defaults', () => {
    const c = resolveConfig(base);
    expect(c).toMatchObject({
      staticDir: './dist',
      waitTimeout: 60,
      paths: ['/'],
      failOn: 'error',
      comment: false,
      commentMode: 'update',
      links: { mode: 'internal', timeout: 10, concurrency: 8, ignore: [] },
      lighthouse: {
        enabled: true,
        preset: 'mobile',
        runs: 1,
        thresholds: { performance: 0, accessibility: 0, bestPractices: 0, seo: 90 },
      },
    });
  });

  it('parses and normalizes comma/newline paths', () => {
    expect(resolveConfig({ ...base, paths: 'about, /blog/\ncontact\n/blog/' }).paths).toEqual([
      '/about',
      '/blog/',
      '/contact',
    ]);
  });

  it('file overrides inputs', () => {
    const c = resolveConfig(
      { ...base, paths: '/', 'min-seo': '90', 'link-ignore': 'a' },
      `paths: [/x, /y]
lighthouse: { preset: desktop, runs: 3, thresholds: { performance: 80, seo: 95 } }
rules:
  title: { min: 15, max: 60 }
  canonical: error
  lang: off
links: { mode: all, ignore: ["^https://twitter\\\\.com"] }
`,
    );
    expect(c.paths).toEqual(['/x', '/y']);
    expect(c.lighthouse).toMatchObject({ preset: 'desktop', runs: 3 });
    expect(c.lighthouse.thresholds).toMatchObject({ performance: 80, seo: 95, accessibility: 0 });
    expect(c.rules.title).toEqual({ min: 15, max: 60 });
    expect(c.rules.canonical).toEqual({ severity: 'error' });
    expect(c.rules.lang).toEqual({ severity: 'off' });
    expect(c.links.mode).toBe('all');
    expect(c.links.ignore[0]!.test('https://twitter.com/x')).toBe(true);
  });

  it('rejects target keys in the config file (command-injection guard)', () => {
    for (const k of ['start-command: x', 'base-url: http://x', 'static-dir: d'])
      expect(() => resolveConfig(base, k)).toThrow(/Invalid config file/);
  });

  it('treats an empty config file as no overrides', () => {
    expect(resolveConfig(base, '').paths).toEqual(['/']);
    expect(resolveConfig(base, '# nothing\n').paths).toEqual(['/']);
  });

  it.each([
    [{}, /One of `static-dir` or `base-url`/],
    [{ 'static-dir': 'd', 'base-url': 'http://x' }, /not both/],
    [{ 'static-dir': 'd', 'start-command': 'npm start' }, /requires `base-url`/],
    [{ 'base-url': 'ftp://x' }, /Invalid base-url/],
    [{ ...base, 'fail-on': 'boom' }, /fail-on/],
    [{ ...base, 'min-seo': '101' }, /min-seo/],
    [{ ...base, 'wait-timeout': 'abc' }, /wait-timeout/],
    [{ ...base, 'link-ignore': '(' }, /Invalid link-ignore regex/],
  ])('rejects invalid inputs %#', (inputs, msg) => {
    expect(() => resolveConfig(inputs as Record<string, string>)).toThrow(ConfigError);
    expect(() => resolveConfig(inputs as Record<string, string>)).toThrow(msg);
  });

  it('rejects unknown keys and bad values in the file with readable paths', () => {
    expect(() => resolveConfig(base, 'pathz: [/]')).toThrow(/Invalid config file/);
    expect(() => resolveConfig(base, 'rules: { title: { min: -1 } }')).toThrow(/rules\.title/);
    expect(() => resolveConfig(base, 'a: [')).toThrow(/YAML/);
  });

  it('accepts base-url with start-command', () => {
    const c = resolveConfig({ 'base-url': 'http://127.0.0.1:8000', 'start-command': 'x' });
    expect(c.startCommand).toBe('x');
  });

  it('covers every action.yml input', async () => {
    const { readFileSync } = await import('node:fs');
    const yml = readFileSync('action.yml', 'utf8');
    const block = yml.split('inputs:')[1]!.split('outputs:')[0]!;
    const names = [...block.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);
    expect([...INPUT_NAMES].sort()).toEqual(names.sort());
  });
});
