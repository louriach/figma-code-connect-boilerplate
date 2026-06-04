# Figma Code Connect — Plugin & Skill Boilerplate

A two-part system that lets non-engineers (designers, PMs, design system owners) set up [Figma Code Connect](https://www.figma.com/developers/code-connect) across an entire component library — without writing code, running terminal commands, or copying URLs one at a time.

---

## How it works

### The problem

Setting up Code Connect manually means:
- Copying every component URL from Figma one at a time
- Writing `.figma.ts` stub files by hand
- Running CLI commands to publish
- Knowing enough about your codebase to map Figma names to component names

This is out of reach for most designers and PMs, even though they're the ones who benefit most from Code Connect being set up.

### The solution

Two tools that each do what they're best at, connected by a simple JSON file:

```
Figma Plugin  →  figma-components.json  →  Claude Skill
(scan & pick)         (handoff)           (match, generate, publish)
```

**1. Figma Plugin** — opens inside Figma, scans the file, shows a checklist of every main component. User picks which ones to connect, clicks Export.

**2. Claude Skill** — reads the export, scans your codebase, and presents a matching review table with confidence scores. User confirms or corrects the matches, Claude generates all `.figma.ts` files and publishes them to Dev Mode.

---

## Repository structure

```
figma-code-connect-boilerplate/
├── plugin/                  # Figma plugin source
│   ├── manifest.json
│   ├── src/
│   │   ├── main.ts          # Plugin logic (component scanning, export)
│   │   └── ui.html          # Plugin UI (checklist)
│   └── README.md
├── skill/                   # Claude skill
│   ├── code-connect.skill
│   └── README.md
├── SPEC.md                  # Full product specification
└── README.md                # This file
```

---

## Part 1: Figma Plugin

### What it does

- Scans the open Figma file for every main component (not instances or variants)
- Groups them by their `/`-separated prefix (e.g. all `Button /` variants together)
- Lets the user check/uncheck individual components or entire groups
- Exports a `figma-components.json` file containing node IDs, URLs, and property names

### What it does NOT do

- It does not read or touch your codebase
- It does not require a Figma access token (read-only plugin API)
- It does not generate any `.figma.ts` files

### Installing the plugin

The plugin runs locally — no Figma Community listing required.

1. Clone this repository
2. In Figma, go to **Menu → Plugins → Development → Import plugin from manifest**
3. Select `plugin/manifest.json`
4. Open any Figma file containing your component library
5. Run the plugin from **Plugins → Development → Code Connect Export**

> **Sharing across your org:** If you want the plugin available to your whole team without everyone cloning the repo, Figma supports private org plugins. That's a future option — not required to get started.

### Using the plugin

1. Run the plugin inside your Figma component library file
2. The plugin scans the file and shows a checklist of all main components
3. Use the group toggles or individual checkboxes to select what to connect
4. Click **Export** and save `figma-components.json` somewhere accessible

---

## Part 2: Claude Skill

### What it does

- Reads `figma-components.json` from the plugin
- Scans your codebase to find matching components
- Presents a **matching review table** with confidence scores (High / Medium / Low)
- User confirms, corrects, or skips each match
- Generates all `.figma.ts` stub files with correct imports and prop mappings
- Runs `npm run publish` to push snippets to Figma Dev Mode
- Generates a `HANDOFF.md` for any engineer who needs to take over
- Optionally guides the user through committing the files and opening a pull request

### Installing the skill

1. Download `skill/code-connect.skill`
2. Open the Claude desktop app
3. Drag the `.skill` file into any conversation, or install via **Settings → Skills**

### Using the skill

Once installed, trigger it by saying:

- *"Set up Code Connect using my Figma export"*
- *"I have a figma-components.json, help me connect it"*
- *"Connect my Figma library to my codebase"*

Claude will ask for the path to your `figma-components.json` and guide you through the rest.

> **Note:** Claude Code must be installed for fully hands-off operation (no terminal commands required). If you're using the Claude desktop app without Claude Code, the skill will generate all files and provide a single command to copy and run.

---

## The matching review table

The core of the skill experience. Claude presents every selected component as a row:

```
┌─────────────────────────────┬──────────────────┬────────────┬──────────────────────────────┐
│ Figma Component             │ Code Match       │ Confidence │ Action                       │
├─────────────────────────────┼──────────────────┼────────────┼──────────────────────────────┤
│ Button / Primary            │ Button           │ ● High     │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Button / Secondary          │ Button           │ ● High     │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Form / Input / Text         │ TextInput        │ ◐ Medium   │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Navigation Bar              │ NavBar           │ ◐ Medium   │ ✓ Confirm  ✎ Edit  ✗ Skip   │
│ Tooltip / Dark              │ ?                │ ○ Low      │ [type component name]        │
└─────────────────────────────┴──────────────────┴────────────┴──────────────────────────────┘
```

| Confidence | Meaning |
|---|---|
| ● High | Exact or near-exact name match after normalisation |
| ◐ Medium | Semantic match inferred by Claude (naming convention differences, abbreviations) |
| ○ Low | No confident match — user supplies the component name |

High-confidence rows are pre-confirmed. Medium and Low rows require the user to act before any files are generated.

**Bulk actions:** "Confirm all high", "Skip all low", "Confirm all"

---

## What gets generated

| File | Purpose | Commit to repo? |
|---|---|---|
| `figma-components.json` | Plugin export | Optional |
| `figma-connect.map.json` | Confirmed name mappings (speeds up future runs) | Yes — share with team |
| `*.figma.ts` | One per connected code component | Yes |
| `HANDOFF.md` | Plain-language summary for the receiving engineer | Yes |
| `.env` | Figma access token | No — add to `.gitignore` |

### HANDOFF.md

Every run generates a `HANDOFF.md` that includes:

- Timestamp and Figma file URL
- Who ran the export (Figma username)
- Full component table with confidence scores and confirmed/skipped status
- List of skipped components so nothing is silently forgotten
- Plain-language instructions for updating a component and adding more in future

This means a non-engineer can complete the entire setup and hand something coherent to an engineer, rather than just passing over a folder of `.ts` files.

---

## After publishing

Code Connect snippets are **live in Dev Mode immediately** after the skill runs `npm run publish`. The generated files do not need to be in the repository for Dev Mode to work — the repo step is about long-term maintainability.

At the end of every run, the skill asks:

> "If a component is renamed or its props change in the future, someone will need to update these files and republish. Who on your team will own that?"

Based on the answer, it either guides the user through the optional repo push or generates the `HANDOFF.md` to pass to an engineer.

### Optional: push to repository

If the user wants to commit the files:

1. Skill checks for Git (guides installation if missing)
2. Commits all generated files
3. Opens a pull request via `gh pr create`
4. User shares the PR link — an engineer merges it, no write access needed from the user

---

## Requirements

| Requirement | Plugin | Skill |
|---|---|---|
| Figma Organisation or Enterprise plan | Yes | — |
| Figma desktop app | Yes | — |
| Claude desktop app | — | Yes |
| Claude Code (for hands-off terminal steps) | — | Recommended |
| Node.js | — | Yes |
| Git + gh CLI (for optional repo push) | — | Optional |

---

## Full specification

See [SPEC.md](./SPEC.md) for the complete product specification including the export format, naming convention handling, stub generation examples, and all open questions.

---

## Contributing

Issues and PRs welcome. The skill logic lives in `skill/code-connect.skill` and the plugin UI in `plugin/src/`. See each subdirectory's README for development instructions.
