# BrowseAgentic

MCP server that gives AI agents a sandboxed browser with recursive self-improvement capabilities.

## Features

- **5 browser tools**: navigate, observe_page (vision + text), interact, scroll, eval_js
- **5 RSI tools**: read_file, write_file, list_directory, run_command, git
- **Vision modality**: Screenshots with numbered bounding boxes over every clickable element
- **Text modality**: Compressed accessibility tree with refs (e1, e2, ...)
- **Compact mode**: Strip non-interactive nodes to reduce token usage
- **Auto-snapshot**: Interact returns fresh page state automatically
- **Security**: Path sandboxing, command allowlisting, localhost/IP blocking

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
        "OMNIBROWSER_CONFIG": "./config/omnibrowser.yaml"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `navigate` | Navigate to a URL |
| `observe_page` | Capture page state (vision or text modality) |
| `interact` | Click, type, hover, or clear on an element |
| `scroll` | Scroll the viewport |
| `eval_js` | Execute JavaScript in the page context |
| `read_file` | Read local files (sandboxed) |
| `write_file` | Write local files (sandboxed) |
| `list_directory` | List directory contents |
| `run_command` | Execute allowlisted commands |
| `git` | Git operations (status, diff, log, commit) |

## Self-Improvement Workflow

The agent can improve BrowseAgentic itself:

1. `read_file` to read source code
2. `navigate` to browse docs/GitHub for patterns
3. `write_file` to edit source
4. `run_command` to build and test
5. `git` to commit changes

## Configuration

Edit `config/omnibrowser.yaml`. Key settings:

- `security.allowed_paths`: Directories filesystem tools can access
- `security.blocked_paths`: Paths to block (default: .git, node_modules, dist)
- `security.allowed_commands`: Commands run_command can execute

## Roadmap

- Action caching with self-healing
- Paint-order occlusion filtering
- Compound component synthesis for `<select>`, `<input type="range">`
- SSE transport for cloud agents
- Multi-tab support
