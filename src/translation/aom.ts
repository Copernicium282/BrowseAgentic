import type { Page } from 'playwright';
import type { AOMNode, SessionState } from '../types.js';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
  'menuitem', 'tab', 'searchbox', 'spinbutton', 'slider',
]);

interface AXNode {
  nodeId?: string;
  role?: string | { type: string; value: string };
  name?: string | { type: string; value: string };
  value?: string;
  childIds?: string[];
  ignored?: boolean;
  properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
}

interface TreeNode {
  role: string;
  name: string;
  ref?: string;
  children: (TreeNode | string)[];
  props: Record<string, unknown>;
  box?: { x: number; y: number; width: number; height: number };
}

interface Rect { x: number; y: number; width: number; height: number }

export async function extractAOM(
  page: Page,
  session: SessionState,
  compact = false,
  depth?: number,
): Promise<{ nodes: AOMNode[]; snapshot: string; hash: string }> {
  const cdp = await page.context().newCDPSession(page);
  const axResult = await cdp.send('Accessibility.getFullAXTree') as { nodes: AXNode[] };

  const cursorInteractive = await detectCursorInteractive(page);
  await cdp.detach();

  // Build tree structure from flat AX nodes
  const tree = buildTree(axResult.nodes);

  // Prune: remove empty generic wrappers, coalesce text
  pruneTree(tree);

  // Get bounding boxes for all nodes
  const flatNodes: AOMNode[] = [];
  await collectFlatNodes(tree, page, flatNodes, 0);

  // Filter valid rects
  let nodes = flatNodes.filter((n) => n.rect.width > 0 && n.rect.height > 0);

  // Bounding-box containment
  nodes = filterByContainment(nodes);

  // Merge cursor-interactive elements
  for (const ci of cursorInteractive) {
    if (!nodes.some((n) => Math.abs(n.rect.x - ci.rect.x) < 2 && Math.abs(n.rect.y - ci.rect.y) < 2)) {
      nodes.push(ci);
    }
  }

  // Assign refs
  session.element_map.clear();
  nodes.forEach((n, i) => {
    n.agent_id = i + 1;
    n.ref = `e${i + 1}`;
    const selector = buildSelector(n);
    session.element_map.set(n.ref, { selector: selector ?? undefined, rect: n.rect });
  });

  // Render as YAML-indented snapshot
  const snapshot = renderSnapshot(tree, compact, depth);
  const hash = computeHash(nodes);
  session.last_aom_hash = hash;

  return { nodes, snapshot, hash };
}

function buildTree(axNodes: AXNode[]): TreeNode {
  const root: TreeNode = { role: 'fragment', name: '', children: [], props: {} };

  // Build map from nodeId to node
  const nodeMap = new Map<string, AXNode>();
  for (const node of axNodes) {
    if (node.nodeId) nodeMap.set(node.nodeId, node);
  }

  const getRole = (node: AXNode): string => {
    const r = node.role;
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object') return r.value ?? '';
    return '';
  };

  const getName = (node: AXNode): string => {
    const n = node.name;
    if (typeof n === 'string') return n;
    if (n && typeof n === 'object') return n.value ?? '';
    return '';
  };

  const getProp = (node: AXNode, name: string): unknown => {
    const prop = node.properties?.find((p) => p.name === name);
    return prop?.value?.value;
  };

  const walk = (nodeId: string, parent: TreeNode) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    // Always process children of ignored/skipped nodes
    const processChildren = () => {
      if (node.childIds) {
        for (const childId of node.childIds) walk(childId, parent);
      }
    };

    if (node.ignored) {
      processChildren();
      return;
    }

    const role = getRole(node);
    if (!role || role === 'presentation' || role === 'none' || role === 'RootWebArea') {
      processChildren();
      return;
    }

    // Skip generic nodes with no name
    if (role === 'generic' && !getName(node)) {
      processChildren();
      return;
    }

    const treeNode: TreeNode = {
      role,
      name: getName(node),
      children: [],
      props: {},
    };

    const checked = getProp(node, 'checked');
    if (checked !== undefined) treeNode.props.checked = checked;
    if (getProp(node, 'disabled')) treeNode.props.disabled = true;
    if (getProp(node, 'expanded')) treeNode.props.expanded = true;
    const level = getProp(node, 'level');
    if (typeof level === 'number') treeNode.props.level = level;
    if (getProp(node, 'pressed')) treeNode.props.pressed = true;
    if (getProp(node, 'selected')) treeNode.props.selected = true;

    parent.children.push(treeNode);

    if (node.childIds) {
      for (const childId of node.childIds) walk(childId, treeNode);
    }
  };

  // Start from root node (first in array)
  if (axNodes.length > 0 && axNodes[0].nodeId) {
    walk(axNodes[0].nodeId, root);
  }
  return root;
}

function pruneTree(node: TreeNode): void {
  const pruned: (TreeNode | string)[] = [];

  for (const child of node.children) {
    if (typeof child === 'string') {
      pruned.push(child);
      continue;
    }

    pruneTree(child);

    // Collapse empty generic wrappers
    if (child.role === 'generic' && !child.name && child.children.length === 1) {
      const only = child.children[0];
      if (typeof only === 'string') {
        pruned.push(only);
      } else {
        pruned.push(only);
      }
      continue;
    }

    pruned.push(child);
  }

  // Coalesce adjacent text nodes
  const coalesced: (TreeNode | string)[] = [];
  let textBuffer = '';
  for (const child of pruned) {
    if (typeof child === 'string') {
      textBuffer += child;
    } else {
      if (textBuffer) {
        coalesced.push(textBuffer);
        textBuffer = '';
      }
      coalesced.push(child);
    }
  }
  if (textBuffer) coalesced.push(textBuffer);

  // Remove children that duplicate the node's name
  if (coalesced.length === 1 && typeof coalesced[0] === 'string' && coalesced[0] === node.name) {
    node.children = [];
  } else {
    node.children = coalesced;
  }
}

async function collectFlatNodes(
  node: TreeNode,
  page: Page,
  result: AOMNode[],
  depth: number,
): Promise<void> {
  if (node.role === 'fragment') {
    for (const child of node.children) {
      if (typeof child !== 'string') await collectFlatNodes(child, page, result, depth);
    }
    return;
  }

  const selector = buildSelectorFromTree(node);
  let box: Rect = { x: 0, y: 0, width: 0, height: 0 };

  if (selector) {
    try {
      const el = page.locator(selector).first();
      const bounding = await el.boundingBox();
      if (bounding) {
        box = { x: bounding.x, y: bounding.y, width: bounding.width, height: bounding.height };
      }
    } catch {
      // Skip
    }
  }

  const isInteractive = INTERACTIVE_ROLES.has(node.role);
  const isMedia = node.role === 'img' || node.role === 'figure';

  if (isInteractive || isMedia) {
    result.push({
      agent_id: 0,
      ref: '',
      role: node.role,
      name: node.name,
      value: typeof node.props.value === 'string' ? node.props.value : undefined,
      description: isMedia ? '[Image: no description available]' : undefined,
      state: {
        disabled: typeof node.props.disabled === 'boolean' ? node.props.disabled : false,
        focused: false,
        checked: typeof node.props.checked === 'boolean' ? node.props.checked : undefined,
        expanded: typeof node.props.expanded === 'boolean' ? node.props.expanded : undefined,
      },
      rect: box,
      is_fallback_translated: false,
    });
  }

  for (const child of node.children) {
    if (typeof child !== 'string') await collectFlatNodes(child, page, result, depth + 1);
  }
}

function buildSelectorFromTree(node: TreeNode): string | null {
  if (node.role === 'link' && node.name) return `a:has-text("${node.name}")`;
  if (node.role === 'button' && node.name) return `button:has-text("${node.name}")`;
  if ((node.role === 'textbox' || node.role === 'searchbox') && node.name) return `input[placeholder="${node.name}"]`;
  if (node.role === 'checkbox') return `input[type="checkbox"]`;
  if (node.role === 'radio') return `input[type="radio"]`;
  if (node.role === 'combobox') return `select`;
  if (node.role === 'img') return 'img';
  if (node.role === 'figure') return 'figure';
  return null;
}

function renderSnapshot(node: TreeNode, compact: boolean, maxDepth?: number, indent = 0): string {
  if (node.role === 'fragment') {
    return node.children
      .map((c) => (typeof c === 'string' ? '' : renderSnapshot(c, compact, maxDepth, indent)))
      .filter(Boolean)
      .join('\n');
  }

  if (maxDepth !== undefined && indent > maxDepth) return '';

  const parts: string[] = [];
  const prefix = '  '.repeat(indent);

  // Build key: role "name" [ref=eN] [props...]
  let key = node.role;
  if (node.name && node.name.length <= 900) {
    key += ` "${escapeYamlString(node.name)}"`;
  }
  if (node.ref) key += ` [ref=${node.ref}]`;
  if (node.props.checked === true) key += ' [checked]';
  if (node.props.checked === 'mixed') key += ' [checked=mixed]';
  if (node.props.disabled) key += ' [disabled]';
  if (node.props.expanded) key += ' [expanded]';
  if (node.props.level) key += ` [level=${node.props.level}]`;
  if (node.props.pressed === true) key += ' [pressed]';
  if (node.props.selected) key += ' [selected]';
  if (node.box) key += ` [box=${Math.round(node.box.x)},${Math.round(node.box.y)},${Math.round(node.box.width)},${Math.round(node.box.height)}]`;

  // Single text child inlined
  if (node.children.length === 1 && typeof node.children[0] === 'string') {
    parts.push(`${prefix}- ${key}: "${escapeYamlString(node.children[0])}"`);
    return parts.join('\n');
  }

  if (node.children.length === 0 && !compact) {
    // Leaf node with no children — inline value if present
    const val = node.props.value;
    if (val !== undefined) {
      parts.push(`${prefix}- ${key}: "${escapeYamlString(String(val))}"`);
    } else {
      parts.push(`${prefix}- ${key}`);
    }
    return parts.join('\n');
  }

  parts.push(`${prefix}- ${key}:`);

  for (const child of node.children) {
    if (typeof child === 'string') {
      parts.push(`${prefix}  - text: "${escapeYamlString(child)}"`);
    } else {
      const childRendered = renderSnapshot(child, compact, maxDepth, indent + 1);
      if (childRendered) parts.push(childRendered);
    }
  }

  return parts.join('\n');
}

function escapeYamlString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function buildSelector(node: AOMNode): string | null {
  if (node.role === 'link' && node.name) return `a:has-text("${node.name}")`;
  if (node.role === 'button' && node.name) return `button:has-text("${node.name}")`;
  if ((node.role === 'textbox' || node.role === 'searchbox') && node.name) return `input[placeholder="${node.name}"]`;
  if (node.role === 'checkbox') return `input[type="checkbox"]`;
  if (node.role === 'radio') return `input[type="radio"]`;
  if (node.role === 'combobox') return 'select';
  if (node.role === 'img') return 'img';
  if (node.role === 'figure') return 'figure';
  return null;
}

// Rectangle class for paint-order filtering (from browser-use)
class RectUnion {
  private rects: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  private static MAX_RECTS = 5000;

  contains(r: { x1: number; y1: number; x2: number; y2: number }): boolean {
    if (this.rects.length === 0) return false;
    let stack = [r];
    for (const s of this.rects) {
      const newStack: typeof stack = [];
      for (const piece of stack) {
        if (s.x1 <= piece.x1 && s.y1 <= piece.y1 && s.x2 >= piece.x2 && s.y2 >= piece.y2) {
          continue; // piece completely covered
        }
        // Split piece around s
        const yLo = Math.max(piece.y1, s.y1);
        const yHi = Math.min(piece.y2, s.y2);
        if (piece.y1 < s.y1) newStack.push({ x1: piece.x1, y1: piece.y1, x2: piece.x2, y2: s.y1 });
        if (s.y2 < piece.y2) newStack.push({ x1: piece.x1, y1: s.y2, x2: piece.x2, y2: piece.y2 });
        if (piece.x1 < s.x1 && yLo < yHi) newStack.push({ x1: piece.x1, y1: yLo, x2: s.x1, y2: yHi });
        if (s.x2 < piece.x2 && yLo < yHi) newStack.push({ x1: s.x2, y1: yLo, x2: piece.x2, y2: yHi });
      }
      stack = newStack;
      if (stack.length === 0) return true;
    }
    return false;
  }

  add(r: { x1: number; y1: number; x2: number; y2: number }): boolean {
    if (this.rects.length >= RectUnion.MAX_RECTS) return false;
    if (this.contains(r)) return false;
    this.rects.push(r);
    return true;
  }
}

// Check if child rect is contained within parent rect (99% threshold from browser-use)
function isContained(child: Rect, parent: Rect, threshold = 0.99): boolean {
  const xOverlap = Math.max(0, Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x));
  const yOverlap = Math.max(0, Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y));
  const intersectionArea = xOverlap * yOverlap;
  const childArea = child.width * child.height;
  if (childArea === 0) return false;
  return intersectionArea / childArea >= threshold;
}

// Exception rules from browser-use: never exclude these
function shouldNeverExclude(node: AOMNode): boolean {
  // Form elements always need individual interaction
  const formRoles = new Set(['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'slider', 'spinbutton']);
  if (formRoles.has(node.role)) return true;
  // Elements with explicit ARIA roles suggesting interactivity
  const interactiveRoles = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option']);
  if (interactiveRoles.has(node.role)) return true;
  return false;
}

function filterByContainment(nodes: AOMNode[]): AOMNode[] {
  const propagatingRoles = new Set(['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'combobox']);
  const result: AOMNode[] = [];
  const removed = new Set<number>();

  for (let i = 0; i < nodes.length; i++) {
    if (removed.has(i)) continue;
    const node = nodes[i];

    // Only propagating elements absorb children
    if (!propagatingRoles.has(node.role) || node.rect.width === 0) {
      result.push(node);
      continue;
    }

    // Check if any other node is contained (99% threshold)
    for (let j = 0; j < nodes.length; j++) {
      if (i === j || removed.has(j)) continue;
      const other = nodes[j];
      if (shouldNeverExclude(other)) continue;
      if (isContained(other.rect, node.rect)) {
        removed.add(j);
      }
    }
    result.push(node);
  }

  return result;
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

function computeHash(nodes: AOMNode[]): string {
  const tuples = nodes.map((n) => `${n.ref}:${n.role}:${n.name}`).join('|');
  let hash = 0;
  for (let i = 0; i < tuples.length; i++) {
    const char = tuples.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
