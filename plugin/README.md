# Code Connect Export — Figma Plugin

Scans a Figma file for main components, lets you pick which ones to connect, and exports a `figma-components.json` for the Claude skill to process.

## Development

### Prerequisites

- Node.js 18+
- A Figma account with access to the file you want to scan

### Setup

```bash
cd plugin
npm install
npm run build   # compiles src/main.ts → src/main.js (required before loading in Figma)
```

### Loading in Figma

The plugin runs locally as a development plugin — no Figma Community publishing required.

1. In Figma, go to **Menu → Plugins → Development → Import plugin from manifest**
2. Select `plugin/manifest.json`
3. Open your component library file
4. Run via **Plugins → Development → Code Connect Export**

> **For teams:** Figma supports private org plugins if you want to share this across your organisation without everyone cloning the repo. That's a future option once the plugin is stable.

### Build

```bash
npm run build      # one-time build
npm run watch      # rebuild on save during development
```

## File structure

```
plugin/
├── manifest.json       # Figma plugin manifest
├── package.json
├── src/
│   ├── main.ts         # Plugin logic — runs in Figma's sandbox
│   └── ui.html         # Plugin UI — checklist and export button
└── README.md
```

## How the plugin works

1. `main.ts` runs in Figma's plugin sandbox and has access to the Figma API
2. On load, it traverses `figma.root` to find all `COMPONENT` nodes (main components only — not instances or component sets/variants)
3. Components are grouped by their `/`-separated name prefix
4. The component list is sent to the UI via `figma.ui.postMessage`
5. When the user clicks Export, the UI sends the selected components back to `main.ts`
6. `main.ts` enriches each component with its node ID, URL, and property names, then sends the final JSON back to the UI
7. The UI triggers a file download of `figma-components.json`

## Export format

```json
{
  "fileKey": "abc123XYZ",
  "fileName": "Design System v2",
  "exportedAt": "2026-06-03T10:00:00Z",
  "exportedBy": {
    "name": "Sarah Chen",
    "email": "sarah@company.com"
  },
  "components": [
    {
      "nodeId": "1:23",
      "figmaName": "Button / Primary",
      "group": "Button",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=1%3A23",
      "properties": ["variant", "size", "disabled", "label"]
    }
  ]
}
```
