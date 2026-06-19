import type { BrowseAgenticConfig } from '../types.js';

export function validateCommand(
  command: string,
  args: string[],
  config: BrowseAgenticConfig['rsi'],
): string | null {
  if (!config.command_allowlist.includes(command)) {
    return `Command "${command}" is not in the allowlist`;
  }
  for (const arg of args) {
    if (arg.includes(';') || arg.includes('|') || arg.includes('&') || arg.includes('`') || arg.includes('$(')) {
      return `Argument contains shell metacharacters: "${arg}"`;
    }
  }
  return null;
}
