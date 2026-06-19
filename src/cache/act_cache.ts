import { createHash } from 'crypto';
import type { Page } from 'playwright';
import { CacheStorage } from './storage.js';
import { normalizeUrlForCacheKey, waitForCachedSelector, substituteVariablesInArguments } from './utils.js';

export interface CachedAction {
  selector: string;
  method: string;
  arguments: string[];
  description?: string;
}

export interface CachedActEntry {
  version: 1;
  instruction: string;
  url: string;
  variableKeys: string[];
  actions: CachedAction[];
}

export interface ActCacheContext {
  instruction: string;
  cacheKey: string;
  pageUrl: string;
  variableKeys: string[];
  variables?: Record<string, string>;
}

export interface ActResult {
  success: boolean;
  actions?: CachedAction[];
  message?: string;
  error?: string;
}

export class ActCache {
  private storage: CacheStorage;
  private domSettleTimeoutMs: number;
  private getSelectorForElement: (elementId: number, page: Page) => Promise<string | null>;

  constructor(opts: {
    storage: CacheStorage;
    domSettleTimeoutMs?: number;
    getSelectorForElement: (elementId: number, page: Page) => Promise<string | null>;
  }) {
    this.storage = opts.storage;
    this.domSettleTimeoutMs = opts.domSettleTimeoutMs ?? 15000;
    this.getSelectorForElement = opts.getSelectorForElement;
  }

  get enabled(): boolean {
    return this.storage.enabled;
  }

  async prepareContext(
    instruction: string,
    page: Page,
    variables?: Record<string, string>,
  ): Promise<ActCacheContext | null> {
    if (!this.enabled) return null;

    const sanitizedInstruction = instruction.trim();
    const variableKeys = variables ? Object.keys(variables).sort() : [];
    const pageUrl = await safeGetPageUrl(page);

    return {
      instruction: sanitizedInstruction,
      cacheKey: this.buildCacheKey(sanitizedInstruction, normalizeUrlForCacheKey(pageUrl), variableKeys),
      pageUrl,
      variableKeys,
      variables,
    };
  }

  async tryReplay(
    context: ActCacheContext,
    page: Page,
  ): Promise<ActResult | null> {
    if (!this.enabled) return null;

    const { value: entry, error } = await this.storage.readJson<CachedActEntry>(`${context.cacheKey}.json`);
    if (error || !entry) return null;
    if (entry.version !== 1) return null;
    if (!Array.isArray(entry.actions) || entry.actions.length === 0) return null;

    // Validate variable keys match
    const entryKeys = [...entry.variableKeys].sort();
    const contextKeys = [...context.variableKeys];
    if (JSON.stringify(entryKeys) !== JSON.stringify(contextKeys)) return null;

    // Validate variable values present
    if (contextKeys.length > 0 && (!context.variables || !this.hasAllValues(contextKeys, context.variables))) {
      return null;
    }

    return this.replayActions(context, entry, page);
  }

  async store(context: ActCacheContext, result: ActResult): Promise<void> {
    if (!this.enabled) return;
    if (!result.success || !result.actions || result.actions.length === 0) return;

    const entry: CachedActEntry = {
      version: 1,
      instruction: context.instruction,
      url: context.pageUrl,
      variableKeys: context.variableKeys,
      actions: result.actions,
    };

    await this.storage.writeJson(`${context.cacheKey}.json`, entry);
  }

  private async replayActions(
    context: ActCacheContext,
    entry: CachedActEntry,
    page: Page,
  ): Promise<ActResult> {
    const results: CachedAction[] = [];

    for (const action of entry.actions) {
      await waitForCachedSelector({ page, selector: action.selector, timeout: this.domSettleTimeoutMs });

      const resolvedArgs = substituteVariablesInArguments(action.arguments, context.variables);

      try {
        await this.executeAction(page, action.method, action.selector, resolvedArgs ?? []);
        results.push({
          selector: action.selector,
          method: action.method,
          arguments: action.arguments, // Store original placeholders
          description: action.description,
        });
      } catch {
        // Self-heal: try to find the element again
        const healed = await this.selfHeal(page, action);
        if (healed) {
          results.push(healed);
        } else {
          return { success: false, actions: results, message: `Failed at action: ${action.method} ${action.description ?? action.selector}` };
        }
      }
    }

    // Check if selectors changed and refresh cache
    if (this.haveActionsChanged(entry.actions, results)) {
      await this.refreshCache(context, { ...entry, actions: results });
    }

    return { success: true, actions: results, message: `Replayed ${results.length} cached actions` };
  }

  private async selfHeal(page: Page, action: CachedAction): Promise<CachedAction | null> {
    // Take fresh snapshot and ask LLM to find the element
    // For MVP, we try a simple selector heuristic
    const description = action.description ?? action.method;
    const selector = await this.getSelectorForElement(0, page); // Placeholder

    if (!selector) return null;

    try {
      const resolvedArgs = substituteVariablesInArguments(action.arguments, undefined);
      await this.executeAction(page, action.method, selector, resolvedArgs ?? []);
      return {
        selector,
        method: action.method,
        arguments: action.arguments,
        description: action.description,
      };
    } catch {
      return null;
    }
  }

  private async executeAction(page: Page, method: string, selector: string, args: string[]): Promise<void> {
    const el = page.locator(selector).first();
    switch (method) {
      case 'click':
        await el.click({ timeout: 5000 });
        break;
      case 'fill':
        await el.fill(args[0] ?? '', { timeout: 5000 });
        break;
      case 'type':
        await el.pressSequentially(args[0] ?? '', { timeout: 5000 });
        break;
      case 'hover':
        await el.hover({ timeout: 5000 });
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private haveActionsChanged(original: CachedAction[], updated: CachedAction[]): boolean {
    if (original.length !== updated.length) return true;
    for (let i = 0; i < original.length; i++) {
      if (original[i].selector !== updated[i].selector) return true;
      if (original[i].method !== updated[i].method) return true;
    }
    return false;
  }

  private async refreshCache(context: ActCacheContext, entry: CachedActEntry): Promise<void> {
    await this.storage.writeJson(`${context.cacheKey}.json`, entry);
  }

  private buildCacheKey(instruction: string, url: string, variableKeys: string[]): string {
    const payload = JSON.stringify({ instruction, url, variableKeys });
    return createHash('sha256').update(payload).digest('hex');
  }

  private hasAllValues(keys: string[], variables: Record<string, string>): boolean {
    return keys.every((k) => k in variables);
  }
}

async function safeGetPageUrl(page: Page): Promise<string> {
  try {
    return page.url();
  } catch {
    return '';
  }
}
