import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { OmniBrowserConfig } from './types.js';
import type { BrowserOrchestrator } from './orchestrator.js';
import { handleNavigate } from './tools/navigate.js';
import { handleObserve } from './tools/observe.js';
import { handleInteract } from './tools/interact.js';
import { handleScroll } from './tools/scroll.js';
import { handleEvalJS } from './tools/eval_js.js';

export function createServer(orchestrator: BrowserOrchestrator, config: OmniBrowserConfig): McpServer {
  const server = new McpServer({
    name: 'omnibrowser',
    version: '0.1.0',
  });

  server.tool(
    'navigate',
    'Navigate the browser to a URL. Returns the final URL, page title, and status code. Use wait_until to control when navigation is considered complete.',
    {
      url: z.string().describe('URL to navigate to (must be http:// or https://)'),
      wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe('When to consider navigation complete (default: networkidle)'),
    },
    async (args) => {
      console.error(`[tool] navigate → ${args.url}`);
      const result = await handleNavigate(orchestrator, config, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      }
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `${result.error}: ${result.reason ?? result.hint ?? ''}` }],
      };
    },
  );

  server.tool(
    'observe_page',
    "Captures the current state of the web page. Use modality='vision' if you can process images (returns a screenshot with numbered bounding boxes over every clickable element). Use modality='text' if you are text-only (returns a compressed list of interactive elements with IDs). Always call this after navigating or interacting to get fresh element IDs.",
    {
      modality: z.enum(['vision', 'text']).describe('Observation modality: vision for image-based, text for AOM-based'),
      viewport_only: z.boolean().optional().describe('Only capture elements in the viewport (default: true)'),
    },
    async (args) => {
      console.error(`[tool] observe_page → modality=${args.modality}`);
      try {
        const result = await handleObserve(orchestrator, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `OBSERVE_ERROR: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );

  server.tool(
    'interact',
    'Perform an action on an element identified by its agent_id from the last observation. Actions: click, type, hover, clear. Always call observe_page first to get element IDs.',
    {
      action: z.enum(['click', 'type', 'hover', 'clear']).describe('Action to perform'),
      element_id: z.number().describe('ID of the element from the last observe_page call'),
      value: z.string().optional().describe('Text to type (required for type action)'),
    },
    async (args) => {
      console.error(`[tool] interact → ${args.action} on element ${args.element_id}`);
      const result = await handleInteract(orchestrator, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      }
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `${result.error}: ${result.hint ?? ''}` }],
      };
    },
  );

  server.tool(
    'scroll',
    'Scroll the viewport in the specified direction. Always call observe_page after scrolling to get fresh element IDs.',
    {
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Direction to scroll'),
      amount_pixels: z.number().optional().describe('Number of pixels to scroll (default: 800)'),
    },
    async (args) => {
      console.error(`[tool] scroll → ${args.direction} ${args.amount_pixels ?? 800}px`);
      const result = await handleScroll(orchestrator, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      }
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `SCROLL_ERROR: ${result.hint ?? ''}` }],
      };
    },
  );

  server.tool(
    'eval_js',
    'Execute arbitrary JavaScript in the page context and return the result. This is a power-user escape hatch for when the standard tools are not sufficient.',
    {
      script: z.string().describe('JavaScript expression or block with explicit return'),
    },
    async (args) => {
      console.error(`[tool] eval_js → script length ${args.script.length}`);
      const result = await handleEvalJS(orchestrator, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.result) }] };
      }
      return {
        isError: true,
        content: [{ type: 'text' as const, text: result.error ?? 'JS_ERROR' }],
      };
    },
  );

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[server] MCP server started on stdio');
}
