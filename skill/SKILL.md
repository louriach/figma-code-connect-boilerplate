---
name: code-connect-export
description: Connects a Figma component library to a codebase using Code Connect. Use this skill when someone has a figma-components.json export from the Code Connect Export plugin, or wants to match Figma components to their codebase, generate .figma.ts stub files, or publish Code Connect snippets to Figma Dev Mode. Works in both Claude Code (fully automated) and the Claude desktop app (assisted mode).
---

# Code Connect Export Skill

This skill takes a `figma-components.json` file exported from the Code Connect Export Figma plugin and handles everything needed to get Code Connect live in Figma Dev Mode - matching components to code, generating stub files, publishing, and handing off to the team.

The goal is that a non-engineer - a designer, a product manager - can complete the full setup without writing code or running terminal commands themselves.

---

## Tone and format rules

- Always tell the user what you just did before asking for the next thing
- Always end a message that requires user action with a clear, specific instruction in bold
- Show progress at the start of every message: **[Step X of 6]**
- Never combine two questions in the same message
- Never move to the next step silently - always confirm what you received

---

## Step 0 - Detect environment (silent)

Before saying anything to the user, silently attempt to run `echo "ok"` via bash.

### If the command succeeds → CLAUDE CODE MODE

You have full filesystem and shell access. Proceed to the Opening message. All steps run fully automatically — read files, write files, run commands, create PRs.

Store `MODE = CLAUDE_CODE` for reference throughout.

### If the command fails → ASSISTED MODE

You are running in the Claude desktop app or web interface. You cannot read local files, write files, or run terminal commands. The flow adapts: the user will paste content to you, and you will generate file content for them to save manually and give them commands to run themselves.

Store `MODE = ASSISTED` for reference throughout.

Open with this message instead of the standard opening:

---

Hi! I'll help you connect your Figma components to your codebase so developers see live code snippets in Figma Dev Mode.

I can see I'm running in the Claude desktop app, so I'll work in **assisted mode** — I'll guide you through each step, generate all the files you need, and give you simple commands to copy and run. You'll need to paste a few things to me along the way, but I'll always tell you exactly what I need.

Here's what we'll do:

1. **Install the plugin** - a one-time setup in Figma
2. **Export your components** - run the plugin to scan your library
3. **Match to code** - I'll pair each Figma component with its code counterpart
4. **Generate files** - I'll write all the connection files for you to save
5. **Publish** - I'll give you a single command to run in your terminal
6. **Hand off** - create a summary for your engineering team

**To get started, have you used the Code Connect Export plugin before?** Reply **'yes'** if you have the plugin set up, or **'no'** if this is your first time.

---

Then continue from Step 1 using the ASSISTED MODE notes throughout.

---

## Standard opening (Claude Code mode only)

---

Hi! I'll help you connect your Figma components to your codebase so developers see live code snippets in Figma Dev Mode instead of auto-generated placeholders.

Here's what we'll do together:

1. **Install the plugin** - a one-time setup in Figma
2. **Export your components** - run the plugin to scan your library
3. **Match to code** - I'll pair each Figma component with its code counterpart
4. **Generate files** - I'll write all the connection files automatically
5. **Publish** - push everything live to Dev Mode
6. **Hand off** - create a summary for your engineering team

You won't need to write any code or run any terminal commands yourself.

**To get started, have you used the Code Connect Export plugin before?** Reply **'yes'** if you have the plugin set up, or **'no'** if this is your first time.

---

---

## Step 1 - Plugin setup [Step 1 of 6]

### If they have used the plugin before

Skip to Step 2.

### If this is their first time

---

**[Step 1 of 6] Install the plugin**

The plugin is a small tool that runs inside Figma and scans your component library. You only need to install it once.

**What you'll need:**
- Node.js installed on your computer ([download here](https://nodejs.org) if you don't have it)
- Access to the Figma file with your component library

**Step 1 of 3 - Download and build the plugin**

Open your terminal and run these commands one at a time:

```
git clone https://github.com/louriach/figma-code-connect-boilerplate.git
cd figma-code-connect-boilerplate/plugin
npm install
npm run build
```

**Once those commands finish, reply 'done' and I'll walk you through loading it into Figma.**

---

Wait for confirmation, then:

---

**Step 2 of 3 - Load the plugin into Figma**

1. Open Figma
2. Click the Figma logo (top left) → **Plugins** → **Development** → **Import plugin from manifest**
3. Navigate to the folder you cloned and select **`plugin/manifest.json`**
4. The plugin will appear under **Plugins → Development → Code Connect Export**

**Once you've imported it, reply 'done'.**

---

Wait for confirmation, then:

---

**Step 3 of 3 - Run the plugin and export your components**

1. Open the Figma file that contains your component library
2. Click the Figma logo → **Plugins** → **Development** → **Code Connect Export**
3. The plugin will open. Select the pages you want to scan and click **Scan selected pages**
4. Once scanning is complete, click **Export** on the result card
5. A file called `figma-components.json` will download to your computer

**When you have the file, reply 'done' and we'll move on.**

---

Wait for confirmation. Then move to Step 2.

---

## Step 2 - Load the export [Step 2 of 6]

### Claude Code mode

Ask:

---

**[Step 2 of 6] Load your export**

What is the path to your `figma-components.json` file? You can drag the file into this window or type the path.

---

Read the file. If it cannot be read: say what went wrong and ask them to check the path.

If successful, confirm what was found:

---

Got it. I can see **[X] components** across **[N] pages** from **[fileName]**, exported by [exportedBy.name].

**What is the path to your codebase?** This is the root folder where your components live (e.g. `/Users/you/projects/my-design-system`).

---

Read the directory. If it exists and contains component files, confirm what you found and the detected framework. If the framework is ambiguous, ask:

---

What framework is your codebase using?

- React (TypeScript or JavaScript)
- Vue
- SwiftUI
- Jetpack Compose
- Angular
- Plain HTML

**Reply with the name of your framework.**

---

### Assisted mode

Ask:

---

**[Step 2 of 6] Load your export**

Open your `figma-components.json` file in a text editor, select all the content, and paste it here.

---

Read the pasted JSON. Confirm what was found:

---

Got it. I can see **[X] components** across **[N] pages** from **[fileName]**.

Now I need to know a little about your codebase so I can generate the right files. **What framework is your project using?**

- React (TypeScript or JavaScript)
- Vue
- SwiftUI
- Jetpack Compose
- Angular
- Plain HTML

**Reply with the name of your framework.**

---

In assisted mode, you cannot scan the codebase directly. You will match components using semantic inference from the Figma names alone. Where confidence is low, ask the user for the correct component name. Proceed to Step 3.

---

## Step 3 - Component matching [Step 3 of 6]

Tell the user before starting:

---

**[Step 3 of 6] Matching components**

I'm now matching each Figma component to its code counterpart. This may take a moment...

---

*(In Claude Code mode: scan the codebase. In assisted mode: use semantic inference from Figma names only.)*

For each component in the export, attempt to find the matching code component:

**3a - Normalisation**
Strip Figma group prefixes (`Button / Primary` → `Button`), remove spaces, normalise case. Check for an exact or case-insensitive match.

**3b - Semantic inference**
If no exact match, use design-to-code naming heuristics:
- `Form / Input / Text` → `TextInput`
- `Navigation Bar` → `NavBar` or `Navbar`
- `Icon / Arrow Right` → `ArrowRightIcon`

**3c - Confidence scoring**
- **High**: exact or near-exact match after normalisation
- **Medium**: semantic match inferred from naming patterns
- **Low**: no confident match found

**3d - Present the matching review table**

---

Done. I matched **[X] of [Y]** components. Here's what I found:

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

**High confidence** matches are ready to go. **Medium and Low** rows need your input before I generate any files.

You can:
- **'confirm all'** - accept everything including medium matches
- **'confirm all high'** - confirm only the high confidence ones and I'll ask about the rest
- **'skip all low'** - exclude unmatched components from this run
- Tell me specific changes: *'change NavBar to NavigationBar'*, *'skip Overlay / Scrim'*

**What would you like to do?**

---

Rules:
- Do not generate any files until every row has been confirmed, edited, or skipped
- For edited rows, re-run prop mapping against the corrected name before confirming
- For rows with no match, ask the user to provide the component name or skip it

Once all rows are resolved:

- **Claude Code mode**: save confirmed mappings to `figma-connect.map.json` in the repository root
- **Assisted mode**: show the mappings as a JSON block the user can save manually

Confirm to the user:

---

All matches confirmed. Moving on to generating the connection files.

---

---

## Step 4 - Generate stub files [Step 4 of 6]

Tell the user before starting:

---

**[Step 4 of 6] Generating files**

Writing connection files for [X] confirmed components...

---

For each confirmed match, generate a `.figma.ts` file. Use the property type data from the export where available:
- `VARIANT` properties → `figma.enum()`
- `BOOLEAN` properties → `figma.boolean()`
- `TEXT` properties → `figma.string()`
- `INSTANCE_SWAP` properties → `figma.instance()`

In Claude Code mode, also read the TypeScript interface or prop types for the matched component to improve prop mapping.

Example output:

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

Multiple Figma components mapping to the same code component should produce a single `.figma.ts` file covering both via variant prop mapping.

### Claude Code mode

Write each file alongside its component file. Confirm when done:

---

Done. I've written [X] files:
- `Button.figma.ts`
- `TextInput.figma.ts`
- ...

Now let me check the publish configuration.

---

### Assisted mode

Output each file as a labelled code block with its intended save path. Then:

---

Done. Here are the [X] files to save. For each one, create the file at the path shown and paste in the content.

[code blocks for each file]

Once you've saved them, **reply 'done'** and I'll give you the command to publish them.

---

Wait for confirmation before continuing.

---

## Step 5 - Publish [Step 5 of 6]

### Claude Code mode

**5a - Check configuration**

Check for `figma.config.json`. If it does not exist, generate it and tell the user:

---

I've created `figma.config.json`:

```json
{
  "codeConnect": {
    "parser": "react",
    "include": ["**/*.figma.ts"],
    "label": "React"
  }
}
```

---

Check `package.json` includes a publish script. If not, add one.

**5b - Access token**

Check for `FIGMA_ACCESS_TOKEN` in `.env`. If it does not exist:

---

To publish, I need a Figma access token. Here's how to get one:

1. In Figma, click your avatar (top right) → **Settings**
2. Go to **Security** → **Personal access tokens**
3. Click **Generate new token**
4. Give it a name (e.g. "Code Connect"), and under scopes select **Code Connect: Write**
5. Copy the token

**Paste just the raw token value here** (it will look something like `figd_xxxxxxxx`). I'll store it securely and it won't be shared.

---

Store as `FIGMA_ACCESS_TOKEN=<value>` in `.env`. Confirm `.env` is in `.gitignore`. Then:

---

Token saved. Publishing now...

---

**5c - Run publish**

Run `npm run publish`. If successful:

---

Published successfully. All [X] components are now live in Figma Dev Mode.

---

If errors occur, diagnose and fix inline. Common errors:
- Invalid file key: re-check the URL in the `.figma.ts` file
- Missing parser: run `npm install @figma/code-connect` and retry
- Auth failure: tell the user the token may be wrong and ask them to paste a new one

### Assisted mode

First, check for and generate `figma.config.json` if needed — show it as a code block for the user to save.

Then:

---

**[Step 5 of 6] Publish**

You'll need a Figma access token to publish. Here's how to get one:

1. In Figma, click your avatar (top right) → **Settings**
2. Go to **Security** → **Personal access tokens**
3. Click **Generate new token**
4. Give it a name (e.g. "Code Connect"), and under scopes select **Code Connect: Write**
5. Copy the token — you'll use it in the command below

Once you have it, run this command in your terminal from your project root (replace `YOUR_TOKEN` with the actual value):

```
FIGMA_ACCESS_TOKEN=YOUR_TOKEN npx figma connect publish
```

**Paste the terminal output here** so I can check it completed successfully.

---

Read the pasted output. If successful, confirm and continue. If there are errors, diagnose and give the user a corrected command to run.

---

## Step 6 - Confirm and close [Step 6 of 6]

Ask the user to verify in Figma:

---

**[Step 6 of 6] Let's confirm it's working**

Open your Figma file, select any connected component, and open Dev Mode using the **`</>`** icon at the top right. You should see a code snippet showing your real component name and props.

**Reply 'yes' if you can see it, or describe what you see if something looks off.**

---

If they cannot see it: check the file key, confirm publish completed, check their Figma plan (Organisation or Enterprise required for Dev Mode).

Once confirmed working:

---

**You're done.** Here's a summary:

- **[X] components** are now live in Figma Dev Mode
- Connection files are in [path]
- Confirmed mappings are saved to `figma-connect.map.json` - future runs will reuse these automatically

---

Then ask:

---

One last thing: if a component is renamed or its props change in the future, someone will need to update the files and republish. **Who on your team will own that?** (You can say 'me', 'an engineer', or 'not sure yet'.)

---

Generate `HANDOFF.md` regardless of their answer:

```markdown
# Code Connect Handoff

**Generated:** [ISO timestamp]
**Figma file:** [fileName]
**Figma URL:** https://www.figma.com/file/[fileKey]
**Run by:** [exportedBy.name]

## What was connected

| Figma Component | Code Component | Confidence | Status |
|---|---|---|---|
| Button / Primary | Button | High | Connected |
| Form / Input / Text | TextInput | Medium (confirmed) | Connected |
| Tooltip / Dark | TooltipDark | Low (corrected) | Connected |
| Overlay / Scrim | - | - | Skipped |

## Skipped components

- **Overlay / Scrim** - no code match found. Can be connected in a future run.

## Files generated

All `.figma.ts` files are in [path]. Do not edit the node IDs or file keys directly.

## How to update a component

1. Open the relevant `.figma.ts` file
2. Update the prop mappings
3. Run `npm run publish`

## How to add more components

Run the Code Connect Export plugin again, export a new `figma-components.json`, and run this skill again. Previously confirmed mappings in `figma-connect.map.json` will be reused automatically.
```

**Claude Code mode**: write the file to the repository root.
**Assisted mode**: output it as a code block for the user to save.

Then ask:

---

I've also created `HANDOFF.md` with a full summary for your engineering team.

**Would you like to save all these files to your repository?** I can create a pull request that an engineer can review and merge. Reply **'yes'** or **'no'**.

---

**Claude Code mode** (if yes):
1. Check for Git. If not installed, guide them through installation.
2. Run `git add` for the generated files
3. Run `git commit -m "Add Code Connect stubs for [n] components"`
4. Run `gh pr create` with a clear title and body
5. Share the PR link: "Send this to an engineer to review and merge: [url]"

**Assisted mode** (if yes):

---

Here are the commands to create a pull request. Run them in your terminal from your project root:

```
git add .
git commit -m "Add Code Connect stubs for [n] components"
git push origin HEAD
```

Then open a pull request on GitHub/GitLab and share the link with your engineering team.

**If you're not sure how to do this, send the `HANDOFF.md` file to an engineer instead — it contains everything they need.**

---

If no: tell them where the files are locally and that they can share them with an engineer at any time.

---

## Persistence files

| File | Purpose | Commit? |
|---|---|---|
| `figma-components.json` | Plugin export | Optional |
| `figma-connect.map.json` | Confirmed name mappings - reused on future runs | Yes |
| `*.figma.ts` | One per connected code component | Yes |
| `HANDOFF.md` | Plain-language summary for the receiving engineer | Yes |
| `.env` | Figma access token | No - never commit this |

---

## Error handling

Handle all errors inline without stopping the flow or asking the user to do anything technical:

- **File not found / paste unreadable**: say what you tried and ask them to check or paste again
- **No components in export**: ask if the plugin was run on the right page
- **No matching component**: mark as Low confidence, ask the user to provide the name or skip
- **Publish fails with auth error**: walk the user through generating a new token
- **Publish fails with missing parser**: in Claude Code mode, run `npm install @figma/code-connect` and retry; in assisted mode, give the user the install command first then the publish command
- **Dev Mode not showing snippet**: check file key, check plan, retry publish — report findings before asking the user anything
