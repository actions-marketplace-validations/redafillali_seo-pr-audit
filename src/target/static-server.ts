import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import sirv from 'sirv';

export interface Target {
  baseUrl: string;
  close(): Promise<void>;
}

/** Serve `dir` on a free port bound to 127.0.0.1 (`/dir/` serves `dir/index.html`). */
export async function startStaticServer(dir: string): Promise<Target> {
  const serve = sirv(resolve(dir), { dev: true });
  const server = createServer((req, res) => serve(req, res));
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      }),
  };
}
