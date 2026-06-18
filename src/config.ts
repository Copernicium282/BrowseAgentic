import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import type { OmniBrowserConfig } from './types.js';

const DEFAULT_CONFIG_PATH = './config/omnibrowser.yaml';

export function loadConfig(configPath?: string): OmniBrowserConfig {
  const envPath = process.env.OMNIBROWSER_CONFIG;
  const filePath = resolve(configPath ?? envPath ?? DEFAULT_CONFIG_PATH);

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;

  return validateConfig(parsed, filePath);
}

function validateConfig(parsed: Record<string, unknown>, filePath: string): OmniBrowserConfig {
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

  return parsed as unknown as OmniBrowserConfig;
}
