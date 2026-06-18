import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { resolveAndValidate } from '../security/path_guard.js';
import type { OmniBrowserConfig } from '../types.js';

export interface FSWriteInput {
  path: string;
  content: string;
}

export async function handleFSWrite(
  config: OmniBrowserConfig,
  input: FSWriteInput,
): Promise<{ success: boolean; bytes_written?: number; error?: string }> {
  const { path: validPath, error } = resolveAndValidate(input.path, config.security);
  if (error) return { success: false, error };

  try {
    mkdirSync(dirname(validPath), { recursive: true });
    writeFileSync(validPath, input.content, 'utf-8');
    return { success: true, bytes_written: Buffer.byteLength(input.content) };
  } catch (err) {
    return { success: false, error: `WRITE_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}
