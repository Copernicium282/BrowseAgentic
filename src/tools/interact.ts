import type { ActionType, AOMNode, Modality } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';

export interface InteractInput {
  action: ActionType;
  ref: string;
  value?: string;
  instruction?: string;
}

export interface InteractResult {
  success: boolean;
  action_performed?: string;
  ref?: string;
  console_alerts_since_action?: string[];
  network_alerts_since_action?: string[];
  hint?: string;
  error?: string;
  dom_changed?: boolean;
  snapshot?: string;
  cache_hit?: boolean;
}

export async function handleInteract(
  orchestrator: BrowserOrchestrator,
  input: InteractInput,
): Promise<InteractResult> {
  const page = await orchestrator.getPage();
  const session = await orchestrator.getSession();
  const cache = orchestrator.getActCache();

  // Try cache hit if instruction provided
  if (cache?.enabled && input.instruction) {
    const context = await cache.prepareContext(input.instruction, page);
    if (context) {
      const cached = await cache.tryReplay(context, page);
      if (cached?.success) {
        const snapshot = await takeSnapshot(page, session, session.last_modality ?? 'text');
        return {
          success: true,
          action_performed: input.action,
          ref: input.ref,
          cache_hit: true,
          hint: 'Cache hit — action replayed from cache.',
          snapshot,
        };
      }
    }
  }

  const elementEntry = session.element_map.get(input.ref);
  if (!elementEntry) {
    return {
      success: false,
      error: 'ELEMENT_NOT_FOUND',
      hint: `Ref "${input.ref}" not found. Try capturing new snapshot.`,
    };
  }

  const tabId = session.active_tab_id;
  const consoleBuf = session.console_log_buffer.get(tabId) ?? [];
  const networkBuf = session.network_failure_buffer.get(tabId) ?? [];
  const consoleBefore = consoleBuf.length;
  const networkBefore = networkBuf.length;

  try {
    const selector = elementEntry.selector ?? buildFallbackSelector(elementEntry.rect);
    const el = page.locator(selector).first();

    switch (input.action) {
      case 'click':
        await el.click({ timeout: 5000 });
        break;
      case 'type':
        if (!input.value) {
          return { success: false, error: 'INVALID_INPUT', hint: 'value is required for type action' };
        }
        await el.fill(input.value, { timeout: 5000 });
        break;
      case 'hover':
        await el.hover({ timeout: 5000 });
        break;
      case 'clear':
        await el.fill('', { timeout: 5000 });
        break;
    }

    // Store successful action in cache
    if (cache?.enabled && input.instruction) {
      const context = await cache.prepareContext(input.instruction, page);
      if (context) {
        const methodMap: Record<string, string> = { click: 'click', type: 'fill', hover: 'hover', clear: 'fill' };
        await cache.store(context, {
          success: true,
          actions: [{
            selector,
            method: methodMap[input.action] ?? input.action,
            arguments: input.value ? [input.value] : [],
            description: input.instruction,
          }],
        });
      }
    }

    const consoleAlerts = consoleBuf.splice(consoleBefore);
    const networkAlerts = networkBuf.splice(networkBefore);
    const domChanged = await checkStaleness(page, session);
    const snapshot = await takeSnapshot(page, session, session.last_modality ?? 'text');

    return {
      success: true,
      action_performed: input.action,
      ref: input.ref,
      console_alerts_since_action: consoleAlerts,
      network_alerts_since_action: networkAlerts,
      dom_changed: domChanged,
      hint: domChanged ? 'DOM changed significantly. Call observe_page to get fresh refs.' : 'Call observe_page to verify the new state.',
      snapshot,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timeout') || msg.includes('Timeout')) {
      return { success: false, error: 'ELEMENT_OBSCURED', hint: 'Element may be covered by an overlay. Observe the page to identify and dismiss it.' };
    }
    return { success: false, error: 'INTERACT_ERROR', hint: msg };
  }
}

async function takeSnapshot(page: import('playwright').Page, session: import('../types.js').SessionState, modality: Modality): Promise<string | undefined> {
  if (modality === 'text') {
    const { extractAOM } = await import('../translation/aom.js');
    const { snapshot } = await extractAOM(page, session);
    return snapshot;
  }
  const { captureVision } = await import('../translation/vision.js');
  const vision = await captureVision(page, session);
  return vision.image_base64;
}

function buildFallbackSelector(rect: AOMNode['rect']): string {
  return `::-p-xywh(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)})`;
}

async function checkStaleness(page: import('playwright').Page, session: import('../types.js').SessionState): Promise<boolean> {
  if (!session.last_aom_hash) return false;
  try {
    const cdp = await page.context().newCDPSession(page);
    const result = await cdp.send('Accessibility.getFullAXTree') as { nodes: Array<{ role?: string; name?: string }> };
    await cdp.detach();
    const quickHash = result.nodes
      .filter((n) => n.role && n.name)
      .map((n) => `${n.role}:${n.name}`)
      .join('|')
      .split('')
      .reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)
      .toString(36);
    return quickHash !== session.last_aom_hash;
  } catch {
    return false;
  }
}
