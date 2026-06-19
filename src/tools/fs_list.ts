import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { resolveAndValidate } from '../security/path_guard.js';
import type { BrowseAgenticConfig } from '../types.js';

export interface FSListInput {
  path: string;
  recursive?: boolean;
}

export async function handleFSList(
  config: BrowseAgenticConfig,
  input: FSListInput,
): Promise<{ success: boolean; entries?: string[]; error?: string }> {
  const { path: validPath, error } = resolveAndValidate(input.path, config.rsi);
  if (error) return { success: false, error };

  try {
    const entries: string[] = [];
    const listDir = (dir: string, prefix: string) => {
      const items = readdirSync(dir);
      for (const item of items) {
        const full = join(dir, item);
        const stat = statSync(full);
        const entry = `${prefix}${item}${stat.isDirectory() ? '/' : ''}`;
        entries.push(entry);
        if (input.recursive && stat.isDirectory() && !item.startsWith('.')) {
          listDir(full, `${prefix}${item}/`);
        }
      }
    };
    listDir(validPath, '');
    return { success: true, entries };
  } catch (err) {
    return { success: false, error: `LIST_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}
