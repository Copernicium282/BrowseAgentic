import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface CDPConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function connectViaCDP(cdpPort: number = 9222): Promise<CDPConnection> {
  const cdpUrl = `http://127.0.0.1:${cdpPort}`;

  // Verify CDP is available
  try {
    const response = await fetch(`${cdpUrl}/json/version`);
    if (!response.ok) {
      throw new Error(`CDP not available: ${response.status}`);
    }
  } catch (err) {
    throw new Error(`Cannot connect to Chrome CDP on port ${cdpPort}. Is Chrome running with --remote-debugging-port=${cdpPort}?`);
  }

  // Connect via Playwright's connectOverCDP
  const browser = await chromium.connectOverCDP(cdpUrl);

  // Get or create context
  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

  // Get or create page
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { browser, context, page };
}

export async function isCDPAvailable(port: number = 9222): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
