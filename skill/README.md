# Code Connect - Claude Skill

Reads a `figma-components.json` export from the Figma plugin, matches components to your codebase, generates all `.figma.ts` stubs, and publishes them to Figma Dev Mode.

## Installing the skill

1. Download `code-connect.skill`
2. Open the Claude desktop app
3. Drag the `.skill` file into any conversation, or install via **Settings → Skills**

## Triggering the skill

Once installed, say something like:

- *"Set up Code Connect using my Figma export"*
- *"I have a figma-components.json, help me connect it"*
- *"Connect my Figma library to my codebase"*

## What the skill does

1. Reads `figma-components.json` from the plugin export
2. Scans your repo for component files
3. Presents a matching review table - Figma name, inferred code component, confidence score
4. User confirms, corrects, or skips each row
5. Generates `.figma.ts` stub files for all confirmed matches
6. Runs `npm run publish` to push snippets to Figma Dev Mode
7. Asks who will own maintenance and generates a `HANDOFF.md`
8. Optionally guides the user through committing files and opening a PR

## Requirements

- Claude desktop app
- Claude Code (recommended - enables fully hands-off terminal execution)
- Node.js
- A codebase using React, Vue, SwiftUI, Jetpack Compose, or Angular
- A Figma Organisation or Enterprise plan (required by Figma for Dev Mode)

## Files generated

| File | Purpose |
|---|---|
| `*.figma.ts` | One per connected code component |
| `figma-connect.map.json` | Persisted name mappings for future runs |
| `HANDOFF.md` | Plain-language summary for the engineer receiving the PR |

## Editing the skill

The skill logic lives entirely in `code-connect.skill` - no build step required. Open it in any text editor to modify the prompts or flow.
