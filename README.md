# Figma Code Connect — Plugin & Skill Boilerplate

A two-part system that lets non-engineers (designers, PMs, design system owners) set up [Figma Code Connect](https://www.figma.com/developers/code-connect) across an entire component library — without writing code, running terminal commands, or copying URLs one at a time.

---

## How it works

### The problem

Setting up Code Connect manually means:
- Copying every component URL from Figma one at a time
- Writing `.figma.ts` stub files by hand for every component
- Running CLI commands to publish
- Knowing enough about your codebase to map Figma names to code component names

This is out of reach for most designers and PMs, even though they're the ones who benefit most.

### The solution

Two tools that each do what they're best at, connected by a simple JSON file:

```
Figma Plugin  →  figma-components.json  →  Claude Skill
(scan & export)       (handoff file)      (match, generate, publish)
```

**Figma Plugin** — opens inside Figma, scans your file page by page, and exports a structured manifest of every main component including its properties and variant values.

**Claude Skill** — reads the export, matches each Figma component to its code counterpart with a confidence score, generates all `.figma.ts` stub files, and publishes them to Dev Mode.

---

## Repository structure

```
figma-code-connect-boilerplate/
├── plugin/
│   ├── manifest.json
│   ├── package.json
│   └── src/
│       ├── main.ts       # Plugin logic — component scanning and export
│       └── ui.html       # Plugin UI — tab-based interface
├── skill/
│   ├── SKILL.md                    # Skill source
│   └── code-connect-export.skill   # Packaged skill (import this)
├── SPEC.md
└── README.md
```

---

## Part 1: Figma Plugin

### Installing the plugin

The plugin runs locally — no Figma Community listing required.

```bash
git clone https://github.com/louriach/figma-code-connect-boilerplate.git
cd figma-code-connect-boilerplate/plugin
npm install
npm run build
```

Then in Figma: **Menu → Plugins → Development → Import plugin from manifest** → select `plugin/manifest.json`.

> **Sharing across your org:** Figma supports private org plugins if you want the plugin available to your whole team without everyone cloning the repo. That's a future option — not required to get started.

### Using the plugin

The plugin has four tabs that are always visible:

**Home** — reference guide explaining the three-step process. Returns here any time for a reminder of how it works.

**Pages** — lists every page in the open Figma file in a bordered, scrollable box. Use the All / None controls to select which pages to scan, then click **Scan selected pages** in the footer. Each page shows live scan progress as it processes, frame by frame.

**Export** — shows a card for every completed scan in the current session. Each card displays the pages that were scanned, how many components were found, how many were skipped, and how long it took. Every card has its own **Export** button — multiple scans can coexist and be exported independently. A live in-progress card appears during scanning with a spinner and running counts.

**Log** — lists any components that were skipped during scanning (broken component sets, nodes with errors), with the reason for each skip. The tab shows a badge count when there are issues.

### What the plugin does NOT do

- It does not read or touch your codebase
- It does not require a Figma access token (read-only plugin API)
- It does not generate any `.figma.ts` files

### Export format (`figma-components.json`)

```json
{
  "fileKey": "abc123XYZ",
  "fileName": "Design System v2",
  "exportedAt": "2026-06-08T10:00:00Z",
  "exportedBy": {
    "name": "Sarah Chen",
    "id": "user:123"
  },
  "components": [
    {
      "nodeId": "1:23",
      "figmaName": "Button",
      "group": "Button",
      "page": "Components",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=1%3A23",
      "properties": [
        { "name": "variant", "type": "VARIANT", "values": ["Primary", "Secondary", "Tertiary"] },
        { "name": "size",    "type": "VARIANT", "values": ["Small", "Medium", "Large"] },
        { "name": "disabled", "type": "BOOLEAN" },
        { "name": "label",    "type": "TEXT" }
      ],
      "variantNames": ["Button/Primary", "Button/Secondary", "Button/Tertiary"]
    },
    {
      "nodeId": "2:10",
      "figmaName": "Icon / Arrow Right",
      "group": "Icon",
      "page": "Components",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=2%3A10",
      "properties": [
        { "name": "size", "type": "VARIANT", "values": ["16", "24", "32"] }
      ]
    }
  ]
}
```

**`properties`** — full property definitions including type (`VARIANT`, `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`) and, for variant properties, the complete list of possible values. The skill uses this to emit precise `figma.enum()`, `figma.boolean()`, and `figma.string()` calls without guessing.

**`variantNames`** — present on component set nodes only. Lists the Figma names of every variant child, so the skill knows that multiple Figma names (e.g. `Button/Primary`, `Button/Secondary`) map to a single code component and should produce one `.figma.ts` file, not several.

---

## Part 2: Claude Skill

### Installing the skill

1. Download `skill/code-connect-export.skill`
2. In Claude Code or the Claude desktop app, install via **Settings → Skills** or drag the file into a conversation

### Using the skill

Trigger it by saying:
- *"Set up Code Connect using my Figma export"*
- *"I have a figma-components.json, help me connect it"*
- *"Connect my Figma library to my codebase"*

### Two modes

The skill detects its environment automatically on launch:

**Claude Code mode** (fully automated)
The skill reads files, writes `.figma.ts` stubs, runs `npm run publish`, and can open a pull request — no terminal interaction needed from the user.

**Assisted mode** (desktop app or web interface)
When Claude Code isn't available, the skill adapts: the user pastes their component export and component list, Claude generates all files as code blocks for the user to save, and provides a single copy/paste publish command. The same matching table, confidence scoring, and HANDOFF.md are generated in both modes.

### Matching review table

Before generating any files, the skill presents every component as a row and waits for confirmation:

```
Figma Component          Code Match        Confidence
─────────────────────────────────────────────────────
Button / Primary         Button            ● High
Button / Secondary       Button            ● High
Form / Input / Text      TextInput         ◐ Medium
Navigation Bar           NavBar            ◐ Medium
Tooltip / Dark           ?                 ○ Low
```

| Confidence | Meaning |
|---|---|
| ● High | Exact or near-exact name match |
| ◐ Medium | Semantic match from naming patterns |
| ○ Low | No match — user provides the correct name |

Bulk actions: **'confirm all'**, **'confirm all high'**, **'skip all low'**.

### What gets generated

| File | Purpose | Commit? |
|---|---|---|
| `figma-components.json` | Plugin export | Optional |
| `figma-connect.map.json` | Confirmed name mappings — reused on future runs | Yes |
| `*.figma.ts` | One per connected code component | Yes |
| `HANDOFF.md` | Plain-language summary for the receiving engineer | Yes |
| `.env` | Figma access token | No — never commit |

### Generated stub example

Because the export includes property types and variant values, the skill can emit complete stubs without guessing:

```ts
import figma from "@figma/code-connect";
import { Button } from "./src/components/Button";

figma.connect(Button, "https://www.figma.com/file/abc123XYZ?node-id=1%3A23", {
  props: {
    variant: figma.enum("variant", {
      Primary: "primary",
      Secondary: "secondary",
      Tertiary: "tertiary",
    }),
    size: figma.enum("size", {
      Small: "sm",
      Medium: "md",
      Large: "lg",
    }),
    disabled: figma.boolean("disabled"),
    label: figma.string("label"),
  },
  example: ({ variant, size, disabled, label }) => (
    <Button variant={variant} size={size} disabled={disabled}>
      {label}
    </Button>
  ),
});
```

---

## Requirements

| Requirement | Plugin | Skill |
|---|---|---|
| Figma Organisation or Enterprise plan | For Dev Mode snippets | — |
| Node.js | Yes (to build plugin) | Yes |
| Claude Code | — | For fully automated mode |
| Git + gh CLI | — | For optional PR creation |

---

## Full specification

See [SPEC.md](./SPEC.md) for the complete product specification.
