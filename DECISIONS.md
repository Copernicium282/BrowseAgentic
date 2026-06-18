# Decisions

## DOM overlays over canvas drawing
Used positioned `<div>` elements for SoM overlays instead of canvas. DOM overlays are more reliable across SPAs and don't require canvas coordinate mapping.

## Playwright accessibility snapshot over raw CDP
Used `Accessibility.getFullAXTree` via CDP for AOM extraction. Playwright's built-in `page.accessibility.snapshot()` was removed in newer versions, so CDP is the direct path.

## Single session per server
One `BrowserContext` + one `Page` per server instance. Simplifies state management. `resetSession()` creates a fresh context when needed.

## No bundler
Using `tsc` directly. No webpack/esbuild needed for MVP. Keeps build simple.

## stderr logging
MCP uses stdout for JSON-RPC. All logs go to stderr to avoid protocol contamination.

## eval_js has no additional restrictions
Security guardrails at the network level are sufficient for MVP. The agent can execute arbitrary JS in the page context. Documented as a known tradeoff.

## CDP for accessibility tree
Playwright's `page.accessibility.snapshot()` API was removed in newer versions. Using Chrome DevTools Protocol directly via `page.context().newCDPSession(page)` for reliable accessibility tree extraction.

## Video recording via Playwright built-in
Using Playwright's `recordVideo` context option rather than a custom recording solution. Each session gets its own subdirectory.

## Stdio transport only
MCP over stdio (JSON-RPC 2.0) for MVP. HTTP/SSE transport deferred to future work.
