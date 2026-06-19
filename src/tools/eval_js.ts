import type { BrowserOrchestrator } from '../orchestrator.js';

export interface EvalJSInput {
  script: string;
}

export interface EvalJSResult {
  success: boolean;
  result?: unknown;
  error?: string;
  warning?: string;
}

// Basic XSS detection patterns (from mcp-browser, for logging only)
const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/g, name: 'eval()' },
  { pattern: /new\s+Function\s*\(/g, name: 'new Function()' },
  { pattern: /document\.write\s*\(/g, name: 'document.write()' },
  { pattern: /innerHTML\s*=/g, name: 'innerHTML=' },
  { pattern: /outerHTML\s*=/g, name: 'outerHTML=' },
];

export async function handleEvalJS(
  orchestrator: BrowserOrchestrator,
  input: EvalJSInput,
): Promise<EvalJSResult> {
  const page = await orchestrator.getPage();

  // Basic safety warning (not blocking, just informational)
  const warnings: string[] = [];
  for (const { pattern, name } of DANGEROUS_PATTERNS) {
    if (pattern.test(input.script)) {
      warnings.push(name);
    }
  }

  try {
    const result = await page.evaluate(input.script);
    return {
      success: true,
      result,
      warning: warnings.length > 0 ? `Potentially dangerous patterns detected: ${warnings.join(', ')}` : undefined,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: `JS_ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
