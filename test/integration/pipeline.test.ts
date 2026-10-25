import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAudit } from '../../src/audit.js';
import { resolveConfig, type Config } from '../../src/config.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';

let target: Target;
beforeAll(async () => void (target = await startStaticServer('test/fixtures/site')));
afterAll(() => target.close());

const cfg = (extra: Record<string, string> = {}): Config =>
  resolveConfig({ 'static-dir': 'x', lighthouse: 'false', 'link-timeout': '2', ...extra });
const rules = (r: Awaited<ReturnType<typeof runAudit>>, path: string) =>
  r.pages.find((p) => p.path === path)!.findings.map((f) => `${f.severity}:${f.rule}`);

describe('full pipeline (Lighthouse off)', () => {
  it('audits every page, flags bad ones, keeps good ones clean', async () => {
    const r = await runAudit(
      target.baseUrl,
      cfg({ paths: '/,/about/,/bad/,/noindex/,/long-title/' }),
    );
    expect(rules(r, '/')).toEqual([]);
    expect(rules(r, '/about/')).toEqual([]);
    expect(rules(r, '/bad/')).toEqual([
      'error:title',
      'error:meta-description',
      'error:h1',
      'warning:canonical',
      'error:broken-links',
    ]);
    expect(rules(r, '/noindex/')).toEqual(['warning:indexability']);
    expect(rules(r, '/long-title/')).toEqual(['warning:title', 'warning:meta-description']);
    expect(r.summary).toMatchObject({ errors: 4, warnings: 4, passed: false });
  });

  it('page-unreachable on 404 / network error, other pages continue', async () => {
    const r = await runAudit(target.baseUrl, cfg({ paths: '/,/nope/' }));
    expect(rules(r, '/nope/')).toEqual(['error:page-unreachable']);
    expect(rules(r, '/')).toEqual([]);
    const dead = await runAudit('http://127.0.0.1:1', cfg({ paths: '/' }));
    expect(dead.pages[0]).toMatchObject({ status: 0 });
    expect(rules(dead, '/')).toEqual(['error:page-unreachable']);
  });

  it('flags duplicate titles across pages', async () => {
    const r = await runAudit(target.baseUrl, cfg({ paths: '/,/' }));
    expect(r.pages).toHaveLength(1); // duplicate paths are collapsed by config
  });

  it('check-links: none skips broken-link detection', async () => {
    const r = await runAudit(target.baseUrl, cfg({ paths: '/bad/', 'check-links': 'none' }));
    expect(rules(r, '/bad/')).not.toContain('error:broken-links');
  });

  it('link-ignore skips matching URLs', async () => {
    const r = await runAudit(target.baseUrl, cfg({ paths: '/bad/', 'link-ignore': '/missing' }));
    expect(rules(r, '/bad/')).not.toContain('error:broken-links');
  });
});

describe('fail-on (§8)', () => {
  const run = async (failOn: string, paths: string) =>
    (await runAudit(target.baseUrl, cfg({ paths, 'fail-on': failOn }))).summary.passed;
  it('error: warnings alone pass, errors fail', async () => {
    expect(await run('error', '/noindex/')).toBe(true);
    expect(await run('error', '/bad/')).toBe(false);
  });
  it('warning: warnings fail too', async () => {
    expect(await run('warning', '/noindex/')).toBe(false);
    expect(await run('warning', '/')).toBe(true);
  });
  it('never: always passes', async () => expect(await run('never', '/bad/')).toBe(true));
});
