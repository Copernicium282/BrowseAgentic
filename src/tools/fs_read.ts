import { readFileSync } from 'fs';
import { resolveAndValidate } from '../security/path_guard.js';
import type { BrowseAgenticConfig } from '../types.js';

export interface FSReadInput {
  path: string;
  line_numbers?: boolean;
}

export async function handleFSRead(
  config: BrowseAgenticConfig,
  input: FSReadInput,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const { path: validPath, error } = resolveAndValidate(input.path, config.rsi);
  if (error) return { success: false, error };

  try {
    const content = readFileSync(validPath, 'utf-8');
    if (input.line_numbers !== false) {
      const numbered = content.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
      return { success: true, content: numbered };
    }
    return { success: true, content };
  } catch (err) {
    return { success: false, error: `READ_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}
