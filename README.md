# BrowseAgentic

Standalone MCP server that gives AI agents a sandboxed browser with recursive self-improvement capabilities. Full browser automation: navigate, observe, interact, scroll, screenshots, tab management, session persistence.

## Features

- **13 tools**: navigate, observe_page, interact, scroll, eval_js, read_file, write_file, list_directory, run_command, git, save_session, load_session, list_sessions
- **Vision modality**: Color-coded SoM overlays (yellow=links, orange=buttons, coral=inputs, green=checkboxes)
- **Text modality**: YAML-indented accessibility snapshot with refs (e1, e2, ...)
- **Compact mode**: Strip non-interactive nodes to reduce token usage
- **Auto-snapshot**: Interact returns fresh page state automatically
- **Action caching**: SHA-256 keyed cache with variable substitution and self-heal
- **Multi-tab**: Open, switch, close tabs; popup auto-registration
- **Session persistence**: Save/restore cookies + localStorage
- **Response budget**: Caps element count and response size
- **Security**: Path sandboxing, command allowlisting, localhost/IP blocking, eval_js XSS detection, secret redaction

## Install

```bash
npm install
npx playwright install chromium
```

## Local usage

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t browseagentic .
docker run -i --rm --ipc=host browseagentic
```

## Claude Code integration

```json
{
  "mcpServers": {
    "browseagentic": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "BROWSEAGENTIC_CONFIG": "./config/browseagentic.yaml"
      }
    }
  }
}
```

## Tools

### Browser Tools
| Tool | Description |
|---|---|
| `navigate` | Navigate to a URL with networkidle fallback |
| `observe_page` | Capture page state (vision or text modality) |
| `interact` | Click, type, hover, or clear on an element |
| `scroll` | Scroll the viewport |
| `eval_js` | Execute JavaScript (warn/block/off XSS modes) |

### Tab Management
| Tool | Description |
|---|---|
| `open_tab` | Open a new browser tab |
| `switch_tab` | Switch to a different tab |
| `close_tab` | Close a tab |
| `list_tabs` | List all open tabs |

### RSI Tools
| Tool | Description |
|---|---|
| `read_file` | Read local files (sandboxed, binary detection, 10MB limit) |
| `write_file` | Write local files (sandboxed, protected patterns) |
| `list_directory` | List directory contents |
| `run_command` | Execute allowlisted commands |
| `git` | Git operations (status, diff, log, commit) |

### Session Tools
| Tool | Description |
|---|---|
| `save_session` | Save browser session to a named profile |
| `load_session` | Load a saved session profile |
| `list_sessions` | List all saved profiles |

## Configuration

Edit `config/browseagentic.yaml`. Key sections:

- `security`: Guardrails, secret redaction, eval_js XSS modes, console capture level
- `budget`: Element count cap (20), response char cap (4000), overflow directory
- `cache`: Backend (memory/filesystem), TTL (168 hours)
- `rsi`: Sandbox root, protected patterns, command allowlist
- `tabs`: Max open tabs
- `session`: Profiles directory

## Self-Improvement Workflow

The agent can improve BrowseAgentic itself:

1. `read_file` to read source code
2. `navigate` to browse docs/GitHub for patterns
3. `write_file` to edit source
4. `run_command` to build and test
5. `git` to commit changes

## Security

- RSI tools restricted to sandbox root (`rsi.sandbox_root`)
- Symlink traversal detection
- Command allowlisting (no shell injection)
- eval_js: warn/block/off modes for dangerous patterns
- Secret redaction in console logs (configurable regex patterns)
- Network guardrails block localhost, private IPs, domain blocklists

## Roadmap

- SSE transport for cloud agents
- Connect to existing Chrome (extension architecture)
- Anti-detect/stealth presets
- Two-step DOM diff for multi-step actions
- LLM-integrated self-heal (re-inference on cache miss)
