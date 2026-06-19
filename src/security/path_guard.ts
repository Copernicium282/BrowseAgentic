import { resolve, relative, isAbsolute } from 'path';
import { realpathSync } from 'fs';
import type { BrowseAgenticConfig } from '../types.js';

export function validatePath(targetPath: string, config: BrowseAgenticConfig['rsi']): string | null {
  const resolved = resolve(targetPath);
  const sandboxRoot = resolve(config.sandbox_root);

  // Check if path is within sandbox root
  const rel = relative(sandboxRoot, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return `Path "${targetPath}" resolves outside sandbox root "${config.sandbox_root}"`;
  }

  // Check blocked paths
  for (const blocked of config.hidden_patterns) {
    if (resolved.includes(`/${blocked}/`) || resolved.endsWith(`/${blocked}`)) {
      return `Path "${targetPath}" is inside blocked directory "${blocked}"`;
    }
  }

  // Check for symlink traversal
  try {
    const real = realpathSync(resolved);
    const realRel = relative(sandboxRoot, real);
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      return `Path "${targetPath}" resolves outside sandbox root via symlink`;
    }
  } catch {
    // Path doesn't exist yet — OK for write operations
  }

  return null;
}

export function resolveAndValidate(targetPath: string, config: BrowseAgenticConfig['rsi']): { path: string; error?: string } {
  const error = validatePath(targetPath, config);
  if (error) return { path: '', error };
  return { path: resolve(targetPath) };
}
