import type { Page } from 'playwright';

export function normalizeUrlForCacheKey(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export async function waitForCachedSelector(params: {
  page: Page;
  selector: string | undefined;
  timeout?: number;
}): Promise<void> {
  if (!params.selector) return;
  try {
    await params.page.waitForSelector(params.selector, {
      state: 'attached',
      timeout: params.timeout ?? 15000,
    });
  } catch {
    // Non-blocking: proceed anyway, takeDeterministicAction will handle failure
  }
}

export function substituteVariablesInArguments(
  args: string[] | undefined,
  variables?: Record<string, string>,
): string[] | undefined {
  if (!variables || !Array.isArray(args)) return args;
  return args.map((arg) => {
    let out = arg;
    for (const [key, v] of Object.entries(variables)) {
      const token = `%${key}%`;
      out = out.split(token).join(v);
    }
    return out;
  });
}
