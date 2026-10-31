# Knowledge Base Assistant

Knowledge Base Assistant is an Obsidian desktop plugin for maintaining a structured knowledge base. It combines deterministic local checks and file operations with optional AI suggestions. All file changes require an explicit user confirmation.

## Features

The plugin opens a four-tab knowledge base panel:

- **Overview** — check or regenerate the knowledge-base index and open the configured folder.
- **Rules** — edit `知识库规则.md` through structured settings, explanatory content, and the complete Markdown source. Invalid structured rules can still be saved as Markdown, while the most recent valid configuration remains active.
- **AI organize** — manually analyze the current document by default, or switch to the current folder, for classification, summaries, related links, and proposed changes.
- **Daily backfill** — review the day's raw material at the end of the day and run a manual weekly review for associations, conflicts, omissions, stale knowledge, and skill candidates.

## Installation and development

This project requires Node.js 18 or newer and npm.

```bash
npm install
npm run dev       # development watch build
npm run build     # production build
npm test
npm run lint
```

The production bundle is generated as `main.js` at the repository root. Do not commit generated files or `node_modules/`.

## Desktop-only index operations

The Overview tab runs the configured Python index script from the active Vault root:

```bash
python3 000ai知识库价值写作体系/系统/generate-index.py
python3 000ai知识库价值写作体系/系统/generate-index.py --check
```

The first command regenerates the index; the second only checks whether it is out of date. The plugin invokes Python with parameterized arguments and does not use shell interpolation. The Python executable and script path are configurable, but the script must remain inside the Vault. Because Obsidian mobile cannot launch this local process safely, index operations are available only on desktop.

Default paths are:

```text
Knowledge base: 000ai知识库价值写作体系
Rules:         000ai知识库价值写作体系/系统/知识库规则.md
Index script: 000ai知识库价值写作体系/系统/generate-index.py
Python:        /usr/bin/python3
```

## Rules and migration

`知识库规则.md` is the human-readable rule source and contains a marked YAML configuration block. The Rules tab edits that configuration through the form while preserving the explanatory Markdown. The complete-source editor can modify the whole document.

The plugin validates the configuration before activating it. If a document contains invalid structured rules, it remains saveable as Markdown, but the plugin continues using the most recent valid configuration and reports the validation error. Rule schema changes use `schemaVersion`; future migrations should preserve older rule documents where possible.

The deterministic rule engine handles checks and confirmed operations such as frontmatter fixes, template application, file moves, and index regeneration. Destructive deletion is denied by default.

## OpenAI-compatible setup and privacy

Configure the API base URL, model, and API key in **Settings → Community plugins → Knowledge base assistant**. The API key is stored in the local plugin data store.

AI analysis is manual. Opening, switching, or saving a note never sends content automatically. Before each request, the panel shows the selected files and content scope; the request is sent only after explicit upload confirmation.

AI output is treated as suggestions, not authority. Proposed patches and moves are shown as diffs and are applied only after separate confirmation and local safety checks. If a file changes after analysis, the operation is rejected as stale. Operation history stores metadata such as timestamps, scope, rule version, status, and messages, but not Vault content or raw AI responses.

## Manual installation

Build the plugin, then copy these release files into your Vault:

```text
<Vault>/.obsidian/plugins/<plugin-id>/
├── main.js
├── manifest.json
└── styles.css       # if present
```

Reload Obsidian and enable the plugin under **Settings → Community plugins**.

## Release checklist

For each release:

1. Update the SemVer `version` and compatible `minAppVersion` in `manifest.json`.
2. Add the version-to-minimum-app-version mapping to `versions.json`.
3. Run `npm run build`, `npm test`, and `npm run lint`.
4. Create a GitHub release whose tag exactly matches `manifest.json`'s version; do not add a leading `v`.
5. Attach `manifest.json`, `main.js`, and `styles.css` (when present) as individual release assets.
6. Follow the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and community-plugin submission process when publishing or updating the catalog entry.

The plugin ID is a stable public identifier. Do not change it after release.

## Documentation

- [Obsidian plugin documentation](https://docs.obsidian.md)
- [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
