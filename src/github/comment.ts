import * as core from '@actions/core';
import type { Config } from '../config.js';
import { COMMENT_MARKER } from '../report/markdown.js';

export interface CommentApi {
  list(): Promise<{ id: number; body?: string | null; user?: { type?: string } | null }[]>;
  create(body: string): Promise<void>;
  update(id: number, body: string): Promise<void>;
}

export type CommentResult = 'created' | 'updated' | 'skipped';

/** Pull request number from the event payload, or undefined for any other event. */
export function pullRequestNumber(payload: {
  pull_request?: { number?: number };
}): number | undefined {
  return payload.pull_request?.number;
}

export type CommentTarget = { kind: 'pr'; number: number } | { kind: 'commit'; sha: string };

/** PR comment on `pull_request` events, commit comment on `push`, nothing otherwise. */
export function commentTarget(
  eventName: string,
  payload: { pull_request?: { number?: number } },
  sha: string,
): CommentTarget | undefined {
  const pr = pullRequestNumber(payload);
  if (pr !== undefined) return { kind: 'pr', number: pr };
  if (eventName === 'push' && sha) return { kind: 'commit', sha };
  return undefined;
}

/** Octokit → CommentApi for a commit (push events). */
export function octokitCommitCommentApi(
  octokit: ReturnType<typeof import('@actions/github').getOctokit>,
  repo: { owner: string; repo: string },
  commit_sha: string,
): CommentApi {
  return {
    list: () =>
      octokit.paginate(octokit.rest.repos.listCommentsForCommit, {
        ...repo,
        commit_sha,
        per_page: 100,
      }),
    create: async (body) =>
      void (await octokit.rest.repos.createCommitComment({ ...repo, commit_sha, body })),
    update: async (comment_id, body) =>
      void (await octokit.rest.repos.updateCommitComment({ ...repo, comment_id, body })),
  };
}

/** Octokit → CommentApi for one issue/PR. */
export function octokitCommentApi(
  octokit: ReturnType<typeof import('@actions/github').getOctokit>,
  repo: { owner: string; repo: string },
  issue_number: number,
): CommentApi {
  return {
    list: () =>
      octokit.paginate(octokit.rest.issues.listComments, { ...repo, issue_number, per_page: 100 }),
    create: async (body) =>
      void (await octokit.rest.issues.createComment({ ...repo, issue_number, body })),
    update: async (comment_id, body) =>
      void (await octokit.rest.issues.updateComment({ ...repo, comment_id, body })),
  };
}

/**
 * `update` mode edits the comment carrying the marker (or creates it); `new` always creates.
 * A 403 (read-only token) skips the comment with a notice; it never fails the job.
 */
export async function postComment(
  api: CommentApi,
  body: string,
  mode: Config['commentMode'],
  marker = COMMENT_MARKER,
  kind: CommentTarget['kind'] = 'pr',
): Promise<CommentResult> {
  try {
    if (mode === 'update') {
      // Only trust comments written by a bot (the action itself), so a contributor pasting the
      // marker in their own comment cannot hijack the report.
      const existing = (await api.list()).find(
        (c) => c.user?.type === 'Bot' && c.body?.includes(marker),
      );
      if (existing) {
        await api.update(existing.id, body);
        return 'updated';
      }
    }
    await api.create(body);
    return 'created';
  } catch (e) {
    if ((e as { status?: number }).status === 403) {
      // Commenting is optional: a read-only token is a normal setup, so this is a notice, not a warning.
      core.notice(
        kind === 'commit'
          ? 'Commit comment skipped (no write permission): the token needs `contents: write`. Add it to the workflow `permissions`, or set `comment: false`. The report is in the job summary.'
          : 'PR comment skipped (no write permission): the token needs `pull-requests: write`, or this is a fork PR (read-only token; see docs/forks.md). The report is in the job summary.',
      );
      return 'skipped';
    }
    throw e;
  }
}
