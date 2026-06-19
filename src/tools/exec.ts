import { execFile } from 'child_process';
import { validateCommand } from '../security/command_guard.js';
import type { BrowseAgenticConfig } from '../types.js';

export interface ExecInput {
  command: string;
  args?: string[];
  cwd?: string;
  timeout_ms?: number;
}

export interface ExecResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
}

export async function handleExec(
  config: BrowseAgenticConfig,
  input: ExecInput,
): Promise<ExecResult> {
  const args = input.args ?? [];
  const error = validateCommand(input.command, args, config.rsi);
  if (error) return { success: false, error: `BLOCKED: ${error}` };

  const timeout = Math.min(input.timeout_ms ?? 30000, 120000);

  return new Promise((resolve) => {
    execFile(input.command, args, {
      cwd: input.cwd ?? process.cwd(),
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      encoding: 'utf-8',
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          stdout: stdout ?? undefined,
          stderr: stderr ?? undefined,
          exit_code: typeof err.code === 'number' ? err.code : 1,
          error: `EXEC_ERROR: ${err.message}`,
        });
      } else {
        resolve({
          success: true,
          stdout: stdout ?? undefined,
          stderr: stderr ?? undefined,
          exit_code: 0,
        });
      }
    });
  });
}
