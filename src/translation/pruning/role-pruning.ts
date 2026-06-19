// Role-based pruning (from playwright-mcp + browser-use)
// Collapses empty generic/none/presentation wrappers

export interface TreeNode {
  role: string;
  name: string;
  ref?: string;
  children: (TreeNode | string)[];
  props: Record<string, unknown>;
  box?: { x: number; y: number; width: number; height: number };
}

export function pruneRoles(node: TreeNode): void {
  const pruned: (TreeNode | string)[] = [];

  for (const child of node.children) {
    if (typeof child === 'string') {
      pruned.push(child);
      continue;
    }

    pruneRoles(child);

    // Collapse empty generic/none/presentation wrappers with single child
    if (['generic', 'none', 'presentation'].includes(child.role) && !child.name && child.children.length === 1) {
      const only = child.children[0];
      pruned.push(only);
      continue;
    }

    // Drop generic with zero children and no name
    if (child.role === 'generic' && !child.name && child.children.length === 0) {
      continue;
    }

    pruned.push(child);
  }

  node.children = pruned;
}
