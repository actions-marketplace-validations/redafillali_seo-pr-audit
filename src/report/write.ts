import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as core from '@actions/core';
import type { AuditReport } from './types.js';

/** Write the JSON report and set the `report-path` / `errors` / `warnings` / `passed` outputs. */
export function writeJsonReport(report: AuditReport, dir = '.seo-audit'): string {
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'report.json');
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  core.setOutput('report-path', path);
  core.setOutput('errors', String(report.summary.errors));
  core.setOutput('warnings', String(report.summary.warnings));
  core.setOutput('passed', String(report.summary.passed));
  return path;
}

/** Job summary has a far larger limit (1 MiB) than a comment. */
export async function writeJobSummary(markdown: string): Promise<void> {
  await core.summary.addRaw(markdown, true).write();
}
