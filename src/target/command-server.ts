import { spawn } from 'node:child_process';
import type { Target } from './static-server.js';

export interface CommandTarget extends Target {
  /** Last 50 lines of stdout/stderr, for error messages. */
  logs(): string;
}

/**
 * Run `command` in the background in its own process group.
 * The command comes from the workflow author (an action input), never from PR content;
 * it runs through a shell so `a && b` works.
 */
export function startCommand(command: string, baseUrl: string): CommandTarget {
  const lines: string[] = [];
  const push = (chunk: Buffer) => {
    lines.push(...chunk.toString().split('\n').filter(Boolean));
    if (lines.length > 50) lines.splice(0, lines.length - 50);
  };
  const child = spawn(command, { shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('error', (e) => lines.push(`spawn error: ${e.message}`));
  let exited = child.exitCode !== null;
  child.on('exit', () => (exited = true));

  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, sig);
    } catch {
      /* group already gone */
    }
  };
  return {
    baseUrl,
    logs: () => lines.join('\n'),
    async close() {
      signal('SIGTERM');
      if (!exited) {
        await new Promise<void>((ok) => {
          const t = setTimeout(() => (signal('SIGKILL'), ok()), 3000);
          child.once('exit', () => (clearTimeout(t), ok()));
        });
      }
      child.stdout.destroy();
      child.stderr.destroy();
    },
  };
}
