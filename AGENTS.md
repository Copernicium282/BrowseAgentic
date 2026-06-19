# BrowseAgentic — Agent Guide

BrowseAgentic is a standalone MCP server that gives AI agents a sandboxed browser. You connect to it via MCP and use its tools to navigate, observe, interact, and modify code.

## Project Structure

```
BrowseAgentic/
├── config/browseagentic.yaml   # Runtime config (browser, security, cache, etc.)
├── scripts/browser.sh          # User-runs to launch Chrome with CDP enabled
├── src/
│   ├── index.ts                # Entry point — loads config, inits orchestrator, starts MCP server
│   ├── server.ts               # MCP server with all tool definitions
│   ├── orchestrator.ts         # Browser lifecycle, tabs, sessions, guardrails
│   ├── config.ts               # YAML config loader
│   ├── types.ts                # TypeScript types
│   ├── chrome/
│   │   ├── launcher.ts         # Launch Chrome binary
│   │   └── cdp.ts              # Connect to Chrome via CDP
│   ├── tools/                  # MCP tool handlers (navigate, observe, interact, etc.)
│   ├── session/persistence.ts  # Save/load browser sessions
│   ├── cache/                  # Action caching
│   └── security/               # Guardrails, path sandbox, command guard
├── test/                       # Test scripts
├── dist/                       # Compiled JS (run `npm run build`)
├── mcp.json                    # MCP client config examples
└── package.json
```

## Prerequisites

- **Node.js** ≥ 18
- **Chrome or Chromium** installed (`google-chrome`, `chromium-browser`, etc.)
- **Playwright** (installed via `npm install` in this directory)
- Project built: `npm run build` (compiles `src/` → `dist/`)

## Two Ways to Use BrowseAgentic

### Option A: MCP Server Mode (Recommended)

The agent connects to BrowseAgentic as an MCP server. The server provides all browser and filesystem tools.

**Step 1: User launches Chrome**
```bash
./scripts/browser.sh start
```
Chrome opens with CDP on port 9222. The script positions it on the left half of the screen.

**Step 2: Agent starts the MCP server**

The MCP server connects to the existing Chrome via CDP. Add this to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "browseagentic": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "/path/to/BrowseAgentic",
      "env": {
        "OMNIBROWSER_CONFIG": "./config/browseagentic.yaml"
      }
    }
  }
}
```

Or run directly: `node dist/index.js`

The server connects to Chrome on `cdp_port: 9222` (configurable in `browseagentic.yaml`).

**Step 3: Use MCP tools**

The server exposes these tools: `navigate`, `observe_page`, `interact`, `scroll`, `eval_js`, `read_file`, `write_file`, `list_directory`, `run_command`, `git`, `open_tab`, `switch_tab`, `close_tab`, `list_tabs`, `save_session`, `load_session`, `list_sessions`.

**Step 4: User stops Chrome when done**
```bash
./scripts/browser.sh stop
```

### Option B: Direct CDP Mode (Agent writes scripts)

The agent bypasses the MCP server and connects to Chrome directly via Playwright CDP. Use this when you need fine-grained control or when MCP tools aren't available.

**Step 1: User launches Chrome**
```bash
./scripts/browser.sh start
```

**Step 2: Agent connects via Playwright**

```js
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0]?.pages()[0];
```

**Step 3: Agent interacts with the page**

```js
await page.goto('https://example.com');
await page.waitForLoadState('networkidle');
const title = await page.title();
await page.click('#my-button');
```

**Step 4: Agent closes the connection**

```js
await browser.close();
```

Note: `browser.close()` in CDP mode disconnects from Chrome — it does NOT kill Chrome. The user stops Chrome separately.

## How to Start a Session

1. **Ask the user** to run: `./scripts/browser.sh start` — **the agent must NOT run this command itself** because Chrome blocks the terminal indefinitely. The user runs it in a separate terminal.
2. Wait for the user to confirm Chrome is ready (the script prints "Chrome ready on CDP port 9222").
3. Either use MCP tools (Option A) or write Playwright scripts (Option B).
4. You now control the visible browser.

## How to Interact (Read This First)

**The golden rule: Look before you act. Screenshot after every action.**

1. **Screenshot first.** Before doing anything, take a screenshot to see the current state of the page. Never assume what's on screen.
2. **One action at a time.** Do one click, one type, one scroll — then screenshot again to see the result. Never batch multiple actions into a single script.
3. **Verify each step.** After every interaction, take a screenshot and check: did the action have the expected effect? If not, adjust.
4. **Never write a long automation script.** You are not a test runner. You are an agent interacting with a live browser. Work step by step.
5. **Read the page.** Use `page.evaluate()` or `page.textContent()` to read what's on screen. Don't guess.

**Example flow:**
```
screenshot → see the page
navigate to URL → screenshot → verify page loaded
click element → screenshot → verify element responded
type text → screenshot → verify text appeared
```

**What NOT to do:**
- ❌ Write a 200-line script that does everything at once
- ❌ Assume a selector exists without checking
- ❌ Skip screenshots because "it should work"
- ❌ Chain multiple actions without verifying between them

## Tool Reference (MCP Mode)

### Browser Tools

#### `navigate`
```json
{ "url": "https://example.com", "wait_until": "networkidle" }
```
- `wait_until`: `load` | `domcontentloaded` | `networkidle` (default)
- Returns: `{ success, url, title, status_code }`

#### `observe_page`
```json
{ "modality": "text", "compact": true, "depth": 3 }
```
- `modality`: `text` (AOM tree) or `vision` (screenshot with overlays)
- `compact`: strip non-interactive nodes (saves tokens)
- `depth`: limit tree depth (optional)
- Returns: `{ aom_nodes, aom_markdown }` or `{ image_base64 }`

#### `interact`
```json
{ "action": "click", "ref": "e1" }
{ "action": "type", "ref": "e4", "value": "hello" }
{ "action": "hover", "ref": "e2" }
{ "action": "clear", "ref": "e4" }
```
- `ref`: element ref from observe_page (e.g. `e1`, `e2`)
- `instruction`: optional, enables action caching
- Auto-returns fresh snapshot after action

#### `scroll`
```json
{ "direction": "down", "amount_pixels": 400 }
```
- `direction`: `up` | `down` | `left` | `right`

#### `eval_js`
```json
{ "script": "document.title" }
```
- Runs JS in page context, returns result
- Warns on dangerous patterns (eval, innerHTML=)

### RSI Tools (Filesystem)

#### `read_file`
```json
{ "path": "src/index.ts", "line_numbers": true }
```
- Sandboxed to project root
- 10MB limit, binary detection

#### `write_file`
```json
{ "path": "src/new.ts", "content": "export const x = 1;" }
```
- Creates parent dirs automatically
- Protected patterns (.git, .env, .key, .pem)

#### `list_directory`
```json
{ "path": "src", "recursive": false }
```

#### `run_command`
```json
{ "command": "npm run build", "args": [] }
```
- Allowlisted commands only (npm, git, tsc, node, etc.)
- 30s timeout, 50k char stdout cap

#### `git`
```json
{ "action": "status" }
{ "action": "commit", "args": ["fix: typo"] }
```
- Auto-prefixes commits with `[self-improve]`

### Tab Management

#### `open_tab` / `switch_tab` / `close_tab` / `list_tabs`
```json
{ "tab_id": 2 }
```

### Session Persistence

#### `save_session` / `load_session` / `list_sessions`
```json
{ "profile_name": "my-login" }
```
- Cookies + localStorage saved/restored
- Must load BEFORE first navigate

## Workflow Pattern

For testing a website:
1. `navigate` → go to URL
2. `observe_page` (text) → get element refs
3. `interact` (click/type) → perform action
4. `observe_page` → verify result
5. Repeat 3-4 until done

For self-improvement:
1. `read_file` → read source code
2. `navigate` → browse docs for patterns
3. `write_file` → edit code
4. `run_command` → build and test
5. `git` → commit changes

## Browser Interaction Patterns

These are generic patterns learned from testing across many types of websites. Use them as a reference when interacting with any page.

### Dismissing Popups and Overlays

Before interacting with a page, always clear any obstructing elements:

```js
// Dismiss Chrome dialogs (password manager, alerts, etc.)
const okBtn = page.locator('button:has-text("OK")').first();
if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
  await okBtn.click();
}

// Remove JS-based overlays/modals
await page.evaluate(() => {
  document.querySelectorAll('[class*="dialog"], [class*="popup"], [role="alert"], .tox-notification').forEach(el => el.remove());
});

// Close context menus
await page.keyboard.press('Escape');
```

### Handling JavaScript Dialogs (alert, confirm, prompt)

Always set up the dialog listener **before** triggering the action, and clean it up after:

```js
let dialogMsg = '';
const handler = async (dialog) => {
  dialogMsg = dialog.message();
  try { await dialog.accept(); } catch {}
};
page.on('dialog', handler);

// Trigger the action that opens the dialog
await page.click('button');
await page.waitForTimeout(1000);

console.log('Dialog said:', dialogMsg);
page.removeListener('dialog', handler);
```

For prompts where you need to enter a value:

```js
page.on('dialog', async (dialog) => {
  await dialog.accept('your input here');
});
```

### Working with iframes

Use `frameLocator` for a single iframe, or `page.frames()` to enumerate all:

```js
// Single iframe by selector
const frame = page.frameLocator('#editor_iframe');
const body = frame.locator('body');
const text = await body.textContent();

// Or enumerate all frames
const frames = page.frames();
for (const frame of frames) {
  console.log(frame.url());
}
```

### Rich Text Editors (TinyMCE, CKEditor, etc.)

When the editor body has `contenteditable="false"` or is blocked by overlays, use the editor's JS API directly:

```js
// Check if TinyMCE API is available
const ready = await page.evaluate(() =>
  typeof tinymce !== 'undefined' && tinymce.editors?.length > 0
);

// Read content
const content = await page.evaluate(() => tinymce.editors[0].getContent());

// Set content
await page.evaluate(() => {
  tinymce.editors[0].setContent('<p>Hello!</p>');
});
```

### Dynamic Content (AJAX-loaded, delayed elements)

Don't use fixed timeouts. Use `waitForFunction` with a condition:

```js
// Wait for an element to become visible (not hidden by display:none)
await page.waitForFunction(() => {
  const el = document.querySelector('#result');
  return el && el.style.display !== 'none' && el.offsetParent !== null;
}, { timeout: 15000 });

// Wait for content to change
await page.waitForFunction(() => {
  const el = document.querySelector('#counter');
  return el && parseInt(el.textContent) > 0;
}, { timeout: 10000 });
```

### Drag and Drop

Playwright's `dragTo` may not work with all drag-and-drop implementations. Use manual mouse steps:

```js
const src = page.locator('#source');
const dst = page.locator('#target');
const srcBox = await src.boundingBox();
const dstBox = await dst.boundingBox();

await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  const x = srcBox.x + srcBox.width / 2 + (dstBox.x + dstBox.width / 2 - srcBox.x - srcBox.width / 2) * i / 20;
  const y = srcBox.y + srcBox.height / 2 + (dstBox.y + dstBox.height / 2 - srcBox.y - srcBox.height / 2) * i / 20;
  await page.mouse.move(x, y);
  await page.waitForTimeout(30);
}
await page.mouse.up();
```

### Hover Menus and Dropdowns

Some hover menus don't respond to Playwright's `hover()`. Use JS event dispatch:

```js
await page.evaluate(() => {
  const menuItem = document.querySelector('#menu-trigger');
  menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
});
await page.waitForTimeout(500);

// Then interact with the revealed submenu
await page.click('#submenu-item');
```

### Authentication

For HTTP Basic/Digest auth, pass credentials in the URL:

```js
await page.goto('https://user:pass@domain.com/protected');
```

For form-based login:

```js
await page.fill('#username', 'myuser');
await page.fill('#password', 'mypass');
await page.click('button[type="submit"]');
await page.waitForLoadState('networkidle');
const flash = await page.evaluate(() =>
  document.querySelector('.flash, #flash, .alert, .notification')?.textContent?.trim()
);
```

### Scroll and Fixed/Absolute Positioning

To check if an element stays visible after scrolling:

```js
await page.evaluate(() => window.scrollTo(0, 5000));
await page.waitForTimeout(500);

const rect = await page.evaluate(() => {
  const el = document.querySelector('#sticky-menu');
  const style = getComputedStyle(el);
  return {
    position: style.position, // 'fixed', 'absolute', 'static'
    top: el.getBoundingClientRect().top
  };
});
// 'fixed' = stays on screen; 'absolute' = scrolls with page
```

### Read-Only or Disabled Elements

When an element is `disabled` or `contenteditable="false"`, interact via JS:

```js
// Set value on a read-only input
await page.evaluate(() => {
  const input = document.querySelector('#readonly-input');
  input.value = 'new value';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

// Enable a disabled input
await page.evaluate(() => {
  document.querySelector('input[disabled]').removeAttribute('disabled');
});
```

### Collecting Page Data

Gather links, table data, or other structured info:

```js
// All links
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).map(a => ({
    text: a.textContent.trim(),
    href: a.href
  }))
);

// Table rows
const rows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('table tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
  )
);
```

## Config

Edit `config/browseagentic.yaml`:
- `browser.headless`: false to see the browser
- `browser.cdp_port`: 9222 (default) — set this to connect to existing Chrome
- `dev_mode.enabled`: true to allow localhost
- `cache.backend`: `filesystem` for persistent action cache

## Security

- RSI tools sandboxed to project root
- Path traversal blocked
- Command allowlisting (no shell injection)
- eval_js warns on dangerous patterns
- dev_mode must be operator-configured (not agent-toggleable)

## Troubleshooting

**Chrome not starting**: Ensure Chrome/Chromium is installed. Check `find_chrome` in `browser.sh` or set `browser.chrome_path` in config.

**CDP connection fails**: Verify Chrome is running with `./scripts/browser.sh status`. Check `curl http://127.0.0.1:9222/json/version`.

**MCP server won't start**: Run `npm run build` first to compile TypeScript. Check that `dist/index.js` exists.

**Page elements not found**: Some sites load content dynamically. Use `page.waitForLoadState('networkidle')` or `page.waitForSelector('#element')` before interacting.

**Dialog/overlay blocking clicks**: See "Dismissing Popups and Overlays" above. Remove overlays via JS before clicking.

**Drag and drop not working**: See "Drag and Drop" above. Use manual mouse steps instead of `dragTo`.
