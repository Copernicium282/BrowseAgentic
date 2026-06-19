import { readFileSync, statSync } from 'fs';
import { resolveAndValidate } from '../security/path_guard.js';
import type { BrowseAgenticConfig } from '../types.js';

export interface FSReadInput {
  path: string;
  line_numbers?: boolean;
  max_bytes?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB hard limit
const DEFAULT_MAX_BYTES = 100000;
const BINARY_CHECK_SIZE = 8192;

export async function handleFSRead(
  config: BrowseAgenticConfig,
  input: FSReadInput,
): Promise<{ success: boolean; content?: string; truncated?: boolean; size_bytes?: number; error?: string }> {
  const { path: validPath, error } = resolveAndValidate(input.path, config.rsi);
  if (error) return { success: false, error };

  try {
    const stat = statSync(validPath);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: `FILE_TOO_LARGE: File is ${(stat.size / 1024 / 1024).toFixed(1)}MB. Use run_command with head/tail for large files.`, size_bytes: stat.size };
    }

    // Binary detection: check first 8KB for null bytes
    const headBuffer = readFileSync(validPath).slice(0, BINARY_CHECK_SIZE);
    if (headBuffer.includes(0)) {
      return { success: false, error: 'BINARY_FILE: File appears to be binary. Use a different tool for binary content.' };
    }

    const maxBytes = input.max_bytes ?? DEFAULT_MAX_BYTES;
    const content = readFileSync(validPath, 'utf-8');
    const truncated = content.length > maxBytes;
    const displayContent = truncated ? content.slice(0, maxBytes) : content;

    if (input.line_numbers !== false) {
      const numbered = displayContent.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
      return { success: true, content: numbered, truncated, size_bytes: stat.size };
    }
    return { success: true, content: displayContent, truncated, size_bytes: stat.size };
  } catch (err) {
    return { success: false, error: `READ_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}
