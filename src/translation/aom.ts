import type { Page } from 'playwright';
import type { AOMNode, SessionState } from '../types.js';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
  'menuitem', 'tab', 'searchbox', 'spinbutton', 'slider',
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
}

export async function extractAOM(
  page: Page,
  session: SessionState,
): Promise<{ nodes: AOMNode[]; markdown: string; hash: string }> {
  // Use CDP to get the accessibility tree
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send('Accessibility.getFullAXTree') as { nodes: AXNode[] };
  await cdp.detach();

  const nodes: AOMNode[] = [];
  for (const axNode of result.nodes) {
    collectNodes(axNode, nodes);
  }

  // Get bounding boxes and populate element_map
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const selector = buildSelector(node);
    if (selector) {
      try {
        const el = page.locator(selector).first();
        const box = await el.boundingBox();
        if (box) {
          node.rect = { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      } catch {
        // Skip nodes that can't be located
      }
    }
  }

  // Filter out nodes without valid rects
  const validNodes = nodes.filter((n) => n.rect.width > 0 && n.rect.height > 0);

  // Re-assign sequential IDs and populate element_map
  validNodes.forEach((n, i) => {
    n.agent_id = i + 1;
    const selector = buildSelector(n);
    session.element_map.set(n.agent_id, { selector: selector ?? undefined, rect: n.rect });
  });

  // Build markdown
  const markdown = buildMarkdown(validNodes);

  // Compute hash for stale detection
  const hash = computeHash(validNodes);
  session.last_aom_hash = hash;

  return { nodes: validNodes, markdown, hash };
}

function collectNodes(node: AXNode, result: AOMNode[]): void {
  const role = node.role ?? '';
  const isInteractive = INTERACTIVE_ROLES.has(role);
  const isMedia = role === 'img' || role === 'figure';

  if (isInteractive || isMedia) {
    result.push({
      agent_id: 0, // Will be reassigned
      role,
      name: node.name ?? '',
      value: node.value,
      description: isMedia ? '[Image: no description available]' : node.description,
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
  if (node.role === 'link') return `a:has-text("${node.name}")`;
  if (node.role === 'button') return `button:has-text("${node.name}")`;
  if (node.role === 'textbox' || node.role === 'searchbox') return `input[placeholder="${node.name}"]`;
  if (node.role === 'checkbox') return `input[type="checkbox"]`;
  if (node.role === 'radio') return `input[type="radio"]`;
  if (node.role === 'combobox') return `select`;
  if (node.role === 'img') return `img`;
  if (node.role === 'figure') return `figure`;
  return null;
}

function buildMarkdown(nodes: AOMNode[]): string {
  return nodes
    .map((n) => {
      const valuePart = n.value !== undefined ? ` (value: "${n.value}")` : '';
      const descPart = n.description ? ` — ${n.description}` : '';
      return `[${n.agent_id}] ${n.role}: "${n.name}"${valuePart}${descPart}`;
    })
    .join('\n');
}

function computeHash(nodes: AOMNode[]): string {
  const tuples = nodes.map((n) => `${n.agent_id}:${n.role}:${n.name}`).join('|');
  let hash = 0;
  for (let i = 0; i < tuples.length; i++) {
    const char = tuples.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
