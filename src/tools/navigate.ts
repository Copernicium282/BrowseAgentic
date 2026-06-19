import type { BrowseAgenticConfig } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';

export interface NavigateInput {
  url: string;
  wait_until?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface NavigateResult {
  success: boolean;
  url?: string;
  title?: string;
  status_code?: number;
  error?: string;
  reason?: string;
  hint?: string;
  elapsed_ms?: number;
}

export async function handleNavigate(
  orchestrator: BrowserOrchestrator,
  config: BrowseAgenticConfig,
  input: NavigateInput,
): Promise<NavigateResult> {
  if (!input.url.startsWith('http://') && !input.url.startsWith('https://')) {
    return { success: false, error: 'INVALID_URL', reason: 'URL must start with http:// or https://' };
  }

  const url = new URL(input.url);
  const { isBlocked } = await import('../security/guardrails.js');
  if (isBlocked(url, config)) {
    return { success: false, error: 'BLOCKED', reason: `URL ${input.url} blocked by security guardrails` };
  }

  const page = await orchestrator.getPage();
  const waitUntil = input.wait_until ?? 'networkidle';
  const start = Date.now();

  try {
    const response = await page.goto(input.url, { waitUntil, timeout: config.browser.timeout_ms });
    const elapsed = Date.now() - start;

    if (!response) {
      return {
        success: false,
        error: 'TIMEOUT',
        elapsed_ms: elapsed,
        hint: 'Navigation timed out. Try wait_until: domcontentloaded.',
      };
    }

    return {
      success: true,
      url: page.url(),
      title: await page.title(),
      status_code: response.status(),
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    if (waitUntil === 'networkidle' && msg.includes('Timeout')) {
      try {
        const response = await page.goto(input.url, {
          waitUntil: 'domcontentloaded',
          timeout: config.browser.timeout_ms,
        });
        return {
          success: true,
          url: page.url(),
          title: await page.title(),
          status_code: response?.status() ?? 0,
          hint: 'Fell back to domcontentloaded due to networkidle timeout.',
        };
      } catch {
        return { success: false, error: 'TIMEOUT', elapsed_ms: elapsed };
      }
    }

    return { success: false, error: 'TIMEOUT', elapsed_ms: elapsed };
  }
}
