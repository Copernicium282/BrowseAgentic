// Paint-order filtering (from browser-use)
// RectUnion containment to drop occluded elements

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Disjoint rectangle union for tracking opaque screen regions
export class RectUnion {
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

// Check if child rect is contained within parent rect (99% threshold)
export function isContained(child: Rect, parent: Rect, threshold = 0.99): boolean {
  const xOverlap = Math.max(0, Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x));
  const yOverlap = Math.max(0, Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y));
  const intersectionArea = xOverlap * yOverlap;
  const childArea = child.width * child.height;
  if (childArea === 0) return false;
  return intersectionArea / childArea >= threshold;
}

// Exception rules: never exclude these even if contained
export function shouldNeverExclude(role: string): boolean {
  const formRoles = new Set(['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'slider', 'spinbutton']);
  const interactiveRoles = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option']);
  return formRoles.has(role) || interactiveRoles.has(role);
}

// Propagating elements that absorb children
export const PROPAGATING_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'combobox']);
