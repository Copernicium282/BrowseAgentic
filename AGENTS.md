# BrowseAgentic — Agent Guide

BrowseAgentic is a standalone MCP server that gives AI agents a sandboxed browser. You connect to it via MCP and use its tools to navigate, observe, interact, and modify code.

## Architecture

- **User** runs `./scripts/browser.sh start` to launch Chrome (visible window)
- **Agent** connects via MCP stdio and controls the browser through tools
- **User** runs `./scripts/browser.sh stop` to kill Chrome when done
- Browser CDP port: 9222 (default)

## How to Start a Session

1. Ask the user to run: `./scripts/browser.sh start`
2. Wait for confirmation that Chrome is ready
3. Connect via MCP server (stdio transport)
4. You now control the visible browser

## Tool Reference

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

## Config

Edit `config/browseagentic.yaml`:
- `browser.headless`: false to see the browser
- `dev_mode.enabled`: true to allow localhost
- `cache.backend`: `filesystem` for persistent action cache

## Security

- RSI tools sandboxed to project root
- Path traversal blocked
- Command allowlisting (no shell injection)
- eval_js warns on dangerous patterns
- dev_mode must be operator-configured (not agent-toggleable)
