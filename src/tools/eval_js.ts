import type { BrowserOrchestrator } from '../orchestrator.js';

export interface EvalJSInput {
  script: string;
}

export interface EvalJSResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export async function handleEvalJS(
  orchestrator: BrowserOrchestrator,
  input: EvalJSInput,
): Promise<EvalJSResult> {
  const page = await orchestrator.getPage();

  try {
    const result = await page.evaluate(input.script);
    return { success: true, result };
  } catch (err: unknown) {
    return {
      success: false,
      error: `JS_ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
