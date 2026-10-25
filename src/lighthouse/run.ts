import * as core from '@actions/core';
import type { Config } from '../config.js';
import { loadLighthouse } from './install.js';
import { medianScores, type Scores } from './scores.js';

export interface LighthouseSession {
  /** Median scores (0–100) for `url`, or undefined if the audit failed. */
  audit(url: string): Promise<Scores | undefined>;
  close(): Promise<void>;
}

type LhConfig = Pick<Config['lighthouse'], 'preset' | 'runs'>;

/**
 * Launch headless Chrome once; audit pages sequentially (stable perf numbers).
 * Returns undefined (with a warning) when Chrome or Lighthouse cannot be started.
 */
export async function startLighthouse(cfg: LhConfig): Promise<LighthouseSession | undefined> {
  let chrome: import('chrome-launcher').LaunchedChrome;
  let lighthouse: Awaited<ReturnType<typeof loadLighthouse>>['lighthouse'];
  try {
    const mods = await loadLighthouse();
    lighthouse = mods.lighthouse;
    chrome = await mods.launcher.launch({
      chromeFlags: ['--no-sandbox', '--headless=new', '--disable-gpu'],
    });
  } catch (e) {
    core.warning(`Lighthouse disabled: Chrome could not be started (${(e as Error).message})`);
    return undefined;
  }

  return {
    async audit(url) {
      const raw: Scores[] = [];
      for (let i = 0; i < cfg.runs; i++) {
        try {
          const result = await lighthouse(
            url,
            {
              port: chrome.port,
              output: 'json',
              logLevel: 'error',
              onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            },
            cfg.preset === 'desktop'
              ? {
                  extends: 'lighthouse:default',
                  settings: { formFactor: 'desktop', screenEmulation: { disabled: true } },
                }
              : undefined,
          );
          const c = result?.lhr.categories;
          if (!c) continue;
          raw.push({
            performance: c.performance?.score ?? 0,
            accessibility: c.accessibility?.score ?? 0,
            bestPractices: c['best-practices']?.score ?? 0,
            seo: c.seo?.score ?? 0,
          });
        } catch (e) {
          core.warning(`Lighthouse run failed for ${url}: ${(e as Error).message}`);
        }
      }
      return raw.length ? medianScores(raw) : undefined;
    },
    async close() {
      await chrome.kill();
    },
  };
}
