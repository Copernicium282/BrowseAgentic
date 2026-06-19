// Text coalescing (from agent-browser + playwright-mcp)
// Merges adjacent text nodes and deduplicates

import type { TreeNode } from './role-pruning.js';

const INVISIBLE_CHARS = /[\uFEFF\u200B\u200C\u200D\u2060]/g;

export function stripInvisible(str: string): string {
  return str.replace(INVISIBLE_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

export function coalesceText(node: TreeNode): void {
  // First pass: merge consecutive StaticText/text siblings
  const merged: (TreeNode | string)[] = [];
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (typeof child !== 'string' && (child.role === 'StaticText' || child.role === 'text')) {
      let text = child.name;
      let j = i + 1;
      while (j < node.children.length) {
        const next = node.children[j];
        if (typeof next !== 'string' && (next.role === 'StaticText' || next.role === 'text')) {
          text += ' ' + next.name;
          j++;
        } else {
          break;
        }
      }
      merged.push(text);
      i = j;
    } else {
      merged.push(child);
      i++;
    }
  }

  // Second pass: coalesce adjacent string nodes
  const coalesced: (TreeNode | string)[] = [];
  let textBuffer = '';
  for (const child of merged) {
    if (typeof child === 'string') {
      const stripped = stripInvisible(child);
      if (stripped) textBuffer += (textBuffer ? ' ' : '') + stripped;
    } else {
      if (textBuffer) {
        coalesced.push(textBuffer);
        textBuffer = '';
      }
      coalesced.push(child);
    }
  }
  if (textBuffer) coalesced.push(textBuffer);

  // Deduplicate: if single StaticText child matches parent name, remove child
  if (coalesced.length === 1 && typeof coalesced[0] === 'string' && coalesced[0] === node.name) {
    node.children = [];
    return;
  }

  // Skip InlineTextBox
  node.children = coalesced.filter((c) => {
    if (typeof c !== 'string' && c.role === 'InlineTextBox') return false;
    return true;
  });
}
