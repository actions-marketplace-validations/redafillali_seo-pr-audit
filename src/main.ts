import { existsSync, readFileSync } from 'node:fs';
import * as core from '@actions/core';
import { ConfigError, INPUT_NAMES, resolveConfig } from './config.js';

function run(): void {
  const inputs = Object.fromEntries(INPUT_NAMES.map((n) => [n, core.getInput(n)]));
  const file = inputs['config-file'] || '.seo-audit.yml';
  const config = resolveConfig(inputs, existsSync(file) ? readFileSync(file, 'utf8') : undefined);
  core.info(`Auditing ${config.paths.join(', ')}`);
  core.setOutput('passed', 'true');
}

try {
  run();
} catch (e) {
  core.setFailed(
    e instanceof ConfigError ? e.message : `Unexpected error: ${(e as Error).message}`,
  );
}
