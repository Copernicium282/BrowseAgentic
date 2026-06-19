import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import type { BrowseAgenticConfig } from './types.js';

const DEFAULT_CONFIG_PATH = './config/browseagentic.yaml';

export function loadConfig(configPath?: string): BrowseAgenticConfig {
  const envPath = process.env.BROWSEAGENTIC_CONFIG;
  const filePath = resolve(configPath ?? envPath ?? DEFAULT_CONFIG_PATH);

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;

  return validateConfig(parsed, filePath);
}

function validateConfig(parsed: Record<string, unknown>, filePath: string): BrowseAgenticConfig {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Config file ${filePath} is empty or not a valid YAML object`);
  }

  const requiredKeys = ['server', 'browser', 'security', 'artifacts', 'fallback_vision'];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Missing required config key: "${key}" in ${filePath}`);
    }
  }

  const server = parsed.server as Record<string, unknown>;
  if (server.transport !== 'stdio') {
    throw new Error(`Only stdio transport is supported, got: "${server.transport}"`);
  }

  const browser = parsed.browser as Record<string, unknown>;
  if (browser.engine !== 'chromium') {
    throw new Error(`Only chromium engine is supported, got: "${browser.engine}"`);
  }

  const config = parsed as unknown as BrowseAgenticConfig;

  // Apply defaults for new sections
  if (!config.budget) {
    config.budget = { max_elements: 20, per_field_char_cap: 2000, total_response_char_cap: 4000, overflow_dir: './sessions/overflow' };
  }
  if (!config.cache) {
    config.cache = { enabled: true, backend: 'filesystem', dir: './sessions/cache', ttl_hours: 168 };
  }
  if (!config.rsi) {
    config.rsi = {
      sandbox_root: '.', protected_patterns: ['**/.git/**', '**/.env', '**/*.key', '**/*.pem'],
      hidden_patterns: ['.git', 'node_modules', '__pycache__', '.venv'],
      command_allowlist: ['ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'pwd', 'tree', 'file', 'git status', 'git diff', 'git log', 'git add', 'git commit', 'git branch', 'git show', 'npm install', 'npm run', 'npm test', 'npm ci', 'node', 'npx tsc', 'python3', 'pip install', 'pip3 install', 'tsc'],
      command_timeout_ms: 30000, max_stdout_chars: 50000,
    };
  }
  if (!config.tabs) {
    config.tabs = { max_open_tabs: 10 };
  }
  if (!config.session) {
    config.session = { profiles_dir: './sessions/profiles' };
  }
  if (!config.dev_mode) {
    config.dev_mode = { enabled: false, allowed_local_ports: [], allowed_local_hosts: ['localhost', '127.0.0.1'] };
  }
  if (!config.security.secret_redaction_patterns) {
    config.security.secret_redaction_patterns = [];
  }
  if (!config.security.eval_js_xss_detection) {
    config.security.eval_js_xss_detection = 'warn';
  }
  if (!config.security.console_capture_level) {
    config.security.console_capture_level = 'warning';
  }

  return config;
}
