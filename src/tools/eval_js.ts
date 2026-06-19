import type { BrowseAgenticConfig } from '../types.js';
import type { BrowserOrchestrator } from '../orchestrator.js';

export interface EvalJSInput {
  script: string;
}

export interface EvalJSResult {
  success: boolean;
  result?: unknown;
  error?: string;
  security_warnings?: string[];
}

const XSS_PATTERNS = [
  { pattern: /eval\s*\(/gi, name: 'eval()' },
  { pattern: /new\s+Function\s*\(/gi, name: 'new Function()' },
  { pattern: /document\.write\s*\(/gi, name: 'document.write()' },
  { pattern: /\.innerHTML\s*=/gi, name: '.innerHTML=' },
  { pattern: /\.outerHTML\s*=/gi, name: '.outerHTML=' },
];

export async function handleEvalJS(
  orchestrator: BrowserOrchestrator,
  config: BrowseAgenticConfig,
  input: EvalJSInput,
): Promise<EvalJSResult> {
  const page = await orchestrator.getPage();
  const mode = config.security.eval_js_xss_detection ?? 'warn';

  // Check for dangerous patterns
  const warnings: string[] = [];
  for (const { pattern, name } of XSS_PATTERNS) {
    if (pattern.test(input.script)) {
      warnings.push(`Script contains ${name} — review output carefully.`);
    }
  }

  // Block mode: reject if any warnings
  if (mode === 'block' && warnings.length > 0) {
    return {
      success: false,
      error: `XSS_PATTERN_BLOCKED: ${warnings.join('; ')}`,
      security_warnings: warnings,
    };
  }

  try {
    const result = await page.evaluate(input.script);
    return {
      success: true,
      result,
      security_warnings: mode === 'warn' && warnings.length > 0 ? warnings : undefined,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: `JS_ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
