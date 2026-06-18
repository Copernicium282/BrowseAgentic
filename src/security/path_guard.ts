import { resolve, relative, isAbsolute } from 'path';
import { realpathSync, statSync } from 'fs';
import type { OmniBrowserConfig } from '../types.js';

export function validatePath(targetPath: string, config: OmniBrowserConfig['security']): string | null {
  const resolved = resolve(targetPath);

  // Check blocked paths
  for (const blocked of config.blocked_paths) {
    const blockedResolved = resolve(blocked);
    if (resolved === blockedResolved || resolved.startsWith(blockedResolved + '/')) {
      return `Path "${targetPath}" is inside blocked directory "${blocked}"`;
    }
  }

  // Check allowed paths
  if (config.allowed_paths.length > 0) {
    let allowed = false;
    for (const allowedDir of config.allowed_paths) {
      const allowedResolved = resolve(allowedDir);
      const rel = relative(allowedResolved, resolved);
      if (!rel.startsWith('..') && !isAbsolute(rel)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return `Path "${targetPath}" is outside allowed directories`;
    }
  }

  // Check for symlink traversal
  try {
    const real = realpathSync(resolved);
    const realRel = relative(resolve('.'), real);
    if (realRel.startsWith('..')) {
      return `Path "${targetPath}" resolves outside project root via symlink`;
    }
  } catch {
    // Path doesn't exist yet — OK for write operations
  }

  return null; // valid
}

export function resolveAndValidate(targetPath: string, config: OmniBrowserConfig['security']): { path: string; error?: string } {
  const error = validatePath(targetPath, config);
  if (error) return { path: '', error };
  return { path: resolve(targetPath) };
}
