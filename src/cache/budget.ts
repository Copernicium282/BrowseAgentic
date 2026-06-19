// Response budget system (from playwright-mcp-server)
// Character-count-based budget with recursive shrinking

export interface BudgetResult<T> {
  value: T;
  truncated: boolean;
  preview?: string;
  originalSize: number;
}

export function applyBudget<T>(
  value: T,
  budget: number,
  previewLimit: number = 400,
): BudgetResult<T> {
  const size = estimateSize(value);

  if (budget <= 0 || size <= budget) {
    return { value, truncated: false, originalSize: size };
  }

  const shrunk = shrinkValue(value, budget);
  const actualSize = estimateSize(shrunk);
  const truncated = actualSize > 0; // We shrunk, so something was truncated

  const preview = serializePreview(value, previewLimit);

  return { value: shrunk, truncated, preview, originalSize: size };
}

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function shrinkValue<T>(value: T, budget: number): T {
  if (budget <= 0) return emptyLike(value);

  if (typeof value === 'string') {
    if (value.length <= budget) return value;
    return value.slice(0, budget) as T;
  }

  if (Array.isArray(value)) {
    const reduced: unknown[] = [];
    let totalSize = 2; // for []
    for (const item of value) {
      const itemSize = estimateSize(item);
      if (totalSize + itemSize + 1 > budget) break;
      reduced.push(item);
      totalSize += itemSize + 1;
    }
    return reduced as T;
  }

  if (typeof value === 'object' && value !== null) {
    const reduced: Record<string, unknown> = {};
    let totalSize = 2; // for {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keySize = key.length + 3; // "key":
      const valSize = estimateSize(val);
      if (totalSize + keySize + valSize + 1 > budget) break;
      reduced[key] = val;
      totalSize += keySize + valSize + 1;
    }
    return reduced as T;
  }

  return value;
}

function emptyLike<T>(value: T): T {
  if (typeof value === 'string') return '' as T;
  if (Array.isArray(value)) return [] as T;
  if (typeof value === 'object' && value !== null) return {} as T;
  return value;
}

function serializePreview(value: unknown, maxChars: number): string {
  if (maxChars <= 0) return '';
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxChars) return serialized;
    return serialized.slice(0, maxChars) + '...';
  } catch {
    return String(value).slice(0, maxChars);
  }
}

// Element count cap (from playwright-mcp-server: default 20)
export const DEFAULT_MAX_ELEMENTS = 20;

// Text length cap (from playwright-mcp-server: default 2000)
export const DEFAULT_MAX_TEXT_LENGTH = 2000;

// Response budget (from playwright-mcp-server: default 4000)
export const DEFAULT_RESPONSE_BUDGET = 4000;
