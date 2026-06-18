import type { ActionType, AOMNode } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';

export interface InteractInput {
  action: ActionType;
  element_id: number;
  value?: string;
}

export interface InteractResult {
  success: boolean;
  action_performed?: string;
  element_id?: number;
  console_alerts_since_action?: string[];
  network_alerts_since_action?: string[];
  hint?: string;
  error?: string;
  dom_changed?: boolean;
}

export async function handleInteract(
  orchestrator: BrowserOrchestrator,
  input: InteractInput,
): Promise<InteractResult> {
  const page = await orchestrator.getPage();
  const session = await orchestrator.getSession();

  // Check element exists in map
  const elementEntry = session.element_map.get(input.element_id);
  if (!elementEntry) {
    return {
      success: false,
      error: 'ELEMENT_NOT_FOUND',
      hint: `Element ID ${input.element_id} not found. Call observe_page to get fresh element IDs.`,
    };
  }

  // Clear alert buffers before action
  const consoleBefore = session.console_log_buffer.length;
  const networkBefore = session.network_failure_buffer.length;

  try {
    const selector = buildInteractSelector(input.element_id, elementEntry);
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

    // Drain alert buffers
    const consoleAlerts = session.console_log_buffer.splice(consoleBefore);
    const networkAlerts = session.network_failure_buffer.splice(networkBefore);

    // Check for DOM staleness
    const domChanged = await checkStaleness(page, session);

    return {
      success: true,
      action_performed: input.action,
      element_id: input.element_id,
      console_alerts_since_action: consoleAlerts,
      network_alerts_since_action: networkAlerts,
      dom_changed: domChanged,
      hint: domChanged ? 'DOM changed significantly. Call observe_page to get fresh element IDs.' : 'Call observe_page to verify the new state.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timeout') || msg.includes('Timeout')) {
      return { success: false, error: 'ELEMENT_OBSCURED', hint: 'Element may be covered by an overlay. Observe the page to identify and dismiss it.' };
    }
    return { success: false, error: 'INTERACT_ERROR', hint: msg };
  }
}

function buildInteractSelector(elementId: number, entry: { selector?: string; rect: AOMNode['rect'] }): string {
  if (entry.selector) return entry.selector;
  // Fallback to coordinates
  return `::-p-xpath(//*)[${`position()=1`}]/..`;
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

    // If hash differs significantly, DOM changed
    return quickHash !== session.last_aom_hash;
  } catch {
    return false;
  }
}
