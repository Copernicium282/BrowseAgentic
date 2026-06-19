import type { Page } from 'playwright';
import type { Modality, ObservationPayload, SessionState } from '../types.js';
import { extractAOM } from './aom.js';
import { captureVision } from './vision.js';

export async function translatePage(
  page: Page,
  session: SessionState,
  modality: Modality,
  viewportOnly: boolean,
  compact: boolean,
  depth?: number,
): Promise<ObservationPayload> {
  const url = page.url();
  const title = await page.title();
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };

  const base: ObservationPayload = {
    url,
    title,
    modality,
    viewport,
    console_alerts: [...session.console_log_buffer],
    network_alerts: [...session.network_failure_buffer],
  };

  if (modality === 'text') {
    const { nodes, snapshot } = await extractAOM(page, session, compact, depth);
    return { ...base, aom_nodes: nodes, aom_markdown: snapshot };
  }

  const vision = await captureVision(page, session);
  return {
    ...base,
    image_base64: vision.image_base64,
    image_width: vision.image_width,
    image_height: vision.image_height,
  };
}
