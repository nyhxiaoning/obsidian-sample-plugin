# Rule Status Markers Implementation Plan

**Goal:** Make the Rules tab distinguish the editable Markdown source from the validated rule snapshot used by AI and file operations.

**Architecture:** Keep the Markdown document as the user-facing source of truth and keep the existing `ruleActivation` snapshot as the execution gate. Add explanatory labels and activation metadata to the Rules tab, and keep AI analysis reading the latest activated snapshot.

**Tech Stack:** TypeScript, Obsidian API, existing `RuleStore`, existing Chinese i18n.

## Global Constraints

- Invalid rules must never become active.
- AI and file operations must use only the validated activated snapshot.
- Keep all user-facing text in the Chinese localization module.
- Do not add runtime dependencies.

### Task 1: Mark rule sources and execution state

**Files:**
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/views/tabs/rules-tab.ts`

- [ ] Add labels and descriptions for the editable source, active snapshot, structured settings, body, and source panes.
- [ ] Render an active-state summary with schema version, scope, activation time, and document hash when a valid snapshot exists.
- [ ] Render a clear inactive-state explanation when no valid snapshot exists.
- [ ] Build, lint, and run the existing tests.

### Task 2: Verify the user-visible flow

**Files:**
- Modify: `src/views/tabs/ai-organize-tab.ts` only if the latest activated-rule behavior regresses.

- [ ] Confirm the Rules tab distinguishes source and snapshot.
- [ ] Confirm the AI tab reports rule status separately from preview and upload confirmation requirements.
- [ ] Copy release artifacts to the current Vault plugin directory and reload the plugin.
