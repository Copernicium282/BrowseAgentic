import { strict as assert } from 'assert';
import { isBlocked } from '../src/security/guardrails.js';
import type { OmniBrowserConfig } from '../src/types.js';

const config: OmniBrowserConfig['security'] = {
  block_localhost: true,
  blocked_domains: ['evil.com'],
  allowed_domains: [],
  allowed_paths: [],
  blocked_paths: [],
  allowed_commands: [],
};

const configWithWhitelist: OmniBrowserConfig['security'] = {
  block_localhost: true,
  blocked_domains: [],
  allowed_domains: ['example.com'],
  allowed_paths: [],
  blocked_paths: [],
  allowed_commands: [],
};

// Test 1: localhost blocked
assert.equal(isBlocked(new URL('http://localhost:3000'), config), true, 'localhost should be blocked');
assert.equal(isBlocked(new URL('http://127.0.0.1:8080'), config), true, '127.0.0.1 should be blocked');
assert.equal(isBlocked(new URL('http://0.0.0.0'), config), true, '0.0.0.0 should be blocked');
console.log('PASS: localhost blocked');

// Test 2: private IPs blocked
assert.equal(isBlocked(new URL('http://192.168.1.1'), config), true, '192.168.x.x should be blocked');
assert.equal(isBlocked(new URL('http://10.0.0.1'), config), true, '10.x.x.x should be blocked');
assert.equal(isBlocked(new URL('http://172.16.0.1'), config), true, '172.16.x.x should be blocked');
assert.equal(isBlocked(new URL('http://172.31.255.255'), config), true, '172.31.x.x should be blocked');
console.log('PASS: private IPs blocked');

// Test 3: public URLs allowed
assert.equal(isBlocked(new URL('https://example.com'), config), false, 'example.com should be allowed');
assert.equal(isBlocked(new URL('https://google.com'), config), false, 'google.com should be allowed');
console.log('PASS: public URLs allowed');

// Test 4: blocked_domains
assert.equal(isBlocked(new URL('https://evil.com'), config), true, 'evil.com should be blocked');
assert.equal(isBlocked(new URL('https://sub.evil.com'), config), true, 'sub.evil.com should be blocked');
assert.equal(isBlocked(new URL('https://good.com'), config), false, 'good.com should be allowed');
console.log('PASS: blocked_domains works');

// Test 5: allowed_domains whitelist
assert.equal(isBlocked(new URL('https://example.com'), configWithWhitelist), false, 'example.com should be allowed');
assert.equal(isBlocked(new URL('https://other.com'), configWithWhitelist), true, 'other.com should be blocked by whitelist');
console.log('PASS: allowed_domains whitelist works');

// Test 6: non-http protocols not blocked
assert.equal(isBlocked(new URL('data:text/html,hello'), config), false, 'data: URLs should not be blocked');
assert.equal(isBlocked(new URL('chrome-extension://abc'), config), false, 'chrome-extension: should not be blocked');
console.log('PASS: non-http protocols not blocked');

console.log('All guardrails tests passed');
