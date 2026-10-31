# Knowledge Base Assistant

Knowledge Base Assistant is an Obsidian desktop plugin for maintaining a structured knowledge base. It combines deterministic local checks and file operations with optional AI suggestions. All file changes require an explicit user confirmation.

插件默认使用简体中文界面，包含概览、规则、AI 整理和每日知识回填四个功能页。命令、配置键、规则 YAML 字段和技术路径保持原样，便于兼容已有配置。

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

## AI 服务商、OpenAI-compatible setup and privacy

插件支持五种 AI 服务商：一个自定义 API 服务商，以及四个本机命令行服务商：Codex、Claude、Gemini 和 OpenCode。四个本机 CLI 的安装、登录和账号权限由用户自行完成；插件不会代替用户安装或登录这些工具。

在 **Settings → Community plugins → Knowledge base assistant** 的 AI 服务商设置中：

1. 选择要配置的本机 CLI，并确认可执行文件路径。默认使用 PATH 中的命令名：`codex`、`claude`、`gemini`、`opencode`；如果命令不在 PATH 中，可以填写本机可执行文件的自定义路径。
2. 先点击“检测命令”，确认命令存在并能返回版本信息。
3. 检测成功后点击“发送最小测试请求”。测试提示词固定且不包含任何 Vault 内容；只有测试返回可解析的 AI 结果后，才能点击“使用此服务商”。
4. 使用本机 CLI 进行实际整理时，仍须在 AI 整理页面检查文件范围并明确确认上传。CLI 不会直接修改 Vault，AI 输出仍然只是建议，文件修改必须经过插件的差异预览、安全检查和单独确认。

本机 CLI 功能仅在 Obsidian 桌面端可用。自定义 API 服务商仍按下方说明配置。

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
