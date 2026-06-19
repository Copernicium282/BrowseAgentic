import { strict as assert } from 'assert';
import { symlinkSync, unlinkSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { validatePath } from '../src/security/path_guard.js';
import type { BrowseAgenticConfig } from '../src/types.js';

const sandboxDir = join(process.cwd(), '_test_sandbox');
const config: BrowseAgenticConfig['rsi'] = {
  sandbox_root: sandboxDir,
  protected_patterns: [],
  hidden_patterns: [],
  command_allowlist: [],
  command_timeout_ms: 30000,
  max_stdout_chars: 50000,
};

// Setup
mkdirSync(sandboxDir, { recursive: true });
mkdirSync(join(sandboxDir, 'inside'), { recursive: true });
writeFileSync(join(sandboxDir, 'inside', 'safe.txt'), 'safe content');

// Create symlink inside sandbox pointing to /tmp (outside sandbox)
const linkPath = join(sandboxDir, 'escape_link');
try { unlinkSync(linkPath); } catch {}
symlinkSync('/tmp', linkPath);

// Test 1: validatePath with the symlink's path relative to sandbox root
// We need to pass the path as it would be seen from within the sandbox
const result = validatePath(join(sandboxDir, 'escape_link'), config);
assert.notEqual(result, null, 'symlink escape should be blocked');
assert.ok(
  result!.includes('symlink') || result!.includes('outside'),
  `should block symlink escape, got: ${result}`
);
console.log('PASS: symlink escape blocked');

// Test 2: Legitimate paths still work
assert.equal(validatePath(join(sandboxDir, 'inside', 'safe.txt'), config), null, 'legitimate path should work');
console.log('PASS: legitimate paths still work');

// Cleanup
try { unlinkSync(linkPath); } catch {}
try { unlinkSync(join(sandboxDir, 'inside', 'safe.txt')); } catch {}
try { require('fs').rmdirSync(join(sandboxDir, 'inside')); } catch {}
try { require('fs').rmdirSync(sandboxDir); } catch {}

console.log('\nSymlink escape test passed');
