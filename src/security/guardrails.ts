import type { BrowseAgenticConfig } from '../types.js';

export function isBlocked(url: URL, security: BrowseAgenticConfig['security']): boolean {
  const hostname = url.hostname;

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
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
