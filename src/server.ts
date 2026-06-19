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
import { handleFSRead } from './tools/fs_read.js';
import { handleFSWrite } from './tools/fs_write.js';
import { handleFSList } from './tools/fs_list.js';
import { handleExec } from './tools/exec.js';
import { handleGit } from './tools/git.js';

export function createServer(orchestrator: BrowserOrchestrator, config: OmniBrowserConfig): McpServer {
  const server = new McpServer({
    name: 'browseagentic',
    version: '0.2.0',
  });

  server.tool(
    'navigate',
    'Navigate the browser to a URL. Returns the final URL, page title, and status code.',
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
    "Captures the current state of the web page. Use modality='vision' for screenshots with numbered bounding boxes. Use modality='text' for an indented snapshot with refs (e1, e2, ...). Set compact=true to reduce tokens. Set depth=N to limit tree depth. Always call after navigating or interacting.",
    {
      modality: z.enum(['vision', 'text']).describe('Observation modality'),
      viewport_only: z.boolean().optional().describe('Only capture elements in viewport (default: true)'),
      compact: z.boolean().optional().describe('Strip non-interactive nodes (default: false)'),
      depth: z.number().optional().describe('Limit snapshot tree depth'),
    },
    async (args) => {
      console.error(`[tool] observe_page → modality=${args.modality} compact=${args.compact ?? false} depth=${args.depth ?? 'all'}`);
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
    'Perform an action on an element by its ref from the last observation. Actions: click, type, hover, clear. Pass instruction for cache lookup. Returns auto-updated snapshot.',
    {
      action: z.enum(['click', 'type', 'hover', 'clear']).describe('Action to perform'),
      ref: z.string().describe('Element ref (e.g. "e1", "e2") from the last observe_page call'),
      value: z.string().optional().describe('Text to type (required for type action)'),
      instruction: z.string().optional().describe('Natural language instruction for cache lookup (e.g. "click login button")'),
    },
    async (args) => {
      console.error(`[tool] interact → ${args.action} on ref ${args.ref}${args.instruction ? ` cache=${args.instruction}` : ''}`);
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
    'Scroll the viewport. Always call observe_page after scrolling to get fresh refs.',
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
    'Execute arbitrary JavaScript in the page context and return the result.',
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

  // === RSI Tools (Recursive Self Improvement) ===

  server.tool(
    'read_file',
    'Read a file from the local filesystem. Returns content with line numbers. Respects path sandboxing.',
    {
      path: z.string().describe('File path to read'),
      line_numbers: z.boolean().optional().describe('Include line numbers (default: true)'),
    },
    async (args) => {
      console.error(`[tool] read_file → ${args.path}`);
      const result = await handleFSRead(config, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: result.content ?? '' }] };
      }
      return { isError: true, content: [{ type: 'text' as const, text: result.error ?? 'READ_ERROR' }] };
    },
  );

  server.tool(
    'write_file',
    'Write content to a file. Creates parent directories if needed. Respects path sandboxing.',
    {
      path: z.string().describe('File path to write'),
      content: z.string().describe('Content to write'),
    },
    async (args) => {
      console.error(`[tool] write_file → ${args.path} (${args.content.length} bytes)`);
      const result = await handleFSWrite(config, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: `Written ${result.bytes_written} bytes to ${args.path}` }] };
      }
      return { isError: true, content: [{ type: 'text' as const, text: result.error ?? 'WRITE_ERROR' }] };
    },
  );

  server.tool(
    'list_directory',
    'List directory contents. Respects path sandboxing.',
    {
      path: z.string().describe('Directory path to list'),
      recursive: z.boolean().optional().describe('List recursively (default: false)'),
    },
    async (args) => {
      console.error(`[tool] list_directory → ${args.path}`);
      const result = await handleFSList(config, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: (result.entries ?? []).join('\n') }] };
      }
      return { isError: true, content: [{ type: 'text' as const, text: result.error ?? 'LIST_ERROR' }] };
    },
  );

  server.tool(
    'run_command',
    'Execute a shell command. Only allowlisted commands are permitted (npm, git, tsc, node, etc). Enforces timeout.',
    {
      command: z.string().describe('Command to execute (must be in allowlist)'),
      args: z.array(z.string()).optional().describe('Command arguments'),
      cwd: z.string().optional().describe('Working directory'),
      timeout_ms: z.number().optional().describe('Timeout in ms (max 120000, default 30000)'),
    },
    async (args) => {
      console.error(`[tool] run_command → ${args.command} ${(args.args ?? []).join(' ')}`);
      const result = await handleExec(config, args);
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      if (result.success) {
        return { content: [{ type: 'text' as const, text: output || '(no output)' }] };
      }
      return { isError: true, content: [{ type: 'text' as const, text: `${result.error}\n${output}` }] };
    },
  );

  server.tool(
    'git',
    'Run git operations. Commits are auto-prefixed with [self-improve]. Actions: status, diff, log, commit, branch, add.',
    {
      action: z.enum(['status', 'diff', 'log', 'commit', 'branch', 'add']).describe('Git action'),
      message: z.string().optional().describe('Commit message (required for commit action)'),
      files: z.array(z.string()).optional().describe('Files to add (for add action)'),
      branch_name: z.string().optional().describe('Branch name (for branch action)'),
    },
    async (args) => {
      console.error(`[tool] git → ${args.action}`);
      const result = await handleGit(config, args);
      if (result.success) {
        return { content: [{ type: 'text' as const, text: result.output ?? '(no output)' }] };
      }
      return { isError: true, content: [{ type: 'text' as const, text: result.error ?? 'GIT_ERROR' }] };
    },
  );

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[server] MCP server started on stdio');
}
