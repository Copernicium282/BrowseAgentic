import type { Modality, ObservationPayload } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';
import { translatePage } from '../translation/index.js';
import { applyBudget, DEFAULT_MAX_ELEMENTS, DEFAULT_MAX_TEXT_LENGTH, DEFAULT_RESPONSE_BUDGET } from '../cache/budget.js';

export interface ObserveInput {
  modality: Modality;
  viewport_only?: boolean;
  compact?: boolean;
  depth?: number;
}

export async function handleObserve(
  orchestrator: BrowserOrchestrator,
  input: ObserveInput,
): Promise<ObservationPayload> {
  const page = await orchestrator.getPage();
  const session = await orchestrator.getSession();
  const viewportOnly = input.viewport_only ?? true;
  const compact = input.compact ?? false;

  let result = await translatePage(page, session, input.modality, viewportOnly, compact, input.depth);
  session.last_modality = input.modality;

  // Apply response budget
  if (result.aom_nodes && result.aom_nodes.length > DEFAULT_MAX_ELEMENTS) {
    result.aom_nodes = result.aom_nodes.slice(0, DEFAULT_MAX_ELEMENTS);
    result.aom_nodes.push({
      agent_id: -1, ref: '', role: 'note',
      name: `...${result.aom_nodes.length} more elements truncated. Use depth or compact mode to narrow scope.`,
      state: { disabled: false, focused: false },
      rect: { x: 0, y: 0, width: 0, height: 0 },
      is_fallback_translated: false,
    });
  }

  if (result.aom_markdown) {
    const budgeted = applyBudget(result.aom_markdown, DEFAULT_RESPONSE_BUDGET);
    if (budgeted.truncated) {
      result.aom_markdown = budgeted.value;
    }
  }

  return result;
}
