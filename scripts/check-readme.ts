// Fails if README.md and action.yml disagree on inputs/outputs. Run with: node scripts/check-readme.ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const action = parse(readFileSync('action.yml', 'utf8')) as {
  inputs: Record<string, { default?: unknown }>;
  outputs: Record<string, unknown>;
};
const readme = readFileSync('README.md', 'utf8');

/** First-column backticked names of the table following `## <heading>`. */
function tableNames(heading: string): string[] {
  const section = readme.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? '';
  return [...section.matchAll(/^\| `([a-z-]+)`\s*\|/gm)].map((m) => m[1]!);
}

const problems: string[] = [];
function compare(kind: string, documented: string[], declared: string[]): void {
  for (const n of declared)
    if (!documented.includes(n)) problems.push(`${kind} "${n}" is in action.yml but not in README`);
  for (const n of documented)
    if (!declared.includes(n)) problems.push(`${kind} "${n}" is in README but not in action.yml`);
}
compare('input', tableNames('Inputs'), Object.keys(action.inputs));
compare('output', tableNames('Outputs'), Object.keys(action.outputs));

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `README and action.yml are in sync (${Object.keys(action.inputs).length} inputs, ${Object.keys(action.outputs).length} outputs).`,
);
