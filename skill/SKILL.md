---
name: code-connect-export
description: Connects a Figma component library to a codebase using Code Connect. Use this skill when someone has a figma-components.json export from the Code Connect Export plugin, or wants to match Figma components to their codebase, generate .figma.ts stub files, or publish Code Connect snippets to Figma Dev Mode.
---

# Code Connect Export Skill

This skill takes a `figma-components.json` file exported from the Code Connect Export Figma plugin and handles everything needed to get Code Connect live in Figma Dev Mode - matching components to code, generating stub files, publishing, and handing off to the team.

The goal is that a non-engineer - a designer, a product manager - can complete the full setup without writing code or running terminal commands themselves.

---

## What this skill does

1. Reads `figma-components.json` from the Figma plugin export
2. Scans the codebase to find matching components
3. Presents a matching review table with confidence scores for the user to confirm
4. Generates all `.figma.ts` stub files for confirmed matches
5. Runs `npm run publish` to push snippets live to Figma Dev Mode
6. Generates a `HANDOFF.md` for the engineering team
7. Optionally guides the user through saving the files to the repository

---

## Step 0 - Opening

Before asking anything, open with a single short message that explains what is about to happen:

"Great - let's get your Figma components connected to your codebase. I'll match each component to its code counterpart, generate the connection files, and publish them to Figma Dev Mode. You won't need to write any code or run any commands yourself. To get started, I just need a couple of things from you."

Then ask the following questions one at a time. Do not combine them.

---

## Step 1 - Preflight checks

Ask each question separately using `ask_user_input`.

**Question 1 - figma-components.json**

Ask: "Do you have a `figma-components.json` file from the Figma plugin?"
Options:
- Yes, I have the file
- I have not run the plugin yet

If they have not run the plugin, explain how to get it:
1. Clone the repository at https://github.com/louriach/figma-code-connect-boilerplate
2. Run `cd plugin && npm install && npm run build`
3. In Figma, go to Menu > Plugins > Development > Import plugin from manifest
4. Select `plugin/manifest.json`
5. Open the Figma file containing the component library
6. Run the plugin, select the components, and click Export

Wait until they confirm they have the file before continuing.

**Question 2 - file path**

Ask: "What is the path to your `figma-components.json` file? You can drag it into this window or type the path."

Read the file at the path they provide. If it cannot be read, ask them to check the path and try again.

**Question 3 - repository**

Ask: "What is the path to your codebase? This is the folder where your components live."

Confirm the path exists and that it contains component files before continuing.

**Question 4 - framework**

Scan the repository to detect the framework automatically (look for `package.json`, `.swift` files, `build.gradle`, etc). If it is clear, confirm with the user rather than asking. If it is ambiguous, ask:

"What framework is your codebase using?"
Options:
- React (JavaScript or TypeScript)
- Vue
- SwiftUI
- Jetpack Compose
- Angular
- Plain HTML

---

## Step 2 - Component matching

Read the `figma-components.json` file and scan the codebase to find matching components.

For each component in the export, attempt to find the matching code component using this approach:

**Step 2a - Normalisation**
Strip Figma group prefixes (e.g. `Button / Primary` becomes `Button`), remove spaces, normalise case. Check for an exact or case-insensitive match in the repository.

**Step 2b - Semantic inference**
If no exact match, use design-to-code naming heuristics to find the most likely match:
- `Form / Input / Text` -> `TextInput`
- `Navigation Bar` -> `NavBar` or `Navbar`
- `Icon / Arrow Right` -> `ArrowRightIcon`

**Step 2c - Confidence scoring**
Assign each match a confidence tier:
- High: exact or near-exact match after normalisation
- Medium: semantic match inferred from naming patterns
- Low: no confident match found

**Step 2d - Present the matching review table**

Present every component as a row. Do not generate any files until the user has reviewed and confirmed the matches.

Format:

```
Figma Component          Code Match        Confidence   Action
Button / Primary         Button            High         [Confirm] [Edit] [Skip]
Button / Secondary       Button            High         [Confirm] [Edit] [Skip]
Form / Input / Text      TextInput         Medium       [Confirm] [Edit] [Skip]
Navigation Bar           NavBar            Medium       [Confirm] [Edit] [Skip]
Tooltip / Dark           ?                 Low          [type component name]
```

Rules:
- High rows are pre-confirmed. Tell the user they can change any of them.
- Medium and Low rows require explicit action before proceeding.
- Offer bulk actions: "Confirm all high", "Skip all low", "Confirm all"
- For edited rows, re-run prop mapping against the corrected component name before confirming.

Do not move to Step 3 until every row has been confirmed, edited, or skipped.

Save all confirmed mappings to `figma-connect.map.json` in the repository root. On future runs, check this file first and skip inference for already-mapped components.

---

## Step 3 - Generate stub files

For each confirmed match, generate a `.figma.ts` file.

Read the TypeScript interface or prop types for the matched component and use them to map Figma properties to code props.

Example output for a Button component:

```ts
import figma from "@figma/code-connect";
import { Button } from "./src/components/Button";

figma.connect(Button, "https://www.figma.com/file/FILE_KEY?node-id=NODE_ID", {
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

Place each file alongside its component file, or in a `/figma` subdirectory if the team prefers to keep them separate. Ask if unsure.

Multiple Figma components that map to the same code component (e.g. Button / Primary and Button / Secondary both mapping to Button) should produce a single `.figma.ts` file that covers both via the variant prop mapping, not two separate files.

---

## Step 4 - Publish

Before publishing, check that Code Connect is configured:

1. Check for `figma.config.json` in the repository. If it does not exist, generate it:

```json
{
  "codeConnect": {
    "parser": "react",
    "include": ["**/*.figma.ts"],
    "label": "React"
  }
}
```

Adjust `parser` and `label` for the detected framework.

2. Check that `package.json` includes a publish script. If not, add one:

```json
"scripts": {
  "publish": "figma connect publish"
}
```

3. Check for a Figma access token in `.env`. If it does not exist, ask the user to generate one:

"You will need a Figma access token to publish. In Figma, go to Settings > Security > Personal access tokens, create a new token with Code Connect write access, and paste it here."

Store the token in `.env` as `FIGMA_ACCESS_TOKEN=...` and confirm `.env` is in `.gitignore`.

4. Run `npm run publish` and confirm it completes without errors.

If errors occur, diagnose and fix them inline. Common errors:
- Invalid file key: re-check the URL in the `.figma.ts` file
- Missing parser: ensure the correct framework parser is installed
- Auth failure: re-check the access token

---

## Step 5 - Confirm live in Dev Mode

After publishing, ask the user to check in Figma:

"Open your Figma file, select one of the connected components, and open Dev Mode (the `</>` icon at the top right). You should see a code snippet with your real component name and props. Can you confirm you can see it?"

If they cannot see it, check:
- Is the Figma file key in `figma.config.json` correct?
- Did the publish command complete without errors?
- Is Dev Mode available on their Figma plan?

---

## Step 6 - Closing stage

Once the user confirms the snippets are live, do not end the conversation. Cover the following.

**What you just did**

Summarise briefly:
- How many components are now live in Dev Mode
- Where the generated `.figma.ts` files are
- A reminder to open Figma and verify a component

**Maintenance question**

Ask explicitly:

"If a component is renamed or its props change in the future, someone will need to update these files and republish. Who on your team will own that?"

- If they say they will own it: continue to the repository push section
- If they say an engineer will: generate the HANDOFF.md and guide them to share it
- If they are unsure: generate the HANDOFF.md and explain both options

**Generate HANDOFF.md**

Always generate a `HANDOFF.md` regardless of the answer above. Use this format:

```markdown
# Code Connect Handoff

**Generated:** [ISO timestamp]
**Figma file:** [file name]
**Figma URL:** [full URL]
**Run by:** [Figma username from the export metadata]

## What was connected

| Figma Component | Code Component | Confidence | Status |
|---|---|---|---|
| Button / Primary | Button | High | Connected |
| Form / Input / Text | TextInput | Medium (confirmed) | Connected |
| Tooltip / Dark | TooltipDark | Low (corrected) | Connected |
| Overlay / Scrim | - | - | Skipped |

## Skipped components

The following components were not connected in this run:

- **Overlay / Scrim** - no code match found

These can be connected in a future run by providing the matching component name.

## Files generated

All `.figma.ts` files are in [path]. Do not edit the node IDs or file keys directly - they are tied to specific Figma nodes.

## How to update a component

If a component is renamed or its props change:

1. Open the relevant `.figma.ts` file
2. Update the prop mappings
3. Run `npm run publish`

## How to add more components

Run the Code Connect Export plugin in Figma again, export a new `figma-components.json`, and run this skill again. Previously confirmed mappings are saved in `figma-connect.map.json` and will be reused automatically.
```

**Optional: push to repository**

Ask: "Would you like to save these files to your repository so the team has them long-term? This will create a pull request an engineer can review and merge."

If yes:
1. Check for Git. If not installed, guide them through installing it for their platform.
2. Run `git add` for the generated files
3. Run `git commit -m "Add Code Connect stubs for [n] components"`
4. Run `gh pr create` with a clear title and description listing the connected components
5. Share the PR link and tell them to send it to an engineer to merge

If no: tell them where the files live locally and that they can hand them to an engineer at any time.

---

## Persistence files

| File | Purpose | Commit? |
|---|---|---|
| `figma-components.json` | Plugin export | Optional |
| `figma-connect.map.json` | Confirmed name mappings | Yes |
| `*.figma.ts` | One per connected code component | Yes |
| `HANDOFF.md` | Summary for the engineering team | Yes |
| `.env` | Figma access token | No |

---

## Error handling

Handle these inline without stopping the flow:

- **File not found**: ask the user to re-check the path
- **No components in export**: ask if the plugin was run on the right page
- **No matching component in repo**: mark as Low confidence and ask the user to provide the name
- **Publish fails with auth error**: guide the user to regenerate the access token
- **Publish fails with missing parser**: run `npm install @figma/code-connect` and retry
- **Dev Mode not showing snippet**: check file key, check plan, retry publish
