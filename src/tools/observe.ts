import type { Modality, ObservationPayload } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';
import { translatePage } from '../translation/index.js';

export interface ObserveInput {
  modality: Modality;
  viewport_only?: boolean;
}

export async function handleObserve(
  orchestrator: BrowserOrchestrator,
  input: ObserveInput,
): Promise<ObservationPayload> {
  const page = await orchestrator.getPage();
  const session = await orchestrator.getSession();
  const viewportOnly = input.viewport_only ?? true;

  return translatePage(page, session, input.modality, viewportOnly);
}
