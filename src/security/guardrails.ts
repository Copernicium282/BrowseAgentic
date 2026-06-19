import type { BrowseAgenticConfig } from '../types.js';

export function isBlocked(url: URL, config: BrowseAgenticConfig): boolean {
  const { security, dev_mode } = config;
  const hostname = url.hostname;
  const port = parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  // Dev mode: check allowlist BEFORE block_localhost
  if (dev_mode?.enabled) {
    if (isDevModeAllowed(hostname, port, dev_mode)) {
      console.error(`[guardrails] DEV MODE: permitting ${url.href} (would otherwise be blocked)`);
      return false;
    }
  }

  if (security.block_localhost) {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return true;
    }
    if (isPrivateIP(hostname)) return true;
  }

  if (security.allowed_domains.length > 0) {
    if (!security.allowed_domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      return true;
    }
  }

  if (security.blocked_domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return true;
  }

  return false;
}

function isDevModeAllowed(hostname: string, port: number, devMode: BrowseAgenticConfig['dev_mode']): boolean {
  // Check if hostname is in allowed_local_hosts
  const hostAllowed = devMode.allowed_local_hosts.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  );
  if (!hostAllowed) return false;

  // If allowed_local_ports is empty, all ports allowed for this host
  if (devMode.allowed_local_ports.length === 0) return true;

  // Check if port is in allowed_local_ports
  return devMode.allowed_local_ports.includes(port);
}

function isPrivateIP(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;

  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = nums;

  if (a === 192 && b === 168) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}
