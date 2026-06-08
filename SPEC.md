# Code Connect: Plugin + Skill Spec

## Goal

Enable non-engineers (designers, PMs, design system owners) to set up Figma Code Connect across an entire component library — without writing code or contributing directly to a codebase.

The system splits into two parts that hand off via a JSON export file:

1. **Figma Plugin** — scans the file, exports a structured component manifest
2. **Claude Skill** — reads the manifest, matches components to code, generates and publishes all `.figma.ts` files

---

## Part 1: Figma Plugin

### Purpose

Replace the manual "copy each component URL" step with a single scan-and-export workflow inside Figma.

### Plugin UI

The plugin uses a persistent four-tab interface that is always visible at the top of the window. There is no onboarding gate — all tabs are accessible from the moment the plugin opens.

#### Home tab

A static reference screen. Shows the plugin logo, a short description, a numbered three-step explainer (Pick pages → Scan → Export), and a note about the Figma plan requirement for Dev Mode. Available any time as a reminder without interrupting the workflow.

#### Pages tab

A bordered, scrollable list of every page in the open Figma file. Controls:

- **All / None** — in the box header, no extra dividers
- **Page row** — checkbox + page name + live scan status (spinner with frame-level progress text while scanning, component count when done)
- **Footer** — "[N] pages selected" summary + **Scan selected pages** button

Scanning can be triggered multiple times per session. Each new scan resets the page status indicators and creates a new card in the Export tab.

While scanning, the footer shows running progress ("Scanning 3 / 5 pages") and the button is disabled.

#### Export tab

Shows a card for every completed scan in the current session. Cards accumulate — scanning different page subsets produces multiple independent cards.

**Card anatomy:**
- Header: "Scan N" title + start time + duration (once complete)
- Stats row: pages scanned / components found / skipped count (amber if non-zero)
- Pages row: one pill per scanned page
- Export button (disabled while in progress, active when complete)

While a scan is running, a live in-progress card appears with a spinner and ticking counts. It becomes a full card when the scan finishes. The Export tab badge shows the number of completed scans.

#### Log tab

Lists every component that was skipped during scanning, with the page name and error reason. Badge count appears when there are issues. Empty state when all components scanned cleanly.

### Scan architecture

- Pages are listed immediately on load — no scan on open
- Scanning is per-page and on-demand, triggered by the user
- Within each page, scanning is frame-by-frame with event-loop yields between each top-level frame so log messages reach the UI in real time and slow or corrupt frames are identifiable by name
- Leaf node types (`TEXT`, `RECTANGLE`, `ELLIPSE`, `VECTOR`, `INSTANCE`, etc.) are skipped before any traversal — they cannot contain components
- A single `findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })` call per frame retrieves both node types in one pass
- Variant children (a `COMPONENT` whose parent is a `COMPONENT_SET`) are excluded — the set itself represents the full component

### What the plugin does NOT do

- It does not touch the codebase
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
        { "name": "variant",  "type": "VARIANT", "values": ["Primary", "Secondary", "Tertiary"] },
        { "name": "size",     "type": "VARIANT", "values": ["Small", "Medium", "Large"] },
        { "name": "disabled", "type": "BOOLEAN" },
        { "name": "label",    "type": "TEXT" }
      ],
      "variantNames": ["Button/Primary", "Button/Secondary", "Button/Tertiary"]
    },
    {
      "nodeId": "4:88",
      "figmaName": "TextInput",
      "group": "Form",
      "page": "Components",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=4%3A88",
      "properties": [
        { "name": "state",    "type": "VARIANT", "values": ["Default", "Focus", "Error", "Disabled"] },
        { "name": "label",    "type": "TEXT" },
        { "name": "helpText", "type": "TEXT" }
      ]
    }
  ]
}
```

**`properties`** — full definitions including type and, for `VARIANT` properties, every possible value. The skill uses these to emit precise `figma.enum()`, `figma.boolean()`, `figma.string()`, and `figma.instance()` calls without guessing.

**`variantNames`** — present on `COMPONENT_SET` nodes only. Lists the Figma display names of every variant child so the skill knows multiple Figma names map to a single code component and should produce one `.figma.ts` file.

---

## Part 2: Claude Skill

### Purpose

Take the plugin export and do everything else: match components to code, confirm uncertain matches, generate stubs, publish.

### Trigger phrases

- "Set up Code Connect using my Figma export"
- "I have a figma-components.json, help me connect it"
- "Connect my Figma library to my codebase"

### Environment detection

The skill detects its environment silently on launch by attempting a shell command.

**Claude Code mode** — full filesystem and shell access. Reads files, writes stubs, runs `npm run publish`, creates PRs. No terminal interaction required from the user.

**Assisted mode** — no filesystem or shell access (desktop app or web interface). The skill adapts every step: the user pastes content, Claude generates files as code blocks, and gives commands to copy/run. The matching table, confidence scoring, and HANDOFF.md work identically in both modes.

### Skill flow

#### Step 0 — Environment check (silent)
Attempt `echo "ok"` via bash. Set mode to CLAUDE_CODE or ASSISTED. Open with the appropriate greeting.

#### Step 1 — Plugin setup
If the user has not run the plugin, walk through installation in three sub-steps: clone and build, import into Figma, run and export. Wait for explicit confirmation at each sub-step before continuing.

#### Step 2 — Load the export
- **Claude Code**: ask for the file path, read it, confirm what was found, ask for the codebase path, scan for framework
- **Assisted**: ask for the JSON content pasted directly, confirm what was found, ask for `ls src/components` output to get real component names, ask for framework

#### Step 3 — Component matching
Match each Figma component to a code component:

1. **Normalisation** — strip group prefixes, remove spaces, normalise case
2. **Semantic inference** — apply design-to-code naming heuristics if no exact match
3. **Confidence scoring** — must always reflect a match against a real component name; never assign High or Medium without one

Present the full matching table and wait for user action before generating any files.

Save confirmed mappings to `figma-connect.map.json`. Reused on future runs.

#### Step 4 — Generate stub files
Use property type data from the export:
- `VARIANT` → `figma.enum()` with all variant values pre-populated
- `BOOLEAN` → `figma.boolean()`
- `TEXT` → `figma.string()`
- `INSTANCE_SWAP` → `figma.instance()`

Components sharing a code counterpart (identified via `variantNames`) produce one `.figma.ts` file.

#### Step 5 — Publish
Check config, ask for Figma token if needed (`figd_xxxxxxxx` format, stored in `.env`).
- **Claude Code**: run `npm run publish`
- **Assisted**: give copy/paste command, ask user to paste output

#### Step 6 — Confirm and close
Verify snippet appears in Dev Mode. Summarise, ask maintenance ownership question, generate `HANDOFF.md`, offer repo push.

---

## The Matching Review Table

```
Figma Component          Code Match        Confidence
─────────────────────────────────────────────────────
Button / Primary         Button            ● High
Button / Secondary       Button            ● High
Form / Input / Text      TextInput         ◐ Medium
Navigation Bar           NavBar            ◐ Medium
Tooltip / Dark           ?                 ○ Low
Overlay / Scrim          ?                 ○ Low
```

| Confidence | Criteria |
|---|---|
| **High** | Exact or near-exact match to a real component name after normalisation |
| **Medium** | Semantic inference matched to a real component name |
| **Low** | No match found — user must supply the name or skip |

Bulk actions: "Confirm all", "Confirm all high", "Skip all low"

---

## Stub generation example (`Button.figma.ts`)

Because the export includes property types and all variant values, the skill emits complete stubs without reading the component source or guessing at types:

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

## Naming convention handling

### Step 1: Normalisation
Strip Figma group prefixes (`Button / Primary` → `Button`), remove spaces, normalise case. Check for exact or case-insensitive match.

### Step 2: Semantic inference
If no exact match, compare against real component names using design-to-code heuristics:
- `Form / Input / Text` → `TextInput`
- `Navigation Bar` → `NavBar` or `Navbar`
- `Icon / Arrow Right` → `ArrowRightIcon`

### Step 3: Persist confirmed mappings

```json
{
  "mappings": [
    {
      "figmaName": "Button",
      "codeComponent": "Button",
      "nodeId": "1:23",
      "confirmedAt": "2026-06-08T10:15:00Z",
      "confirmedBy": "auto"
    },
    {
      "figmaName": "Form / Input / Text",
      "codeComponent": "TextInput",
      "nodeId": "3:55",
      "confirmedAt": "2026-06-08T10:16:00Z",
      "confirmedBy": "user-corrected"
    }
  ]
}
```

---

## HANDOFF.md

Generated at the end of every run. Written in plain language for the receiving engineer.

```markdown
# Code Connect Handoff

**Generated:** 2026-06-08T10:45:00Z
**Figma file:** Design System v2
**Figma URL:** https://www.figma.com/file/abc123XYZ
**Run by:** Sarah Chen

## What was connected

| Figma Component | Code Component | Confidence | Status |
|---|---|---|---|
| Button | Button | High | Connected |
| Form / Input / Text | TextInput | Medium (confirmed) | Connected |
| Tooltip / Dark | TooltipDark | Low (corrected) | Connected |
| Overlay / Scrim | — | — | Skipped |

## Skipped components

- **Overlay / Scrim** — no code match found

## Files generated

All `.figma.ts` files are in `/src/figma/`. Do not edit node IDs or file keys directly.

## How to update a component

1. Open the relevant `.figma.ts` file
2. Update the prop mappings
3. Run `npm run publish`

## How to add more components

Re-run the plugin, export a new `figma-components.json`, and run the skill again.
Previously confirmed mappings in `figma-connect.map.json` are reused automatically.
```

---

## Persistence files

| File | Purpose | Commit? |
|---|---|---|
| `figma-components.json` | Plugin export | Optional |
| `figma-connect.map.json` | Confirmed name mappings — reused on future runs | Yes |
| `*.figma.ts` | One per connected code component | Yes |
| `HANDOFF.md` | Plain-language summary for the receiving engineer | Yes |
| `.env` | Figma access token | No — never commit |

---

## What the user never has to do

- Copy any Figma URLs manually
- Write any TypeScript
- Know what a node ID is
- Understand the Code Connect file format
- Run terminal commands (Claude Code handles this; assisted mode gives copy/paste commands)

The one unavoidable manual step is generating a Figma access token. The skill walks through this once; after that it is stored in `.env` and never asked for again.

---

## Open questions

1. **Plugin distribution** — Currently local dev plugin only. Private org plugin is a future option.
2. **Live preview in plugin** — Should the plugin show a preview of the code match, or leave that to the skill?
3. **Token requirement** — Publishing requires a Figma access token. The plugin step is token-free; only the skill's publish step needs one.
4. **Git on managed machines** — The optional repo push requires Git. Fallback: zip the generated files for manual handoff.
