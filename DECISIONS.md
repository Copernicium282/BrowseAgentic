# Decisions

## Phase 1 Decisions

### DOM overlays over canvas drawing
Used positioned `<div>` elements for SoM overlays instead of canvas. DOM overlays are more reliable across SPAs and don't require canvas coordinate mapping.

### CDP for accessibility tree
Playwright's `page.accessibility.snapshot()` API was removed in newer versions. Using Chrome DevTools Protocol directly via `page.context().newCDPSession(page)` for reliable accessibility tree extraction.

### Single session per server
One `BrowserContext` + one `Page` per server instance. Simplifies state management. `resetSession()` creates a fresh context when needed.

### No bundler
Using `tsc` directly. No webpack/esbuild needed for MVP. Keeps build simple.

### stderr logging
MCP uses stdout for JSON-RPC. All logs go to stderr to avoid protocol contamination.

### Video recording via Playwright built-in
Using Playwright's `recordVideo` context option rather than a custom recording solution. Each session gets its own subdirectory.

### Stdio transport only
MCP over stdio (JSON-RPC 2.0) for MVP. HTTP/SSE transport deferred to future work.

---

## Phase 2 Decisions

### BrowseAgentic naming
Project renamed from OmniBrowser to BrowseAgentic. All config, types, and env vars updated. Old `omnibrowser.yaml` kept for backward compatibility but `browseagentic.yaml` is the canonical config.

### Config v2 structure
New config sections added: `budget`, `cache`, `rsi`, `tabs`, `session`. Old `security.allowed_paths`/`blocked_paths`/`allowed_commands` moved to `rsi` section. Old `server.console_level`/`secrets` moved to `security` section.

### Per-tab buffers (breaking change)
`SessionState.console_log_buffer` and `network_failure_buffer` changed from flat arrays to `Map<number, string[]>` keyed by tab_id. All tools updated to use `session.active_tab_id` for buffer access.

### Pruning modules extracted
AOM pipeline split into `pruning/paint-order.ts`, `pruning/role-pruning.ts`, `pruning/text-coalesce.ts`. Each is an independently testable pure function. Main `aom.ts` chains them in order.

### Response budget (partial implementation)
Budget system implemented with element cap (20) and text truncation (4000 chars). Full 4-step layered shrink (console→image→elements→text) deferred — current implementation is sufficient for typical pages.

### Cache TTL
Cache entries expire after `cache.ttl_hours` (default 168 = 1 week). Checked on read, stale entries auto-deleted. Prevents serving stale selectors from redesigned sites.

### RSI sandbox root
All RSI tools resolve paths relative to `rsi.sandbox_root` (default: `.`). Path traversal, symlink escapes, and protected patterns all enforced through `path_guard.ts`.

### Binary file detection
`read_file` checks first 8KB for null bytes. Binary files rejected with `BINARY_FILE` error. Prevents dumping garbage into agent context.

### eval_js XSS modes
Three modes: `warn` (default, logs warnings), `block` (rejects dangerous scripts), `off` (no detection). Configurable via `security.eval_js_xss_detection`. Not a security boundary — just a tripwire for accidental self-harm.

### Session persistence caveat
Profile files contain live session cookies. No encryption at rest in Phase 2. Documented limitation — operator's responsibility to secure the profiles directory.

### Multi-tab popup auto-registration
New tabs opened via `target="_blank"` or `window.open()` are automatically registered via `context.on('page')` event. Agent informed via `new_tab_opened` field in interact response.

---

## Prior Art Research
Key patterns adopted from 8 repos via deep source code analysis:
- microsoft/playwright-mcp: YAML output, depth limiting, generic pruning, console filtering, secret redaction
- browser-use/browser-use: RectUnion paint-order filtering, 99% containment threshold
- browserbase/stagehand: Action caching with SHA-256 keys, variable substitution, self-heal
- vercel-labs/agent-browser: Compact tree algorithm, StaticText merging, invisible char stripping
- Skyvern-AI/skyvern: PUA character replacement, name truncation, URL compression
- remorses/playwriter: Color-coded overlays by element type
- badchars/mcp-browser: Basic XSS detection, structured network logging
- alexrwilliam/playwright-mcp-server: Response budget system, layered capping

---

## Browser Capability Verification (Phase 21)

Verified against industry-standard browser automation capabilities:

| Capability | Industry Standard | BrowseAgentic | Status |
|---|---|---|---|
| Spawn browser | Chrome extension or Playwright launch | Playwright-spawned OR CDP connect | EXCEEDS |
| Navigate to URL (incl. localhost) | Navigate to local dev server | `navigate` + dev_mode | PARITY |
| Click / fill forms autonomously | Click buttons, fill forms | `interact` (click/type/hover/clear) + caching | EXCEEDS |
| Take screenshots | Screenshot tools | `observe_page` vision (color-coded SoM) | EXCEEDS |
| Loop back to fix what breaks | IDE editor integration | RSI tools (read/write/exec/git) | EXCEEDS |
| Real-time feedback during testing | Console log capture | Console + network capture | EXCEEDS |
| Permission tiers | Allow/Ask/Deny (newer feature) | Not implemented | CONFIRMED OUT OF SCOPE |

**Conclusion:** BrowseAgentic has reached feature parity with standard browser automation capabilities. All core capabilities are at parity or better.
