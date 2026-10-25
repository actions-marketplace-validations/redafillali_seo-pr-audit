import type { Scores } from '../lighthouse/scores.js';
import type { Finding } from '../seo/types.js';

export interface PageResult {
  path: string;
  url: string;
  status: number;
  lighthouse?: Scores;
  findings: Finding[];
}

export interface AuditReport {
  version: 1;
  baseUrl: string;
  generatedAt: string;
  pages: PageResult[];
  summary: { errors: number; warnings: number; passed: boolean; thresholdFailures: string[] };
}
