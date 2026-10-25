import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchPage } from '../../src/fetch-page.js';
import { startCommand } from '../../src/target/command-server.js';
import { startStaticServer, type Target } from '../../src/target/static-server.js';
import { waitForUrl } from '../../src/target/wait-for-url.js';

let target: Target;
beforeAll(async () => {
  target = await startStaticServer('test/fixtures/site');
});
afterAll(async () => {
  await target.close();
});

describe('static server + fetchPage', () => {
  it.each([
    ['/', 200],
    ['/about/', 200],
    ['/about', 200],
    ['/bad/', 200],
    ['/noindex/', 200],
    ['/long-title/', 200],
    ['/missing', 404],
  ])('GET %s → %i', async (path, status) => {
    const page = await fetchPage(target.baseUrl, path);
    expect(page.status).toBe(status);
    expect(page.url).toBe(new URL(path, target.baseUrl).toString());
  });

  it('returns html and lower-cased headers', async () => {
    const page = await fetchPage(target.baseUrl, '/');
    expect(page.html).toContain('<h1>Welcome</h1>');
    expect(page.headers['content-type']).toContain('text/html');
  });

  it('refuses paths that leave the base URL', async () => {
    await expect(fetchPage(target.baseUrl, '//evil.example/x')).rejects.toThrow(/outside base-url/);
  });

  it('times out on a hanging server', async () => {
    const hang = createServer(() => {});
    await new Promise<void>((ok) => hang.listen(0, '127.0.0.1', ok));
    const { port } = hang.address() as AddressInfo;
    await expect(fetchPage(`http://127.0.0.1:${port}`, '/', 200)).rejects.toThrow();
    hang.closeAllConnections();
    hang.close();
  });
});

describe('waitForUrl', () => {
  it('resolves when the target answers', async () => {
    await expect(waitForUrl(target.baseUrl, 5, { intervalMs: 50 })).resolves.toBeUndefined();
  });

  it('rejects after the timeout', async () => {
    await expect(waitForUrl('http://127.0.0.1:1/', 0.3, { intervalMs: 50 })).rejects.toThrow(
      /target not ready after 0.3s/,
    );
  });
});

describe('command server', () => {
  it('starts a command, waits for it, then kills the process group', async () => {
    const probe = createServer();
    await new Promise<void>((ok) => probe.listen(0, '127.0.0.1', ok));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((ok) => probe.close(() => ok()));

    const script = `require('http').createServer((q,r)=>r.end('up')).listen(${port},'127.0.0.1');console.log('listening')`;
    const t = startCommand(`node -e "${script}"`, `http://127.0.0.1:${port}`);
    await waitForUrl(t.baseUrl, 10, { intervalMs: 100 });
    expect(t.logs()).toContain('listening');
    await t.close();
    await expect(fetch(t.baseUrl, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
  });
});
