import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface ChromeLauncherConfig {
  binary_path?: string;
  user_data_dir?: string;
  cdp_port?: number;
  headless?: boolean;
  args?: string[];
}

export interface ChromeInstance {
  process: ChildProcess;
  cdp_port: number;
  user_data_dir: string;
}

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_USER_DATA_DIR = join(process.env.HOME ?? '/tmp', '.browseagentic', 'chrome-profile');

export function findChromeBinary(): string | null {
  const candidates = [
    // System Chrome
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Try which
  try {
    const { execSync } = require('child_process');
    const result = execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf-8' }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // Not found
  }

  return null;
}

export async function launchChrome(config: ChromeLauncherConfig = {}): Promise<ChromeInstance> {
  const binaryPath = config.binary_path ?? findChromeBinary();
  if (!binaryPath) {
    throw new Error('Chrome binary not found. Set chrome.binary_path in config or install Chrome/Chromium.');
  }

  const cdpPort = config.cdp_port ?? DEFAULT_CDP_PORT;
  const userDataDir = config.user_data_dir ?? DEFAULT_USER_DATA_DIR;
  const headless = config.headless ?? true;

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(headless ? ['--headless=new'] : []),
    ...(config.args ?? []),
  ];

  const child = spawn(binaryPath, args, {
    detached: false,
    stdio: 'ignore',
  });

  child.on('error', (err) => {
    console.error(`[chrome] Launch error: ${err.message}`);
  });

  child.on('exit', (code) => {
    console.error(`[chrome] Process exited with code ${code}`);
  });

  // Wait for CDP to be ready
  await waitForCDP(cdpPort, 10000);

  console.error(`[chrome] Launched on CDP port ${cdpPort}, profile: ${userDataDir}`);

  return {
    process: child,
    cdp_port: cdpPort,
    user_data_dir: userDataDir,
  };
}

async function waitForCDP(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CDP not ready on port ${port} after ${timeoutMs}ms`);
}

export async function connectToChrome(cdpPort: number = DEFAULT_CDP_PORT): Promise<string> {
  try {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    const data = await response.json() as { webSocketDebuggerUrl?: string };
    if (data.webSocketDebuggerUrl) {
      return data.webSocketDebuggerUrl;
    }
    throw new Error('No webSocketDebuggerUrl in /json/version response');
  } catch (err) {
    throw new Error(`Cannot connect to Chrome CDP on port ${cdpPort}: ${err}`);
  }
}
