import type { Config } from '../config.js';
import type { AuditReport, PageResult } from './types.js';

/**
 * errors = error findings + threshold failures. `passed` follows `fail-on`:
 * `error` → no errors; `warning` → no errors and no warnings; `never` → always true (reporting mode).
 */
export function summarize(
  pages: PageResult[],
  thresholdFailures: string[],
  failOn: Config['failOn'],
): AuditReport['summary'] {
  const count = (sev: string) =>
    pages.reduce((n, p) => n + p.findings.filter((f) => f.severity === sev).length, 0);
  const errors = count('error') + thresholdFailures.length;
  const warnings = count('warning');
  const passed =
    failOn === 'never' ? true : failOn === 'warning' ? errors + warnings === 0 : errors === 0;
  return { errors, warnings, passed, thresholdFailures };
}

export function buildReport(
  baseUrl: string,
  pages: PageResult[],
  thresholdFailures: string[],
  failOn: Config['failOn'],
  now = new Date(),
): AuditReport {
  return {
    version: 1,
    baseUrl,
    generatedAt: now.toISOString(),
    pages,
    summary: summarize(pages, thresholdFailures, failOn),
  };
}
