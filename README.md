# BrowseAgentic

MCP server that gives AI agents a sandboxed browser. Translates page state into vision (screenshots with numbered overlays) or text (compressed accessibility tree) modalities.

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

Server runs on stdio. Send JSON-RPC requests to stdin, read responses from stdout.

## Docker

```bash
docker build -t browseagentic .
docker run -i --rm --ipc=host browseagentic
```

## Claude Code integration

Add to your `mcp.json`:

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

## Configuration

Edit `config/omnibrowser.yaml`. Set `OMNIBROWSER_CONFIG` env var to override path.

## Roadmap

- Fallback Vision Worker (OCR for opaque elements)
- SSE transport for cloud agents
- Multi-tab support
- Session persistence (cookies, localStorage)
- Shadow DOM traversal
- Human-in-the-loop interruption
- Firefox support
