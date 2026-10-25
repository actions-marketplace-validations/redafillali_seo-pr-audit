import type { Config } from '../config.js';

export interface Scores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Per-category median over runs, scaled ×100 and rounded. `runs` hold raw 0–1 scores. */
export function medianScores(runs: Scores[]): Scores {
  const pick = (k: keyof Scores) => Math.round(median(runs.map((r) => r[k])) * 100);
  return {
    performance: pick('performance'),
    accessibility: pick('accessibility'),
    bestPractices: pick('bestPractices'),
    seo: pick('seo'),
  };
}

const LABELS: Record<keyof Scores, string> = {
  performance: 'performance',
  accessibility: 'accessibility',
  bestPractices: 'best-practices',
  seo: 'seo',
};

/** "/blog/: performance 71 < 80" for each category under its threshold (threshold 0 = report only). */
export function thresholdFailures(
  path: string,
  scores: Scores,
  thresholds: Config['lighthouse']['thresholds'],
): string[] {
  return (Object.keys(LABELS) as (keyof Scores)[])
    .filter((k) => thresholds[k] > 0 && scores[k] < thresholds[k])
    .map((k) => `${path}: ${LABELS[k]} ${scores[k]} < ${thresholds[k]}`);
}
