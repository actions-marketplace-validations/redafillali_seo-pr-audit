import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  commentTarget,
  postComment,
  pullRequestNumber,
  type CommentApi,
} from '../../src/github/comment.js';
import { buildReport, summarize } from '../../src/report/aggregate.js';
import { COMMENT_MARKER, esc, renderMarkdown, runUrl } from '../../src/report/markdown.js';
import type { PageResult } from '../../src/report/types.js';
import { writeJsonReport } from '../../src/report/write.js';

const NOW = new Date('2026-01-02T03:04:05Z');
const LINK = 'https://github.com/o/r/actions/runs/42';
const lh = (performance: number, accessibility: number, bestPractices: number, seo: number) => ({
  performance,
  accessibility,
  bestPractices,
  seo,
});
const okPage: PageResult = {
  path: '/',
  url: 'http://x/',
  status: 200,
  lighthouse: lh(94, 98, 100, 100),
  findings: [],
};
const blog: PageResult = {
  path: '/blog/',
  url: 'http://x/blog/',
  status: 200,
  lighthouse: lh(71, 92, 96, 83),
  findings: [
    { rule: 'title', severity: 'warning', message: '72 characters (recommended ≤ 60)' },
    { rule: 'meta-description', severity: 'error', message: 'missing <meta name="description">' },
    {
      rule: 'broken-links',
      severity: 'error',
      message: '1 broken link',
      details: ['http://x/blog/old-post → 404'],
    },
  ],
};

describe('summarize', () => {
  it('counts findings and threshold failures; passed follows fail-on', () => {
    const th = ['/blog/: seo 83 < 90'];
    expect(summarize([okPage, blog], th, 'error')).toEqual({
      errors: 3,
      warnings: 1,
      passed: false,
      thresholdFailures: th,
    });
    expect(summarize([okPage], [], 'error').passed).toBe(true);
    expect(
      summarize([{ ...okPage, findings: blog.findings.slice(0, 1) }], [], 'error').passed,
    ).toBe(true);
    expect(
      summarize([{ ...okPage, findings: blog.findings.slice(0, 1) }], [], 'warning').passed,
    ).toBe(false);
    expect(summarize([blog], th, 'never').passed).toBe(true);
  });
});

describe('markdown snapshots', () => {
  const r = (pages: PageResult[], th: string[] = []) =>
    buildReport('http://x', pages, th, 'error', NOW);
  it('ok report', () => expect(renderMarkdown(r([okPage]), { link: LINK })).toMatchSnapshot());
  it('report with errors', () =>
    expect(
      renderMarkdown(r([okPage, blog], ['/blog/: seo 83 < 90']), { link: LINK }),
    ).toMatchSnapshot());
  it('without lighthouse', () =>
    expect(
      renderMarkdown(r([{ ...blog, lighthouse: undefined }]), { link: LINK }),
    ).toMatchSnapshot());
  it('truncated report', () => {
    const many: PageResult[] = Array.from({ length: 40 }, (_, i) => ({
      ...blog,
      path: `/p${i}/`,
      findings: [
        {
          rule: 'broken-links',
          severity: 'error',
          message: 'x',
          details: Array.from({ length: 21 }, (_, j) => `http://x/${i}/${j} → 404`),
        },
      ],
    }));
    const md = renderMarkdown(r(many), { link: LINK, maxLength: 4000 });
    expect(md.length).toBeLessThanOrEqual(4000);
    expect(md).toContain('truncated');
    expect(md).toContain(COMMENT_MARKER);
    expect(md).toMatchSnapshot();
  });
  it('default limit is under GitHub’s 65 536', () => {
    const many: PageResult[] = Array.from({ length: 2000 }, (_, i) => ({
      ...blog,
      path: `/p${i}/`,
    }));
    expect(renderMarkdown(r(many)).length).toBeLessThanOrEqual(65_000);
  });
  it('escapes page-derived text', () => {
    const md = renderMarkdown(
      r([
        {
          ...okPage,
          findings: [
            {
              rule: 'title',
              severity: 'warning',
              message: 'duplicate title "<img src=x> @octocat | `x`"',
            },
          ],
        },
      ]),
      { link: LINK },
    );
    expect(md).not.toContain('<img');
    expect(md).not.toContain('@octocat');
    expect(esc('a|b')).toBe('a\\|b');
  });
  it('builds the run URL from the environment', () => {
    expect(
      runUrl({
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_RUN_ID: '42',
      }),
    ).toBe(LINK);
    expect(runUrl({})).toBeUndefined();
  });
});

describe('postComment', () => {
  const bot = { type: 'Bot' };
  const api = (existing: { id: number; body: string; user?: { type: string } }[] = []) => {
    const a = {
      list: vi.fn(async () => existing),
      create: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };
    return a satisfies CommentApi;
  };
  it('creates when no marker comment exists', async () => {
    const a = api([{ id: 1, body: 'unrelated' }]);
    expect(await postComment(a, `${COMMENT_MARKER}\nhi`, 'update')).toBe('created');
    expect(a.create).toHaveBeenCalledOnce();
    expect(a.update).not.toHaveBeenCalled();
  });
  it('updates the marker comment in place', async () => {
    const a = api([
      { id: 1, body: 'x' },
      { id: 7, body: `${COMMENT_MARKER}\nold`, user: bot },
    ]);
    expect(await postComment(a, 'new', 'update')).toBe('updated');
    expect(a.update).toHaveBeenCalledWith(7, 'new');
    expect(a.create).not.toHaveBeenCalled();
  });
  it('ignores marker comments written by humans (no hijack)', async () => {
    const a = api([{ id: 9, body: COMMENT_MARKER, user: { type: 'User' } }]);
    expect(await postComment(a, 'b', 'update')).toBe('created');
    expect(a.update).not.toHaveBeenCalled();
  });
  it('new mode always creates', async () => {
    const a = api([{ id: 7, body: COMMENT_MARKER }]);
    expect(await postComment(a, 'b', 'new')).toBe('created');
    expect(a.list).not.toHaveBeenCalled();
  });
  it('403 → skipped with a warning, no throw', async () => {
    const a = api();
    a.create.mockRejectedValue(
      Object.assign(new Error('Resource not accessible'), { status: 403 }),
    );
    expect(await postComment(a, 'b', 'update')).toBe('skipped');
  });
  it('other errors propagate', async () => {
    const a = api();
    a.create.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(postComment(a, 'b', 'update')).rejects.toThrow('boom');
  });
});

describe('commentTarget', () => {
  it('PR on pull_request, commit on push, nothing else', () => {
    expect(commentTarget('pull_request', { pull_request: { number: 5 } }, 'abc')).toEqual({
      kind: 'pr',
      number: 5,
    });
    expect(commentTarget('push', {}, 'abc')).toEqual({ kind: 'commit', sha: 'abc' });
    expect(commentTarget('schedule', {}, 'abc')).toBeUndefined();
    expect(commentTarget('push', {}, '')).toBeUndefined();
  });
});

describe('misc', () => {
  it('pullRequestNumber is undefined outside pull_request events', () => {
    expect(pullRequestNumber({})).toBeUndefined();
    expect(pullRequestNumber({ pull_request: { number: 5 } })).toBe(5);
  });
  it('writes the JSON report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-'));
    const report = buildReport('http://x', [okPage], [], 'error', NOW);
    const path = writeJsonReport(report, dir);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
    expect(report).toMatchObject({ version: 1, generatedAt: '2026-01-02T03:04:05.000Z' });
  });
});
