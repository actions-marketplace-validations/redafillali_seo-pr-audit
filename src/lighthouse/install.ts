import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

/** Keep in sync with package.json (checked by test/unit/lighthouse.test.ts). */
export const LIGHTHOUSE_VERSION = '13.5.0';
export const CHROME_LAUNCHER_VERSION = '1.2.2';

type LighthouseFn = typeof import('lighthouse').default;
type ChromeLauncher = typeof import('chrome-launcher');

export interface LighthouseModules {
  lighthouse: LighthouseFn;
  launcher: ChromeLauncher;
}

// `webpackIgnore` keeps ncc from bundling these: Lighthouse scans and dynamically imports its own
// directories at runtime, so it only works from a real node_modules (see docs/DECISIONS.md).
const load = (file: string) => import(/* webpackIgnore: true */ pathToFileURL(file).href);

/** Install lighthouse + chrome-launcher (pinned) into a temp dir on first use, then import them. */
export async function loadLighthouse(
  dir = join(process.env.RUNNER_TEMP || tmpdir(), 'seo-pr-audit-lighthouse'),
): Promise<LighthouseModules> {
  const lhEntry = join(dir, 'node_modules/lighthouse/core/index.js');
  const clEntry = join(dir, 'node_modules/chrome-launcher/dist/index.js');
  if (!existsSync(lhEntry) || !existsSync(clEntry)) {
    core.info(`Installing lighthouse@${LIGHTHOUSE_VERSION} (one-time, ~20s)…`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), '{"private":true}');
    await exec.exec(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--no-save',
        '--loglevel=error',
        `lighthouse@${LIGHTHOUSE_VERSION}`,
        `chrome-launcher@${CHROME_LAUNCHER_VERSION}`,
      ],
      { cwd: dir, silent: true },
    );
  }
  return { lighthouse: (await load(lhEntry)).default, launcher: await load(clEntry) };
}
