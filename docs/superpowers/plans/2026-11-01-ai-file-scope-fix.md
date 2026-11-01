# AI File Scope Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI organize tab reliably select the active Markdown document or the active folder recursively, while explaining when the selection is outside the configured safe root.

**Architecture:** Extract file selection into a small pure helper that receives the active file, Markdown files, configured root, and scope. The UI will render distinct empty-state messages for no active Markdown, no files in the folder, and files outside the safe root.

**Tech Stack:** TypeScript, Obsidian Vault APIs, Node test runner, esbuild.

## Global Constraints

- Preserve the active rules root as the safety boundary.
- Do not send Vault content before preview and explicit confirmation.
- Keep the default scope as the current document.
- Use npm scripts and do not commit generated `main.js`.

### Task 1: Add a testable file-scope selector

**Files:**
- Create: `src/views/tabs/file-selection.ts`
- Create: `tests/views/file-selection.test.ts`

- [ ] Write tests for current document, recursive folder, and outside-root cases.
- [ ] Run the focused tests and observe the missing-module failure.
- [ ] Implement `selectMarkdownPaths(files, activePath, scope, root)` with normalized path-boundary checks.
- [ ] Run the focused tests and verify they pass.

### Task 2: Integrate selection and user-facing status

**Files:**
- Modify: `src/views/tabs/ai-organize-tab.ts`
- Modify: `src/i18n/zh-CN.ts`

- [ ] Replace the inline parent comparison with the selector.
- [ ] Keep current-document selection independent of unrelated folders while enforcing the configured root.
- [ ] Add distinct messages for missing active Markdown, empty folder, and outside-root selection.
- [ ] Preserve preview reset and confirmation reset on every new preview.

### Task 3: Verify release behavior

**Files:**
- Modify: none

- [ ] Run `npm test`.
- [ ] Run `npm run build` and copy release artifacts to the current Vault plugin directory.
- [ ] Reload the plugin and verify both scope options in the AI tab.
