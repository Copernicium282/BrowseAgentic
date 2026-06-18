# Decisions

## DOM overlays over canvas drawing
Used positioned `<div>` elements for SoM overlays instead of canvas. DOM overlays are more reliable across SPAs and don't require canvas coordinate mapping.

## CDP for accessibility tree
Playwright's `page.accessibility.snapshot()` API was removed in newer versions. Using Chrome DevTools Protocol directly via `page.context().newCDPSession(page)` for reliable accessibility tree extraction.

## Single session per server
One `BrowserContext` + one `Page` per server instance. Simplifies state management. `resetSession()` creates a fresh context when needed.

## No bundler
Using `tsc` directly. No webpack/esbuild needed for MVP. Keeps build simple.

## stderr logging
MCP uses stdout for JSON-RPC. All logs go to stderr to avoid protocol contamination.

## eval_js has no additional restrictions
Security guardrails at the network level are sufficient for MVP. The agent can execute arbitrary JS in the page context. Documented as a known tradeoff.

## Video recording via Playwright built-in
Using Playwright's `recordVideo` context option rather than a custom recording solution. Each session gets its own subdirectory.

## Stdio transport only
MCP over stdio (JSON-RPC 2.0) for MVP. HTTP/SSE transport deferred to future work.

## aria-ref element refs (from playwright-mcp)
Using `e1`, `e2` format instead of sequential numbers. Matches playwright-mcp pattern. Stale-ref error message tells agent to "Try capturing new snapshot."

## Auto-snapshot-after-action (from playwright-mcp)
Every `interact` call automatically returns fresh page state. Eliminates stale element issues. Adopted from Microsoft's playwright-mcp `response.setIncludeSnapshot()` pattern.

## Compact tree mode (from agent-browser)
`compact=true` strips non-interactive nodes. Adopted from agent-browser's `--compact` flag. Reduces token usage by 50%+ on complex pages.

## Cursor-interactive detection (from agent-browser + browser-use)
JavaScript injection scans for `cursor:pointer`, `onclick`, `tabindex`, pseudo-content. Catches unlabeled icons and canvas widgets that AOM misses. Adopted from both agent-browser and browser-use.

## Bounding-box containment (from browser-use)
Parent interactive elements (buttons, links) absorb child elements in output. Prevents duplicate addressing of same clickable region. Adopted from browser-use's containment filtering.

## Path sandboxing for RSI tools
Filesystem operations restricted to `allowed_paths` (default: project root). Symlink traversal blocked. `blocked_paths` excludes .git, node_modules, dist.

## Command allowlisting for RSI tools
`run_command` limited to: npm, npx, tsc, git, node, tsx, ls, grep, find, diff, wc. No `shell: true` — arguments passed as array. 120s max timeout.

## Git auto-prefix
Commits from RSI tools auto-prefixed with `[self-improve]` for audit trail.

## Prior art research
Key patterns adopted from: microsoft/playwright-mcp (auto-snapshot, aria-refs, image scaling), browserbase/stagehand (action caching — deferred), browser-use/browser-use (paint-order, bounding-box containment), vercel-labs/agent-browser (compact mode, cursor-interactive detection), Skyvern-AI/skyvern (token-aware output).
