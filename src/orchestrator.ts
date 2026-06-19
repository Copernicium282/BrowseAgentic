import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowseAgenticConfig, SessionState } from './types.js';
import { randomUUID } from 'crypto';
import { ActCache, CacheStorage } from './cache/index.js';
import { launchChrome, connectViaCDP, isCDPAvailable } from './chrome/index.js';

export class BrowserOrchestrator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private session: SessionState | null = null;
  private config: BrowseAgenticConfig | null = null;
  private actCache: ActCache | null = null;
  private nextTabId = 1;
  private chromeProcess: import('child_process').ChildProcess | null = null;

  async init(config: BrowseAgenticConfig): Promise<void> {
    this.config = config;

    // Try CDP connection first (connect to existing Chrome)
    const cdpPort = config.browser.cdp_port;
    if (cdpPort && await isCDPAvailable(cdpPort)) {
      console.error(`[orchestrator] Connecting to existing Chrome on CDP port ${cdpPort}`);
      const cdp = await connectViaCDP(cdpPort);
      this.browser = cdp.browser;
      this.context = cdp.context;
    } else if (config.browser.chrome_path) {
      // Launch Chrome with custom binary
      console.error(`[orchestrator] Launching Chrome from ${config.browser.chrome_path}`);
      const chrome = await launchChrome({
        binary_path: config.browser.chrome_path,
        headless: config.browser.headless,
        cdp_port: cdpPort ?? 9222,
        args: config.browser.args,
      });
      this.chromeProcess = chrome.process;
      const cdp = await connectViaCDP(chrome.cdp_port);
      this.browser = cdp.browser;
      this.context = cdp.context;
    } else {
      // Default: launch via Playwright
      console.error('[orchestrator] Launching Chrome via Playwright');
      this.browser = await chromium.launch({
        headless: config.browser.headless,
        args: config.browser.args,
        channel: 'chromium',
      });
    }

    const cacheDir = config.cache.backend === 'filesystem' ? config.cache.dir : undefined;
    this.actCache = new ActCache({
      storage: cacheDir ? CacheStorage.create(cacheDir) : CacheStorage.createMemory(),
      domSettleTimeoutMs: config.browser.timeout_ms,
      ttlHours: config.cache.ttl_hours,
      getSelectorForElement: async (_id, _page) => null,
    });

    await this.createSession();
  }

  private async createSession(): Promise<void> {
    if (!this.browser || !this.config) throw new Error('Orchestrator not initialized');

    const sessionId = randomUUID();
    const videoDir = this.config.artifacts.record_video
      ? `${this.config.artifacts.video_dir}/${sessionId}`
      : undefined;

    this.context = await this.browser.newContext({
      viewport: this.config.browser.viewport,
      recordVideo: videoDir ? { dir: videoDir } : undefined,
    });

    const page = await this.context.newPage();
    page.setDefaultTimeout(this.config.browser.timeout_ms);

    const tabId = this.nextTabId++;
    const tabs = new Map<number, Page>();
    tabs.set(tabId, page);

    this.session = {
      session_id: sessionId,
      created_at: Date.now(),
      tabs,
      active_tab_id: tabId,
      console_log_buffer: new Map([[tabId, []]]),
      network_failure_buffer: new Map([[tabId, []]]),
      last_aom_hash: null,
      element_map: new Map(),
      last_modality: null,
    };

    this.setupConsoleCapture(page, tabId);
    this.setupNetworkCapture(page, tabId);
    this.setupPopupCapture();
  }

  private setupConsoleCapture(page: Page, tabId: number): void {
    if (!this.session || !this.config) return;
    if (!this.config.artifacts.capture_console_errors) return;

    const level = this.config.security.console_capture_level ?? 'warning';
    const levelOrder = ['error', 'warning', 'info', 'debug'];
    const thresholdIdx = levelOrder.indexOf(level);

    page.on('console', (msg) => {
      const msgType = msg.type();
      let msgIdx = levelOrder.indexOf(msgType);
      if (msgIdx === -1) msgIdx = 2;
      if (msgIdx <= thresholdIdx) {
        let text = msg.text();
        text = this.redactSecrets(text);
        this.session!.console_log_buffer.get(tabId)?.push(`[${msgType}] ${text}`);
      }
    });
  }

  private setupNetworkCapture(page: Page, tabId: number): void {
    if (!this.session || !this.config) return;
    if (!this.config.artifacts.capture_network_failures) return;

    page.on('requestfailed', (req) => {
      this.session!.network_failure_buffer.get(tabId)?.push(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'request_failed',
        method: req.method(),
        url: req.url(),
        error: req.failure()?.errorText ?? 'unknown',
      }));
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        this.session!.network_failure_buffer.get(tabId)?.push(JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'http_error',
          method: res.request().method(),
          url: res.url(),
          status: res.status(),
          statusText: res.statusText(),
        }));
      }
    });
  }

  private setupPopupCapture(): void {
    if (!this.context || !this.session) return;
    this.context.on('page', (page) => {
      const tabId = this.nextTabId++;
      this.session!.tabs.set(tabId, page);
      this.session!.console_log_buffer.set(tabId, []);
      this.session!.network_failure_buffer.set(tabId, []);
      this.setupConsoleCapture(page, tabId);
      this.setupNetworkCapture(page, tabId);
    });
  }

  async getPage(): Promise<Page> {
    if (!this.session) throw new Error('No active session — call init() first');
    const page = this.session.tabs.get(this.session.active_tab_id);
    if (!page) throw new Error('Active tab not found');
    return page;
  }

  async getSession(): Promise<SessionState> {
    if (!this.session) throw new Error('No active session — call init() first');
    return this.session;
  }

  getActCache(): ActCache | null {
    return this.actCache;
  }

  async openTab(url?: string): Promise<{ tab_id: number; page: Page }> {
    if (!this.context || !this.session) throw new Error('No active session');
    if (this.session.tabs.size >= (this.config?.tabs.max_open_tabs ?? 10)) {
      throw new Error('Maximum tab limit reached');
    }
    const page = await this.context.newPage();
    if (this.config) page.setDefaultTimeout(this.config.browser.timeout_ms);
    const tabId = this.nextTabId++;
    this.session.tabs.set(tabId, page);
    this.session.console_log_buffer.set(tabId, []);
    this.session.network_failure_buffer.set(tabId, []);
    this.setupConsoleCapture(page, tabId);
    this.setupNetworkCapture(page, tabId);
    if (url) await page.goto(url);
    return { tab_id: tabId, page };
  }

  async switchTab(tabId: number): Promise<void> {
    if (!this.session) throw new Error('No active session');
    if (!this.session.tabs.has(tabId)) throw new Error(`Tab ${tabId} not found`);
    this.session.active_tab_id = tabId;
    this.session.last_aom_hash = null;
    this.session.element_map.clear();
  }

  async closeTab(tabId: number): Promise<number[]> {
    if (!this.session) throw new Error('No active session');
    if (this.session.tabs.size <= 1) throw new Error('CANNOT_CLOSE_LAST_TAB');
    const page = this.session.tabs.get(tabId);
    if (page) await page.close().catch(() => {});
    this.session.tabs.delete(tabId);
    this.session.console_log_buffer.delete(tabId);
    this.session.network_failure_buffer.delete(tabId);
    if (this.session.active_tab_id === tabId) {
      this.session.active_tab_id = this.session.tabs.keys().next().value!;
    }
    return Array.from(this.session.tabs.keys());
  }

  async closeSession(): Promise<void> {
    if (this.session) {
      for (const [, page] of this.session.tabs) {
        const video = page.video();
        if (video) {
          const path = await video.path();
          console.error(`[artifacts] Video saved: ${path}`);
        }
        await page.close().catch(() => {});
      }
      this.session.tabs.clear();
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    this.session = null;
  }

  async resetSession(): Promise<void> {
    await this.closeSession();
    await this.createSession();
    this.setupGuardrails();
  }

  async setupGuardrails(): Promise<void> {
    if (!this.context || !this.config) return;
    const guardrails = await import('./security/guardrails.js');
    const isBlocked = guardrails.isBlocked;
    const session = this.session!;

    await this.context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const resourceTypes = ['document', 'script', 'xhr', 'fetch', 'stylesheet', 'image', 'font', 'media'];
      if (resourceTypes.includes(route.request().resourceType())) {
        if (isBlocked(url, this.config!.security)) {
          route.abort('blockedbyclient');
          const activeTabId = session.active_tab_id;
          session.network_failure_buffer.get(activeTabId)?.push(`BLOCKED: ${url.href}`);
          return;
        }
      }
      route.continue();
    });
  }

  redactSecrets(text: string): string {
    if (!this.config?.security.secret_redaction_patterns) return text;
    for (const pattern of this.config.security.secret_redaction_patterns) {
      try {
        const regex = new RegExp(pattern, 'g');
        text = text.replace(regex, '[REDACTED]');
      } catch {
        // Invalid regex, skip
      }
    }
    return text;
  }

  async shutdown(): Promise<void> {
    await this.closeSession();
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const orchestrator = new BrowserOrchestrator();
