import { execFile } from 'child_process';
import { validateCommand } from '../security/command_guard.js';
import type { BrowseAgenticConfig } from '../types.js';

export interface GitInput {
  action: 'status' | 'diff' | 'log' | 'commit' | 'branch' | 'add';
  message?: string;
  files?: string[];
  branch_name?: string;
}

export interface GitResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function handleGit(
  config: BrowseAgenticConfig,
  input: GitInput,
  cwd?: string,
): Promise<GitResult> {
  const error = validateCommand('git', [input.action], config.rsi);
  if (error) return { success: false, error: `BLOCKED: ${error}` };

  const args: string[] = [];
  switch (input.action) {
    case 'status':
      args.push('status');
      break;
    case 'diff':
      args.push('diff');
      break;
    case 'log':
      args.push('log', '--oneline', '-20');
      break;
    case 'commit':
      if (!input.message) return { success: false, error: 'message is required for commit' };
      args.push('commit', '-m', `[self-improve] ${input.message}`);
      break;
    case 'branch':
      if (input.branch_name) {
        args.push('branch', input.branch_name);
      } else {
        args.push('branch');
      }
      break;
    case 'add':
      args.push('add', ...(input.files ?? ['.']));
      break;
  }

  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: cwd ?? process.cwd(),
      timeout: 30000,
      encoding: 'utf-8',
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          output: stdout ?? stderr ?? undefined,
          error: `GIT_ERROR: ${err.message}`,
        });
      } else {
        resolve({
          success: true,
          output: stdout ?? undefined,
        });
      }
    });
  });
}
