import { afterAll, beforeAll, expect, it } from 'vitest';
import { runAudit } from '../../src/audit.js';
import { resolveConfig } from '../../src/config.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';

let target: Target;
beforeAll(async () => void (target = await startStaticServer('test/fixtures')));
afterAll(() => target.close());

const canon = async (path: string, extra: Record<string, string> = {}) => {
  const cfg = resolveConfig({ 'static-dir': 'x', lighthouse: 'false', paths: path, ...extra });
  const r = await runAudit(target.baseUrl, cfg);
  return r.pages[0]!.findings.filter(
    (f) => f.rule === 'canonical' && f.message.startsWith('canonical target'),
  );
};

it('self-canonical is fine', async () => expect(await canon('/canon/self/')).toEqual([]));
it('canonical to another existing indexable page is fine', async () =>
  expect(await canon('/canon/ok/')).toEqual([]));
it('canonical to a 404 page is an error', async () =>
  expect(await canon('/canon/gone/')).toMatchObject([
    { severity: 'error', message: expect.stringContaining('HTTP 404') },
  ]));
it('canonical to a noindex page is an error', async () =>
  expect(await canon('/canon/hidden/')).toMatchObject([
    { severity: 'error', message: expect.stringContaining('noindex') },
  ]));
