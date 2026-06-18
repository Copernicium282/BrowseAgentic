import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { OmniBrowserConfig, SessionState, AOMNode } from './types.js';
import { randomUUID } from 'crypto';

export class BrowserOrchestrator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private session: SessionState | null = null;
  private config: OmniBrowserConfig | null = null;

  async init(config: OmniBrowserConfig): Promise<void> {
    this.config = config;
    this.browser = await chromium.launch({
      headless: config.browser.headless,
      args: config.browser.args,
      channel: 'chromium',
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

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.browser.timeout_ms);

    this.session = {
      session_id: sessionId,
      created_at: Date.now(),
      console_log_buffer: [],
      network_failure_buffer: [],
      last_aom_hash: null,
      element_map: new Map(),
    };

    this.setupConsoleCapture();
    this.setupNetworkCapture();
  }

  private setupConsoleCapture(): void {
    if (!this.page || !this.session || !this.config) return;
    if (!this.config.artifacts.capture_console_errors) return;

    this.page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        this.session!.console_log_buffer.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
  }

  private setupNetworkCapture(): void {
    if (!this.page || !this.session || !this.config) return;
    if (!this.config.artifacts.capture_network_failures) return;

    this.page.on('requestfailed', (req) => {
      this.session!.network_failure_buffer.push(
        `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`
      );
    });

    this.page.on('response', (res) => {
      if (res.status() >= 400) {
        this.session!.network_failure_buffer.push(
          `${res.request().method()} ${res.url()} — HTTP ${res.status()}`
        );
      }
    });
  }

  async getPage(): Promise<Page> {
    if (!this.page) throw new Error('No active page — call init() first');
    return this.page;
  }

  async getSession(): Promise<SessionState> {
    if (!this.session) throw new Error('No active session — call init() first');
    return this.session;
  }

  async closeSession(): Promise<void> {
    if (this.page) {
      const video = this.page.video();
      if (video) {
        const path = await video.path();
        console.error(`[artifacts] Video saved: ${path}`);
      }
      await this.page.close().catch(() => {});
      this.page = null;
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
      if (route.request().resourceType() === 'document' || route.request().resourceType() === 'script' || route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch' || route.request().resourceType() === 'stylesheet' || route.request().resourceType() === 'image' || route.request().resourceType() === 'font' || route.request().resourceType() === 'media') {
        if (isBlocked(url, this.config!.security)) {
          route.abort('blockedbyclient');
          session.network_failure_buffer.push(`BLOCKED: ${url.href}`);
          return;
        }
      }
      route.continue();
    });
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
