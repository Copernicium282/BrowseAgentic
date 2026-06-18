import type { Page, ElementHandle } from 'playwright';
import type { AOMNode, SessionState } from '../types.js';

const INTERACTIVE_SELECTORS = [
  'a', 'button', 'input', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="menuitem"]', '[role="tab"]', '[role="searchbox"]',
  '[tabindex]',
];

const MAX_LINEAR_PX = 1568;
const MAX_PIXELS = 1.15 * 1024 * 1024;

export async function captureVision(
  page: Page,
  session: SessionState,
): Promise<{ image_base64: string; image_width: number; image_height: number; element_map: Map<string, AOMNode> }> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };

  const selector = INTERACTIVE_SELECTORS.join(', ');
  const elements = await page.$$(selector);

  const inViewport: Array<{ el: ElementHandle; index: number }> = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const box = await el.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      if (box.x + box.width > 0 && box.y + box.height > 0 && box.x < viewport.width && box.y < viewport.height) {
        inViewport.push({ el, index: i });
      }
    }
  }

  // Inject overlay divs with ref labels
  const overlayIds: string[] = [];
  for (let i = 0; i < inViewport.length; i++) {
    const { el } = inViewport[i];
    const box = await el.boundingBox();
    if (!box) continue;

    const overlayId = `om-overlay-${i}`;
    const ref = `e${i + 1}`;

    await page.evaluate(
      ({ id, x, y, w, h, lbl }) => {
        const div = document.createElement('div');
        div.id = id;
        div.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: ${w}px;
          height: ${h}px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid #000;
          z-index: 999999;
          pointer-events: none;
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
        `;
        const badge = document.createElement('span');
        badge.style.cssText = `
          background: #000;
          color: #fff;
          font: bold 12px monospace;
          padding: 1px 4px;
          border-radius: 2px;
          line-height: 16px;
        `;
        badge.textContent = lbl;
        div.appendChild(badge);
        document.body.appendChild(div);
      },
      { id: overlayId, x: box.x, y: box.y, w: box.width, h: box.height, lbl: ref },
    );

    overlayIds.push(overlayId);
  }

  // Take screenshot
  let screenshot = await page.screenshot({ type: 'jpeg', quality: 80 });

  // Scale image for vision model compatibility
  screenshot = scaleImage(screenshot, viewport.width, viewport.height);

  const image_base64 = screenshot.toString('base64');

  // Clean up overlays
  for (const id of overlayIds) {
    await page.evaluate((overlayId) => {
      const el = document.getElementById(overlayId);
      if (el) el.remove();
    }, id);
  }

  // Build element map with refs
  const elementMap = new Map<string, AOMNode>();
  for (let i = 0; i < inViewport.length; i++) {
    const { el } = inViewport[i];
    const box = await el.boundingBox();
    if (!box) continue;

    const role = await el.getAttribute('role') ?? guessRole(await el.evaluate((e: HTMLElement) => e.tagName));
    const name = (await el.textContent()) ?? (await el.getAttribute('aria-label')) ?? '';
    const value = await el.getAttribute('value') ?? undefined;
    const ref = `e${i + 1}`;

    const node: AOMNode = {
      agent_id: i + 1,
      ref,
      role,
      name: name.trim().slice(0, 100),
      value: value ?? undefined,
      state: {
        disabled: await el.isDisabled(),
        focused: false,
      },
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      is_fallback_translated: false,
    };

    elementMap.set(ref, node);
    session.element_map.set(ref, { rect: node.rect });
  }

  return {
    image_base64,
    image_width: viewport.width,
    image_height: viewport.height,
    element_map: elementMap,
  };
}

function scaleImage(buffer: Buffer, width: number, height: number): Buffer {
  const pixels = width * height;
  const shrink = Math.min(MAX_LINEAR_PX / width, MAX_LINEAR_PX / height, Math.sqrt(MAX_PIXELS / pixels));
  if (shrink > 1) return buffer;
  // For MVP, return original — Playwright's JPEG quality already compresses
  // Full scaling would require sharp/canvas dependency
  return buffer;
}

function guessRole(tagName: string): string {
  const tag = tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  return 'element';
}
