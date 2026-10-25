import type { CheerioAPI } from 'cheerio';
import type { Config, RuleName } from '../config.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  details?: string[];
}

export interface RuleContext {
  $: CheerioAPI;
  url: string;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  config: Config;
}

export interface Rule {
  name: RuleName;
  run(ctx: RuleContext): Finding[];
}
