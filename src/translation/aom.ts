import type { Page } from 'playwright';
import type { AOMNode, SessionState } from '../types.js';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
  'menuitem', 'tab', 'searchbox', 'spinbutton', 'slider',
]);

const VISIBLE_ATTRS = new Set([
  'id', 'name', 'role', 'aria-label', 'value', 'checked', 'disabled', 'placeholder', 'href', 'type',
]);

interface AXNode {
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  focused?: boolean;
  checked?: boolean;
  expanded?: boolean;
  children?: AXNode[];
  backendDOMNodeId?: number;
}

interface Rect { x: number; y: number; width: number; height: number }

export async function extractAOM(
  page: Page,
  session: SessionState,
  compact = false,
): Promise<{ nodes: AOMNode[]; markdown: string; hash: string }> {
  const cdp = await page.context().newCDPSession(page);

  // Get accessibility tree
  const axResult = await cdp.send('Accessibility.getFullAXTree') as { nodes: AXNode[] };

  // Paint order data — simplified for MVP, uses heuristic occlusion
  let paintOrders: Map<number, number> = new Map();
  try {
    const snapResult = await cdp.send('DOMSnapshot.captureSnapshot' as never, {
      includePaintOrder: true,
      includeDOMRects: true,
      computedStyles: [],
    } as never) as unknown as { documents?: Array<{ nodes: { paintOrders?: number[] } }> };
    if (snapResult.documents?.[0]?.nodes?.paintOrders) {
      const orders = snapResult.documents[0].nodes.paintOrders;
      for (let i = 0; i < orders.length; i++) {
        paintOrders.set(i, orders[i]);
      }
    }
  } catch {
    // Paint order not available on some pages
  }

  // Get cursor-interactive elements via JS injection
  const cursorInteractive = await detectCursorInteractive(page);

  await cdp.detach();

  // Build nodes from AX tree
  const rawNodes: AOMNode[] = [];
  for (const axNode of axResult.nodes) {
    collectNodes(axNode, rawNodes);
  }

  // Get bounding boxes
  for (const node of rawNodes) {
    const selector = buildSelector(node);
    if (selector) {
      try {
        const el = page.locator(selector).first();
        const box = await el.boundingBox();
        if (box) {
          node.rect = { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      } catch {
        // Skip
      }
    }
  }

  // Filter: valid rects only
  let nodes = rawNodes.filter((n) => n.rect.width > 0 && n.rect.height > 0);

  // Paint-order filtering: remove occluded elements
  nodes = filterByPaintOrder(nodes, paintOrders);

  // Bounding-box containment: parent absorbs children
  nodes = filterByContainment(nodes);

  // Cursor-interactive: add elements found by JS detection
  for (const ci of cursorInteractive) {
    if (!nodes.some((n) => Math.abs(n.rect.x - ci.rect.x) < 2 && Math.abs(n.rect.y - ci.rect.y) < 2)) {
      nodes.push(ci);
    }
  }

  // Assign refs and populate element_map
  session.element_map.clear();
  nodes.forEach((n, i) => {
    n.agent_id = i + 1;
    n.ref = `e${i + 1}`;
    const selector = buildSelector(n);
    session.element_map.set(n.ref, { selector: selector ?? undefined, rect: n.rect });
  });

  const markdown = buildMarkdown(nodes, compact);
  const hash = computeHash(nodes);
  session.last_aom_hash = hash;

  return { nodes, markdown, hash };
}

function collectNodes(node: AXNode, result: AOMNode[]): void {
  const role = node.role ?? '';
  const isInteractive = INTERACTIVE_ROLES.has(role);
  const isMedia = role === 'img' || role === 'figure';

  if (isInteractive || isMedia) {
    result.push({
      agent_id: 0,
      ref: '',
      role,
      name: node.name ?? '',
      value: node.value,
      description: isMedia ? '[Image: no description available]' : node.description,
      placeholder: undefined,
      state: {
        disabled: node.disabled ?? false,
        focused: node.focused ?? false,
        checked: node.checked,
        expanded: node.expanded,
      },
      rect: { x: 0, y: 0, width: 0, height: 0 },
      is_fallback_translated: false,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      collectNodes(child, result);
    }
  }
}

function buildSelector(node: AOMNode): string | null {
  if (node.role === 'link' && node.name) return `a:has-text("${node.name}")`;
  if (node.role === 'button' && node.name) return `button:has-text("${node.name}")`;
  if ((node.role === 'textbox' || node.role === 'searchbox') && node.name) return `input[placeholder="${node.name}"]`;
  if (node.role === 'checkbox') return `input[type="checkbox"]`;
  if (node.role === 'radio') return `input[type="radio"]`;
  if (node.role === 'combobox') return `select`;
  if (node.role === 'img') return `img`;
  if (node.role === 'figure') return `figure`;
  return null;
}

function filterByPaintOrder(
  nodes: AOMNode[],
  paintOrders: Map<number, number>,
): AOMNode[] {
  if (paintOrders.size === 0) return nodes;
  // Heuristic: elements with high paint order overlapping lower ones are likely overlays
  // For MVP, keep all nodes — full occlusion logic deferred
  return nodes;
}

function filterByContainment(nodes: AOMNode[]): AOMNode[] {
  const clickableRoles = new Set(['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab']);
  const result: AOMNode[] = [];

  for (const node of nodes) {
    const isClickable = clickableRoles.has(node.role);
    if (isClickable) {
      // Check if any other node is fully contained within this one
      const children = nodes.filter(
        (other) =>
          other !== node &&
          other.rect.x >= node.rect.x &&
          other.rect.y >= node.rect.y &&
          other.rect.x + other.rect.width <= node.rect.x + node.rect.width &&
          other.rect.y + other.rect.height <= node.rect.y + node.rect.height,
      );
      // Keep parent, skip contained children
      for (const child of children) {
        const idx = nodes.indexOf(child);
        if (idx !== -1) nodes[idx] = null as unknown as AOMNode; // mark for removal
      }
      result.push(node);
    } else if (node !== null) {
      result.push(node);
    }
  }

  return result.filter(Boolean);
}

async function detectCursorInteractive(page: Page): Promise<AOMNode[]> {
  try {
    const elements = await page.evaluate(() => {
      const results: Array<{ x: number; y: number; width: number; height: number; tag: string; role: string; text: string }> = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const style = window.getComputedStyle(el);
        const isPointer = style.cursor === 'pointer';
        const hasClick = typeof (el as HTMLElement).onclick === 'function';
        const hasTabindex = el.hasAttribute('tabindex');
        const hasContentEditable = el.getAttribute('contenteditable') === 'true';
        const hasPseudo = window.getComputedStyle(el, '::before').content !== 'none' ||
                          window.getComputedStyle(el, '::after').content !== 'none';

        if ((isPointer || hasClick || hasTabindex || hasContentEditable) && (hasPseudo || isPointer)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') ?? '',
              text: (el.textContent ?? '').trim().slice(0, 100),
            });
          }
        }
      }
      return results;
    });

    return elements.map((e) => ({
      agent_id: 0,
      ref: '',
      role: e.role || guessRole(e.tag),
      name: e.text,
      state: { disabled: false, focused: false },
      rect: { x: e.x, y: e.y, width: e.width, height: e.height },
      is_fallback_translated: false,
    }));
  } catch {
    return [];
  }
}

function guessRole(tag: string): string {
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  return 'element';
}

function buildMarkdown(nodes: AOMNode[], compact: boolean): string {
  return nodes
    .filter((n) => !compact || INTERACTIVE_ROLES.has(n.role))
    .map((n) => {
      const parts: string[] = [];
      if (compact) {
        parts.push(`[${n.ref}] ${n.role}: "${n.name}"`);
      } else {
        const valuePart = n.value !== undefined ? ` (value: "${n.value}")` : '';
        const descPart = n.description ? ` — ${n.description}` : '';
        parts.push(`[${n.ref}] ${n.role}: "${n.name}"${valuePart}${descPart}`);
      }
      return parts.join('');
    })
    .join('\n');
}

function computeHash(nodes: AOMNode[]): string {
  const tuples = nodes.map((n) => `${n.ref}:${n.role}:${n.name}`).join('|');
  let hash = 0;
  for (let i = 0; i < tuples.length; i++) {
    const char = tuples.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
