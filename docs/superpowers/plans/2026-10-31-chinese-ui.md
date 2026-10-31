# Chinese UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plugin’s default user-facing interface Simplified Chinese without changing commands, settings keys, rule values, API payloads, or behavior.

**Architecture:** Add a focused `src/i18n/zh-CN.ts` module containing display strings grouped by page and operation. Replace English UI literals in the view, tabs, settings, notices, and command/ribbon labels with these constants; keep technical identifiers and persisted values unchanged.

**Tech Stack:** Existing TypeScript, Obsidian API, esbuild, Node test runner through `tsx`.

## Global Constraints

- Default UI language is Simplified Chinese; do not add a language selector.
- Keep command IDs, settings keys, plugin ID, YAML keys, status values, action values, and API request schemas unchanged.
- Translate display text only; do not translate paths, model names, code, enum values, or executable commands.
- Preserve all existing upload confirmation, diff preview, conflict detection, and file-operation behavior.
- Keep `main.ts` focused on lifecycle and dependency wiring.
- Do not modify the external `notebooks` Vault during localization.

---

### Task 1: Add centralized Chinese copy and replace plugin UI strings

**Files:**
- Create: `src/i18n/zh-CN.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`
- Modify: `src/views/knowledge-base-view.ts`
- Modify: `src/views/tabs/overview-tab.ts`
- Modify: `src/views/tabs/rules-tab.ts`
- Modify: `src/views/tabs/ai-organize-tab.ts`
- Modify: `src/views/tabs/daily-backfill-tab.ts`

**Interfaces:**

```ts
export const zhCN = {
  plugin: { ribbon: string; command: string; viewTitle: string },
  tabs: { overview: string; rules: string; aiOrganize: string; dailyBackfill: string },
  settings: { ... },
  overview: { ... },
  rules: { ... },
  ai: { ... },
  daily: { ... },
  common: { ... },
} as const;
```

- [ ] **Step 1: Define the copy map.** Include Chinese strings for all currently visible English labels, buttons, descriptions, Notice messages, statuses, and errors. Keep interpolation placeholders for paths, counts, statuses, and error details.
- [ ] **Step 2: Replace lifecycle labels.** Use the copy map for the Ribbon label, command name, view title, settings headings, and settings descriptions. Keep `open-knowledge-base-assistant` and every settings property unchanged.
- [ ] **Step 3: Replace tab labels and copy.** Translate the four first-level tabs, R1 sub-tabs, overview index controls, rule migration/save controls, AI preview/confirmation controls, suggestion states, and daily/weekly review controls.
- [ ] **Step 4: Preserve technical values.** Keep `Current document` and `Current folder` as Chinese display labels while retaining the internal `file`/`folder` values; keep task values such as `classify` and `weeklyReview` unchanged.
- [ ] **Step 5: Run static validation.** Run `npm run build`, `npm test`, and `npm run lint`; expected result is build success, all existing tests passing, and zero lint errors.
- [ ] **Step 6: Commit.**

```bash
git add src/i18n src/main.ts src/settings.ts src/views
git commit -m "feat: localize knowledge assistant UI to Chinese"
```

### Task 2: Verify Chinese UI in Obsidian and update release documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README usage copy.** Add a short Chinese UI note while retaining technical commands, paths, configuration keys, and privacy behavior.
- [ ] **Step 2: Build release artifacts.** Run `npm run build`; confirm `main.js` is generated and remains ignored by Git.
- [ ] **Step 3: Install the fresh artifacts.** Copy `main.js`, `manifest.json`, and `styles.css` into the current Vault’s `.obsidian/plugins/sample-plugin/` directory, then reload the plugin list in Obsidian.
- [ ] **Step 4: Verify visible Chinese labels.** Open the Ribbon/command entry and confirm the panel title, four tabs, R1 sub-tabs, overview controls, AI preview controls, and daily backfill controls are Chinese.
- [ ] **Step 5: Verify behavior unchanged.** Confirm rules remain active, index check still reports the existing stale state, AI preview remains local until explicit confirmation, and daily backfill still lists today’s files.
- [ ] **Step 6: Run final checks.** Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`; record warnings separately from errors.
- [ ] **Step 7: Commit documentation.**

```bash
git add README.md
git commit -m "docs: document Chinese plugin interface"
```

## Verification Matrix

| Requirement | Verification |
|---|---|
| Default UI is Chinese | Obsidian manual check of panel/settings/command labels |
| Commands remain stable | Existing command ID and command registration unchanged |
| Settings remain compatible | Existing settings property names and stored data unchanged |
| Rules remain executable | Rule parser and 45 existing tests pass |
| AI safety remains unchanged | Upload confirmation and no-auto-send flow visible in AI tab |
| Index and daily workflows remain unchanged | Overview and Daily backfill manual smoke tests |
