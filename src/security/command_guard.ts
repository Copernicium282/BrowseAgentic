import type { OmniBrowserConfig } from '../types.js';

export function validateCommand(
  command: string,
  args: string[],
  config: OmniBrowserConfig['security'],
): string | null {
  // Check if command is in allowlist
  if (!config.allowed_commands.includes(command)) {
    return `Command "${command}" is not in the allowlist: ${config.allowed_commands.join(', ')}`;
  }

  // Check for shell injection patterns in args
  for (const arg of args) {
    if (arg.includes(';') || arg.includes('|') || arg.includes('&') || arg.includes('`') || arg.includes('$(')) {
      return `Argument contains shell metacharacters: "${arg}"`;
    }
  }

  return null; // valid
}
