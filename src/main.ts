import { existsSync, readFileSync } from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runAudit } from './audit.js';
import { ConfigError, INPUT_NAMES, resolveConfig } from './config.js';
import { octokitCommentApi, postComment, pullRequestNumber } from './github/comment.js';
import { renderMarkdown } from './report/markdown.js';
import { writeJobSummary, writeJsonReport } from './report/write.js';
import { startCommand, type CommandTarget } from './target/command-server.js';
import { startStaticServer, type Target } from './target/static-server.js';
import { waitForUrl } from './target/wait-for-url.js';

async function startTarget(config: ReturnType<typeof resolveConfig>): Promise<Target> {
  if (config.staticDir) return startStaticServer(config.staticDir);
  const baseUrl = config.baseUrl!;
  if (!config.startCommand) {
    await waitForUrl(baseUrl, config.waitTimeout);
    return { baseUrl, close: async () => {} };
  }
  const target: CommandTarget = startCommand(config.startCommand, baseUrl);
  try {
    await waitForUrl(baseUrl, config.waitTimeout);
  } catch (e) {
    const logs = target.logs();
    await target.close();
    throw new Error(`${(e as Error).message}${logs ? `\nLast server output:\n${logs}` : ''}`, {
      cause: e,
    });
  }
  return target;
}

async function publish(config: ReturnType<typeof resolveConfig>, markdown: string): Promise<void> {
  if (!config.comment) return;
  const pr = pullRequestNumber(github.context.payload);
  if (pr === undefined) {
    core.info('Not a pull_request event: skipping the PR comment.');
    return;
  }
  if (!config.githubToken) {
    core.warning('No github-token: skipping the PR comment.');
    return;
  }
  const api = octokitCommentApi(github.getOctokit(config.githubToken), github.context.repo, pr);
  core.info(`PR comment ${await postComment(api, markdown, config.commentMode)}.`);
}

async function run(): Promise<void> {
  const inputs = Object.fromEntries(INPUT_NAMES.map((n) => [n, core.getInput(n)]));
  const file = inputs['config-file'] || '.seo-audit.yml';
  const config = resolveConfig(inputs, existsSync(file) ? readFileSync(file, 'utf8') : undefined);
  if (config.githubToken) core.setSecret(config.githubToken);

  const target = await core.group('Start target', () => startTarget(config));
  try {
    const report = await runAudit(target.baseUrl, config);
    const markdown = renderMarkdown(report);
    writeJsonReport(report);
    await writeJobSummary(renderMarkdown(report, { maxLength: 900_000 }));
    await publish(config, markdown);

    const { errors, warnings, passed } = report.summary;
    core.info(`Done: ${errors} error(s), ${warnings} warning(s).`);
    if (!passed) core.setFailed(`SEO audit failed (${errors} error(s), ${warnings} warning(s)).`);
  } finally {
    await target.close();
  }
}

run().catch((e) =>
  core.setFailed(
    e instanceof ConfigError ? e.message : `Unexpected error: ${(e as Error).message}`,
  ),
);
