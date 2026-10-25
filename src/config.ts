import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export type RuleSeverity = 'error' | 'warning' | 'off';
export type RuleName = 'title' | 'meta-description' | 'h1' | 'canonical' | 'indexability' | 'lang';

export interface RuleConfig {
  severity?: RuleSeverity;
  min?: number;
  max?: number;
}

export interface Config {
  baseUrl?: string;
  staticDir?: string;
  startCommand?: string;
  waitTimeout: number;
  paths: string[];
  lighthouse: {
    enabled: boolean;
    preset: 'mobile' | 'desktop';
    runs: number;
    thresholds: { performance: number; accessibility: number; bestPractices: number; seo: number };
  };
  rules: Record<RuleName, RuleConfig>;
  links: {
    mode: 'none' | 'internal' | 'all';
    ignore: RegExp[];
    timeout: number;
    concurrency: number;
  };
  failOn: 'error' | 'warning' | 'never';
  comment: boolean;
  commentMode: 'update' | 'new';
  githubToken: string;
}

export class ConfigError extends Error {}

/** Every action input name; `main.ts` reads exactly these. */
export const INPUT_NAMES = [
  'base-url',
  'static-dir',
  'start-command',
  'wait-timeout',
  'paths',
  'lighthouse',
  'lighthouse-preset',
  'lighthouse-runs',
  'min-performance',
  'min-accessibility',
  'min-best-practices',
  'min-seo',
  'check-links',
  'link-ignore',
  'link-timeout',
  'link-concurrency',
  'fail-on',
  'comment',
  'comment-mode',
  'config-file',
  'github-token',
] as const;

const splitList = (v: string | string[]): string[] =>
  (Array.isArray(v) ? v : v.split(/[,\n]/)).map((s) => s.trim()).filter(Boolean);

const list = z.union([z.string(), z.array(z.string())]).transform(splitList);
const score = z.number().min(0).max(100);
const seconds = z.number().positive();
const ruleSeverity = z.enum(['error', 'warning', 'off']);
const rule = z.union([
  ruleSeverity.transform((severity): RuleConfig => ({ severity })),
  z
    .object({
      severity: ruleSeverity.optional(),
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().positive().optional(),
    })
    .strict(),
]);

const fileSchema = z
  .object({
    'wait-timeout': seconds,
    paths: list,
    'fail-on': z.enum(['error', 'warning', 'never']),
    lighthouse: z
      .object({
        enabled: z.boolean(),
        preset: z.enum(['mobile', 'desktop']),
        runs: z.number().int().min(1).max(10),
        thresholds: z
          .object({
            performance: score,
            accessibility: score,
            'best-practices': score,
            seo: score,
          })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    rules: z
      .object({
        title: rule,
        'meta-description': rule,
        h1: rule,
        canonical: rule,
        indexability: rule,
        lang: rule,
      })
      .partial()
      .strict(),
    links: z
      .object({
        mode: z.enum(['none', 'internal', 'all']),
        ignore: list,
        timeout: seconds,
        concurrency: z.number().int().min(1).max(64),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

type FileConfig = z.infer<typeof fileSchema>;

function fmt(issues: z.core.$ZodIssue[]): string {
  return issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

function parseFile(text: string | undefined): FileConfig {
  if (!text?.trim()) return {};
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new ConfigError(`Invalid config file (YAML): ${(e as Error).message}`);
  }
  if (raw === null || raw === undefined) return {};
  const res = fileSchema.safeParse(raw);
  if (!res.success) throw new ConfigError(`Invalid config file:\n${fmt(res.error.issues)}`);
  return res.data;
}

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const num = z.coerce.number();

const inputSchema = z.object({
  'base-url': z.string().optional(),
  'static-dir': z.string().optional(),
  'start-command': z.string().optional(),
  'wait-timeout': num.pipe(seconds).default(60),
  paths: z.string().default('/'),
  lighthouse: bool.default(true),
  'lighthouse-preset': z.enum(['mobile', 'desktop']).default('mobile'),
  'lighthouse-runs': num.pipe(z.number().int().min(1).max(10)).default(1),
  'min-performance': num.pipe(score).default(0),
  'min-accessibility': num.pipe(score).default(0),
  'min-best-practices': num.pipe(score).default(0),
  'min-seo': num.pipe(score).default(90),
  'check-links': z.enum(['none', 'internal', 'all']).default('internal'),
  'link-ignore': z.string().default(''),
  'link-timeout': num.pipe(seconds).default(10),
  'link-concurrency': num.pipe(z.number().int().min(1).max(64)).default(8),
  'fail-on': z.enum(['error', 'warning', 'never']).default('error'),
  comment: bool.default(false),
  'comment-mode': z.enum(['update', 'new']).default('update'),
  'github-token': z.string().default(''),
});

export function normalizePath(p: string): string {
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * Build a validated Config from raw action inputs (empty string = unset) and the
 * optional text of the config file. File values override inputs, except `base-url`, `static-dir` and `start-command`, which only come from action inputs (the file lives in the repo under audit and may be changed by a PR).
 */
export function resolveConfig(inputs: Record<string, string>, fileText?: string): Config {
  const cleaned = Object.fromEntries(
    Object.entries(inputs)
      .filter(([k, v]) => v.trim() !== '' && k !== 'config-file')
      .map(([k, v]) => [k, v.trim()]),
  );
  const parsed = inputSchema.safeParse(cleaned);
  if (!parsed.success) throw new ConfigError(`Invalid inputs:\n${fmt(parsed.error.issues)}`);
  const i = parsed.data;
  const f = parseFile(fileText);

  const rules = {} as Record<RuleName, RuleConfig>;
  for (const n of ['title', 'meta-description', 'h1', 'canonical', 'indexability', 'lang'] as const)
    rules[n] = f.rules?.[n] ?? {};

  const ignoreSrc = f.links?.ignore ?? splitList(i['link-ignore']);
  const ignore = ignoreSrc.map((p) => {
    try {
      return new RegExp(p);
    } catch {
      throw new ConfigError(`Invalid link-ignore regex: ${p}`);
    }
  });

  const th = f.lighthouse?.thresholds ?? {};
  const config: Config = {
    baseUrl: i['base-url'],
    staticDir: i['static-dir'],
    startCommand: i['start-command'],
    waitTimeout: f['wait-timeout'] ?? i['wait-timeout'],
    paths: [...new Set(splitList(f.paths ?? i.paths).map(normalizePath))],
    lighthouse: {
      enabled: f.lighthouse?.enabled ?? i.lighthouse,
      preset: f.lighthouse?.preset ?? i['lighthouse-preset'],
      runs: f.lighthouse?.runs ?? i['lighthouse-runs'],
      thresholds: {
        performance: th.performance ?? i['min-performance'],
        accessibility: th.accessibility ?? i['min-accessibility'],
        bestPractices: th['best-practices'] ?? i['min-best-practices'],
        seo: th.seo ?? i['min-seo'],
      },
    },
    rules,
    links: {
      mode: f.links?.mode ?? i['check-links'],
      ignore,
      timeout: f.links?.timeout ?? i['link-timeout'],
      concurrency: f.links?.concurrency ?? i['link-concurrency'],
    },
    failOn: f['fail-on'] ?? i['fail-on'],
    comment: i.comment,
    commentMode: i['comment-mode'],
    githubToken: i['github-token'],
  };

  if (config.paths.length === 0) throw new ConfigError('`paths` must contain at least one path.');
  if (config.staticDir && config.baseUrl)
    throw new ConfigError('Set either `static-dir` or `base-url`, not both.');
  if (!config.staticDir && !config.baseUrl)
    throw new ConfigError('One of `static-dir` or `base-url` is required.');
  if (config.startCommand && !config.baseUrl)
    throw new ConfigError('`start-command` requires `base-url` (the URL to wait for).');
  if (config.baseUrl) {
    try {
      const u = new URL(config.baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    } catch {
      throw new ConfigError(`Invalid base-url: ${config.baseUrl}`);
    }
  }
  return config;
}
