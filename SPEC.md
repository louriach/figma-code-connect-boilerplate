# Code Connect: Plugin + Skill Spec

## Goal

Enable non-engineers (designers, PMs, design system owners) to set up Figma Code Connect across an entire component library — without writing code or contributing directly to a codebase.

The system splits into two parts that hand off via a JSON export file:

1. **Figma Plugin** — scans the file, lets the user pick components, exports a manifest
2. **Claude Skill** — reads the manifest, matches components to code, generates and publishes all `.figma.ts` files

---

## Part 1: Figma Plugin

### Purpose
Replace the manual "copy each component URL" step with a single scan-and-select workflow inside Figma.

### User flow

1. User opens the plugin inside their Figma file
2. Plugin scans the file and lists every **main component** (not instances, not variants — just the top-level components)
3. User sees a checklist of all components, grouped by Figma page or component group (the `/`-separated prefix)
4. User checks the ones they want to connect, or uses "Select all"
5. User clicks **Export** → plugin writes `figma-components.json` to a location they choose

### Component checklist UI

| # | Component (Figma name) | Group | Node ID |
|---|---|---|---|
| ☑ | Button / Primary | Button | 1:23 |
| ☑ | Button / Secondary | Button | 1:24 |
| ☐ | Icon / Arrow Right | Icon | 2:10 |

- Components are grouped by their `/`-prefix so the list stays manageable on large libraries
- "Select all in group" toggle per group
- Search/filter bar for large libraries
- Shows total selected count before export

### Export format (`figma-components.json`)

```json
{
  "fileKey": "abc123XYZ",
  "fileName": "Design System v2",
  "exportedAt": "2026-06-03T10:00:00Z",
  "components": [
    {
      "nodeId": "1:23",
      "figmaName": "Button / Primary",
      "group": "Button",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=1%3A23",
      "properties": ["variant", "size", "disabled", "label"]
    },
    {
      "nodeId": "1:24",
      "figmaName": "Button / Secondary",
      "group": "Button",
      "url": "https://www.figma.com/file/abc123XYZ?node-id=1%3A24",
      "properties": ["size", "disabled", "label"]
    }
  ]
}
```

### What the plugin does NOT do
- It does not touch the codebase
- It does not require a Figma access token (read-only plugin API)
- It does not generate any `.figma.ts` files

---

## Part 2: Claude Skill (updated)

### Purpose
Take the plugin export and do everything else: match components to code, confirm uncertain matches, generate stubs, publish.

### Trigger phrases
- "Set up Code Connect using my Figma export"
- "I have a figma-components.json, help me connect it"
- "Connect my Figma library to my codebase"

### User flow

1. User provides the path to `figma-components.json` (or drags it in)
2. Skill reads the file and scans the repo for components
3. Skill presents the **matching review table** (see below)
4. User confirms, corrects, or skips rows
5. Skill generates all `.figma.ts` files for confirmed matches
6. Skill runs `npm run publish` and confirms each component appears in Dev Mode ← **primary goal complete**
7. Skill writes a `figma-connect.map.json` to persist the confirmed mappings
8. Skill presents the **closing stage** — what happens next, maintenance ownership, optional repo push

---

## The Matching Review Table

This is the core UX of the skill step. Claude presents every component as a row with its best guess at a code match and a confidence score.

### Layout

```
┌─────────────────────────────┬──────────────────┬────────────┬──────────────────────────────┐
│ Figma Component             │ Code Match       │ Confidence │ Action                       │
├─────────────────────────────┼──────────────────┼────────────┼──────────────────────────────┤
│ Button / Primary            │ Button           │ ● High     │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Button / Secondary          │ Button           │ ● High     │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Form / Input / Text         │ TextInput        │ ◐ Medium   │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Navigation Bar              │ NavBar           │ ◐ Medium   │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Icon / Arrow Right          │ ArrowRightIcon   │ ◐ Medium   │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Tooltip / Dark              │ ?                │ ○ Low      │ [type component name]        │
│ Overlay / Scrim             │ ?                │ ○ Low      │ [type component name]        │
└─────────────────────────────┴──────────────────┴────────────┴──────────────────────────────┘
```

### Confidence tiers

| Score | Criteria |
|---|---|
| **High** | Leaf name matches a repo component exactly or near-exactly after normalization (case, spaces, punctuation) |
| **Medium** | Semantic match inferred by Claude — naming convention differences, abbreviations, common design-to-code patterns |
| **Low** | No confident match found; user must supply the component name manually |

### Actions per row

- **Confirm** — accept the match as-is, proceed to stub generation
- **Edit** — inline text field to type the correct component name; Claude re-runs prop mapping against the corrected name
- **Skip** — exclude this component from the current run (can return to it later)

High-confidence rows default to confirmed; medium and low rows require explicit user action before proceeding.

### Bulk actions

- "Confirm all high" — confirms every High row in one step
- "Skip all low" — skips unmatched components for now
- "Confirm all" — confirms everything including medium (power user shortcut)

---

## Naming convention handling

The skill uses a layered approach to resolve Figma-to-code name mismatches:

### Step 1: Normalisation
Strip Figma group prefixes (`Button / Primary` → `Button`), remove spaces, normalize case. Check for an exact or case-insensitive match in the repo.

### Step 2: Claude semantic inference
If no exact match, Claude compares the Figma name against all exported component names in the repo and picks the most likely match using design-to-code naming heuristics:
- `Form / Input / Text` → `TextInput`
- `Navigation Bar` → `NavBar` or `Navbar`
- `Icon / Arrow Right` → `ArrowRightIcon`

### Step 3: Persist confirmed mappings
Once the user confirms or corrects a match, it is written to `figma-connect.map.json`:

```json
{
  "mappings": [
    {
      "figmaName": "Button / Primary",
      "codeComponent": "Button",
      "nodeId": "1:23",
      "confirmedAt": "2026-06-03T10:15:00Z",
      "confirmedBy": "manual"
    },
    {
      "figmaName": "Form / Input / Text",
      "codeComponent": "TextInput",
      "nodeId": "3:55",
      "confirmedAt": "2026-06-03T10:16:00Z",
      "confirmedBy": "user-corrected"
    }
  ]
}
```

On future runs, the skill checks this file first and skips the inference step for already-mapped components. The mapping file can be committed to the repo so the whole team benefits.

---

## Stub generation

For each confirmed match, the skill generates a `.figma.ts` file using the component's Figma properties mapped to its TypeScript props.

### Example output (`Button.figma.ts`)

```ts
import figma from "@figma/code-connect";
import { Button } from "./src/components/Button";

figma.connect(Button, "https://www.figma.com/file/abc123XYZ?node-id=1%3A23", {
  props: {
    variant: figma.enum("variant", {
      Primary: "primary",
      Secondary: "secondary",
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

Prop mapping follows the same pattern as the existing skill: Claude reads the TypeScript interface for the matched component and aligns Figma property names to prop names and types.

---

## What the user never has to do

- Copy any Figma URLs manually
- Write any TypeScript
- Run any terminal commands (Claude Code handles all CLI steps)
- Know what a node ID is
- Understand the Code Connect file format

The one manual step is generating a Figma access token (a settings page in Figma, not a terminal step). The skill walks them through this once; after that it is stored in `.env` and never asked for again.

> **Note on Claude Code vs. desktop app:** The "no terminal commands" promise requires Claude Code (agentic mode). If the user runs the skill via the Claude desktop app without Claude Code installed, the skill falls back to generating all files and providing a single command to copy and run — still significantly better than the one-component-at-a-time flow, but not fully hands-off.

---

## Closing stage

After publishing, the skill does not simply end. It opens a short conversation about what comes next.

### What you just did

The skill summarises:
- How many components are now live in Dev Mode
- Where the generated `.figma.ts` files live locally
- A link to the Figma file to verify snippets are appearing

### Maintenance question

The skill asks explicitly:

> "If a component is renamed or its props change in the future, someone will need to update these files and republish. Who on your team will own that?"

- **"I will"** → proceed to the optional repo push stage below
- **"An engineer will"** → generate a `HANDOFF.md` (see below) and guide the user to share it
- **"Not sure yet"** → generate the `HANDOFF.md` anyway and explain both paths

### Optional: push to repository

If the user wants to save the files back to the repo:

1. Skill checks whether Git is installed
2. If not → guides them through installing Git (step-by-step, platform-specific, no assumed knowledge)
3. Skill commits the generated files and opens a pull request via `gh pr create`
4. User shares the PR link with an engineer to merge — no write access required on the user's part

This stage is explicitly optional. Code Connect is already live in Dev Mode at this point; the repo push is about long-term maintainability, not immediate functionality.

---

## HANDOFF.md

Generated alongside the `.figma.ts` files at the end of every run. Written in plain language for the engineer receiving it.

### Format

```markdown
# Code Connect Handoff

**Generated:** 2026-06-03T10:45:00Z
**Figma file:** Design System v2
**Figma URL:** https://www.figma.com/file/abc123XYZ
**Run by:** Sarah Chen (sarah@company.com)

## What was connected

| Figma Component | Code Component | Confidence | Status |
|---|---|---|---|
| Button / Primary | Button | High | ✓ Connected |
| Button / Secondary | Button | High | ✓ Connected |
| Form / Input / Text | TextInput | Medium (user confirmed) | ✓ Connected |
| Navigation Bar | NavBar | Medium (user confirmed) | ✓ Connected |
| Tooltip / Dark | TooltipDark | Low (user corrected) | ✓ Connected |
| Overlay / Scrim | — | — | ✗ Skipped |

## What was skipped

The following components were excluded during setup and are not yet connected:

- **Overlay / Scrim** — no code match found, excluded by user

These can be connected in a future run by providing the matching component name.

## Files generated

All `.figma.ts` files are in `/src/figma/`. Do not edit the node IDs or file keys — these are tied directly to Figma.

## How to update a component

If a component is renamed or its props change:

1. Open the relevant `.figma.ts` file
2. Update the prop mappings
3. Run `npm run publish` to push the updated snippet to Figma Dev Mode

## How to add more components

Re-run the Figma Code Connect plugin in Figma, export a new `figma-components.json`, and run the skill again. Previously confirmed mappings are remembered in `figma-connect.map.json`.
```

### Why this file matters

- Gives the receiving engineer full context without needing to ask the person who ran it
- The timestamp and Figma URL make it a clear audit trail
- The confidence column flags which mappings to scrutinise during PR review
- The skipped components list ensures nothing is silently forgotten

---

## Persistence files

| File | Purpose | Commit? |
|---|---|---|
| `figma-components.json` | Plugin export — source of truth for selected components | Optional |
| `figma-connect.map.json` | Confirmed name mappings — speeds up future runs | Yes — share with team |
| `*.figma.ts` | One per connected component | Yes |
| `HANDOFF.md` | Plain-language summary for the engineer receiving the PR | Yes |
| `.env` | Figma access token | No |

---

## Open questions

1. **Plugin distribution** — Figma Community (public) vs. private org plugin? Private is faster to ship but limits reach.
2. **Repo access from plugin** — the plugin cannot read the codebase directly; the skill handles all repo work. Is the file-handoff (JSON export) sufficient, or do users want a live preview of the code match inside the plugin UI?
3. **Variant handling** — multiple Figma components in the same group (e.g. `Button / Primary`, `Button / Secondary`) often map to a single code component with a `variant` prop. The skill should detect this pattern and generate one `.figma.ts` per code component, not one per Figma component. Needs explicit handling.
4. **Framework detection** — the skill already detects the framework (React, Vue, etc.) from the repo. Should the plugin export include a framework hint, or leave detection entirely to the skill?
5. **Token requirement** — publishing via the CLI requires a Figma access token. The skill handles this today. No change needed, but worth noting that the plugin step is token-free while the skill step is not.
6. **Git installation** — the optional repo push stage requires Git. The skill guides installation, but this adds friction for users on managed/locked-down machines. May need a fallback (e.g. zip the generated files for manual handoff).
