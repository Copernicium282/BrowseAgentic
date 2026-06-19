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

  // Color scheme by element type (from playwriter)
  const ROLE_COLORS: Record<string, [string, string, string]> = {
    link: ['#FFF785', '#FFC542', '#E3BE23'],
    button: ['#FFE0B2', '#FFCC80', '#FFB74D'],
    textbox: ['#FFCDD2', '#EF9A9A', '#E57373'],
    combobox: ['#F8BBD0', '#F48FB1', '#F06292'],
    checkbox: ['#C8E6C9', '#A5D6A7', '#81C784'],
    radio: ['#C8E6C9', '#A5D6A7', '#81C784'],
  };
  const DEFAULT_COLORS: [string, string, string] = ['#FFF9C4', '#FFF59D', '#FFEB3B'];

  // Inject overlay divs with ref labels
  const overlayIds: string[] = [];
  for (let i = 0; i < inViewport.length; i++) {
    const { el } = inViewport[i];
    const box = await el.boundingBox();
    if (!box) continue;

    const overlayId = `om-overlay-${i}`;
    const ref = `e${i + 1}`;
    const role = await el.getAttribute('role') ?? '';
    const colors = ROLE_COLORS[role] ?? DEFAULT_COLORS;

    await page.evaluate(
      ({ id, x, y, w, h, lbl, gradTop, gradBottom, border }) => {
        const div = document.createElement('div');
        div.id = id;
        div.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: ${w}px;
          height: ${h}px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid ${border};
          z-index: 999999;
          pointer-events: none;
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
        `;
        const badge = document.createElement('span');
        badge.style.cssText = `
          background: linear-gradient(to bottom, ${gradTop} 0%, ${gradBottom} 100%);
          color: black;
          font: bold 12px Helvetica, Arial, sans-serif;
          padding: 1px 4px;
          border-radius: 3px;
          border: 1px solid ${border};
          line-height: 16px;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
        `;
        badge.textContent = lbl;
        div.appendChild(badge);
        document.body.appendChild(div);
      },
      { id: overlayId, x: box.x, y: box.y, w: box.width, h: box.height, lbl: ref, gradTop: colors[0], gradBottom: colors[1], border: colors[2] },
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
