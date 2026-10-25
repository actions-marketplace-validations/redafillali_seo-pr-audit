const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `url` until it answers with a status < 500, or throw after `timeoutSec`. */
export async function waitForUrl(
  url: string,
  timeoutSec: number,
  { intervalMs = 500 }: { intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  let last: string;
  do {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(5000, intervalMs * 4)) });
      await res.body?.cancel();
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(`target not ready after ${timeoutSec}s (${url}: ${last})`);
}
