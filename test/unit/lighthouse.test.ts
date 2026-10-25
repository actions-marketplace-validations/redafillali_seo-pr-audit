import { describe, expect, it } from 'vitest';
import { median, medianScores, thresholdFailures } from '../../src/lighthouse/scores.js';

const run = (p: number, a = 1, b = 1, s = 1) => ({
  performance: p,
  accessibility: a,
  bestPractices: b,
  seo: s,
});

describe('median', () => {
  it('odd / even / single', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });
});

describe('medianScores', () => {
  it('scales ×100, rounds, takes median per category', () => {
    expect(medianScores([run(0.5), run(0.714), run(0.9, 0.5)])).toEqual({
      performance: 71,
      accessibility: 100,
      bestPractices: 100,
      seo: 100,
    });
  });
  it('rounds half up for even run counts', () => {
    expect(medianScores([run(0.94), run(0.95)]).performance).toBe(95);
  });
});

describe('thresholdFailures', () => {
  const th = { performance: 80, accessibility: 0, bestPractices: 0, seo: 90 };
  it('reports categories under their threshold', () =>
    expect(
      thresholdFailures(
        '/blog/',
        { performance: 71, accessibility: 10, bestPractices: 5, seo: 83 },
        th,
      ),
    ).toEqual(['/blog/: performance 71 < 80', '/blog/: seo 83 < 90']));
  it('passes at exactly the threshold and ignores 0 thresholds', () =>
    expect(
      thresholdFailures('/', { performance: 80, accessibility: 0, bestPractices: 0, seo: 90 }, th),
    ).toEqual([]));
});

describe('pinned versions', () => {
  it('match package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { CHROME_LAUNCHER_VERSION, LIGHTHOUSE_VERSION } =
      await import('../../src/lighthouse/install.js');
    const deps = JSON.parse(readFileSync('package.json', 'utf8')).dependencies;
    expect(deps.lighthouse.replace(/^\D+/, '')).toBe(LIGHTHOUSE_VERSION);
    expect(deps['chrome-launcher'].replace(/^\D+/, '')).toBe(CHROME_LAUNCHER_VERSION);
  });
});
