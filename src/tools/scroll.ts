import type { ScrollDirection } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';

export interface ScrollInput {
  direction: ScrollDirection;
  amount_pixels?: number;
}

export interface ScrollResult {
  success: boolean;
  scrolled_by_pixels?: number;
  hint?: string;
  error?: string;
}

export async function handleScroll(
  orchestrator: BrowserOrchestrator,
  input: ScrollInput,
): Promise<ScrollResult> {
  const page = await orchestrator.getPage();
  const amount = input.amount_pixels ?? 800;

  try {
    switch (input.direction) {
      case 'down':
        await page.mouse.wheel(0, amount);
        break;
      case 'up':
        await page.mouse.wheel(0, -amount);
        break;
      case 'right':
        await page.mouse.wheel(amount, 0);
        break;
      case 'left':
        await page.mouse.wheel(-amount, 0);
        break;
    }

    return {
      success: true,
      scrolled_by_pixels: amount,
      hint: 'Call observe_page after scrolling to update element IDs.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: 'SCROLL_ERROR',
      hint: err instanceof Error ? err.message : String(err),
    };
  }
}
