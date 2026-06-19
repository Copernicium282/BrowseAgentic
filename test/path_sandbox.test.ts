import { strict as assert } from 'assert';
import { validatePath } from '../src/security/path_guard.js';
import type { BrowseAgenticConfig } from '../src/types.js';

const config: BrowseAgenticConfig['rsi'] = {
  sandbox_root: '.',
  protected_patterns: ['**/.git/**', '**/.env'],
  hidden_patterns: ['.git', 'node_modules'],
  command_allowlist: [],
  command_timeout_ms: 30000,
  max_stdout_chars: 50000,
};

// Test 1: Legitimate relative paths succeed
assert.equal(validatePath('src/index.ts', config), null, 'relative path should be valid');
assert.equal(validatePath('config/browseagentic.yaml', config), null, 'nested relative path should be valid');
console.log('PASS: legitimate paths accepted');

// Test 2: Path traversal blocked
const traversalResult = validatePath('../../../etc/passwd', config);
assert.notEqual(traversalResult, null, '../ traversal should be blocked');
assert.ok(traversalResult!.includes('outside sandbox'), 'should mention sandbox violation');
console.log('PASS: path traversal blocked');

// Test 3: Absolute path blocked
const absoluteResult = validatePath('/etc/passwd', config);
assert.notEqual(absoluteResult, null, 'absolute path should be blocked');
console.log('PASS: absolute path blocked');

// Test 4: Hidden directories blocked
const gitResult = validatePath('.git/config', config);
assert.notEqual(gitResult, null, '.git should be blocked');
const nmResult = validatePath('node_modules/package/index.js', config);
assert.notEqual(nmResult, null, 'node_modules should be blocked');
console.log('PASS: hidden directories blocked');

// Test 5: Current directory is allowed
assert.equal(validatePath('.', config), null, 'current directory should be valid');
console.log('PASS: current directory allowed');

// Test 6: Deep nested paths work
assert.equal(validatePath('src/tools/navigate.ts', config), null, 'deep nested path should be valid');
console.log('PASS: deep nested paths accepted');

// Test 7: Path with spaces
assert.equal(validatePath('path with spaces/file.txt', config), null, 'spaces in path should be valid');
console.log('PASS: paths with spaces accepted');

console.log('\nAll path sandbox tests passed');
