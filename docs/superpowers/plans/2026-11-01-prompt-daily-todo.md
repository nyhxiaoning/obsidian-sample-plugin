# Prompt Daily Todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-side daily planning panel to the existing Obsidian plugin, backed by the `AI-Daily-Planner` Markdown workflow, while preserving the existing knowledge-base assistant.

**Architecture:** Keep the existing knowledge-base view and AI provider settings. Add a focused daily-planner domain service for path resolution, source loading, and no-overwrite saves; extend the AI transport contracts with a Markdown-generation request; and add a separate `DailyTodoView` that coordinates preview, confirmation, validation, and save.

**Tech Stack:** TypeScript strict mode, Obsidian `ItemView`/`Vault`, esbuild, Node test runner through `tsx`, ESLint with `eslint-plugin-obsidianmd`.

## Global Constraints

- Plugin ID is `prompt-daily-todo`; display name is `Prompt Daily Todo`.
- Existing knowledge-base functionality remains available and continues opening on the right.
- The daily planner opens through `workspace.getLeftLeaf(false)` and must not overwrite an existing daily file.
- All planner paths are Vault-relative and remain inside the configured planner root.
- AI requests remain manual and require explicit preview/upload confirmation.
- Do not commit `node_modules/`, `main.js`, or other generated artifacts.

---

### Task 1: Update plugin identity, settings, and user-facing copy

**Files:**
- Modify: `manifest.json`
- Modify: `src/settings-model.ts`
- Modify: `src/settings.ts`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `README.md`
- Test: `tests/settings/settings.test.ts`

**Interfaces:**
- Produces `dailyPlannerRoot: string` on `KnowledgeBaseSettings`.
- Produces `DEFAULT_SETTINGS.dailyPlannerRoot = '000ai知识库价值写作体系/AI-Daily-Planner'`.

- [ ] **Step 1: Add a failing settings test** asserting the planner default survives `normalizeSettings` and a persisted custom planner root is retained.
- [ ] **Step 2: Run `npm test -- tests/settings/settings.test.ts` and verify the new assertion fails because the field does not exist.**
- [ ] **Step 3: Add the setting, a settings-tab text control, planner labels, and update manifest/readme identity and installation paths to `prompt-daily-todo`.**
- [ ] **Step 4: Run the focused settings test and verify it passes.**
- [ ] **Step 5: Commit with `git add manifest.json src/settings-model.ts src/settings.ts src/i18n/zh-CN.ts README.md tests/settings/settings.test.ts && git commit -m "feat: rename plugin and add planner settings"`.**

### Task 2: Build the daily planner domain service and Markdown validator

**Files:**
- Create: `src/daily/daily-planner-service.ts`
- Create: `src/daily/daily-plan-validator.ts`
- Test: `tests/daily/daily-planner-service.test.ts`
- Test: `tests/daily/daily-plan-validator.test.ts`

**Interfaces:**
- `DailyPlannerService` exposes `loadSources(date): Promise<DailyPlannerSources>`, `getTargetPath(date): string`, `targetExists(date): Promise<boolean>`, and `saveNewPlan(date, content): Promise<string>`.
- `DailyPlannerSources` contains the five source files as `{ path: string; content: string }[]`, an `extraConstraints` value supplied by the caller, and source status data.
- `validateDailyPlan(content: string, date: Date): { valid: boolean; errors: string[] }` checks the date title, required headings, task count, six-hour budget, and six-unit cognitive capacity.

- [ ] **Step 1: Write tests for default source paths, `YYYY-MM-DD` target paths, missing source reporting, traversal rejection, and no-overwrite save behavior using an in-memory Vault-like fake.**
- [ ] **Step 2: Run the focused daily service tests and verify they fail because the service is absent.**
- [ ] **Step 3: Implement normalized Vault-relative path resolution, source loading, target existence checks, and `create`-only saving.**
- [ ] **Step 4: Write validator tests for valid output, wrong date, missing core headings, more than four numbered tasks, over-six-hour budget, and over-six cognitive capacity.**
- [ ] **Step 5: Run the validator tests and verify they fail before implementation.**
- [ ] **Step 6: Implement deterministic Markdown validation with actionable Chinese error messages.**
- [ ] **Step 7: Run both focused test files and verify they pass.**
- [ ] **Step 8: Commit with `git add src/daily tests/daily && git commit -m "feat: add daily planner sources and validation"`.**

### Task 3: Extend the AI layer for Markdown plan generation

**Files:**
- Modify: `src/ai/openai-compatible-client.ts`
- Modify: `src/ai/prompt-builder.ts`
- Modify: `src/ai/ai-client-router.ts`
- Modify: `src/ai/local-cli-client.ts`
- Modify: `src/ai/cli-provider-adapters.ts`
- Create: `src/ai/daily-plan-prompt.ts`
- Create: `src/ai/daily-plan-response.ts`
- Test: `tests/ai/daily-plan-ai.test.ts`
- Modify: `tests/ai/ai-client-router.test.ts`
- Modify: `tests/ai/openai-compatible-client.test.ts`

**Interfaces:**
- Add `DailyPlanRequest { date: string; sources: Array<{ path: string; content: string }>; extraConstraints: string }`.
- Add `AiClient.generateDailyPlan(request: DailyPlanRequest, signal?: AbortSignal): Promise<string>` while preserving `analyze` behavior.
- Add `buildDailyPlanPrompt(request): { system: string; user: string }`.
- Add `parseDailyPlanResponse(text): string` to remove optional code fences, reject empty output, and preserve Markdown.

- [ ] **Step 1: Add failing tests that assert the custom HTTP client sends a Markdown-generation prompt, the router dispatches to a tested local CLI, and API keys never appear in the returned error or prompt preview.**
- [ ] **Step 2: Run the focused AI tests and verify the new API is missing.**
- [ ] **Step 3: Add the daily-plan request type and Markdown prompt containing all sources, explicit constraints, no-file-write instructions, and the required template rules.**
- [ ] **Step 4: Implement Markdown response normalization and the OpenAI-compatible request path using the same timeout/error mapping as `analyze`.**
- [ ] **Step 5: Extend local CLI adapters to transport the planner prompt and return text without passing it through the suggestion-array parser.**
- [ ] **Step 6: Extend `AiClientRouter` and `LocalCliAiClient` to route `generateDailyPlan`, requiring a tested CLI exactly as existing analysis does.**
- [ ] **Step 7: Run all focused AI tests and the existing AI suite; verify they pass without changing existing suggestion parsing.**
- [ ] **Step 8: Commit with `git add src/ai tests/ai && git commit -m "feat: support AI daily plan generation"`.**

### Task 4: Add the left-side Daily Todo view and plugin wiring

**Files:**
- Create: `src/views/daily-todo-view.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`
- Modify: `src/i18n/zh-CN.ts`
- Test: `tests/views/daily-todo-view.test.ts` where pure helpers can be tested without a DOM.

**Interfaces:**
- `DailyTodoView` is an Obsidian `ItemView` with stable view type `prompt-daily-todo-view`.
- `KnowledgeBasePlugin.createViewServices()` supplies `dailyPlannerService` and the shared `aiClient`.
- `KnowledgeBasePlugin.activateDailyTodoView()` reuses an existing daily view or calls `getLeftLeaf(false)`.

- [ ] **Step 1: Add tests for date formatting, target-path display, and state transitions that reject generation without source confirmation or reject saving invalid/duplicate content.**
- [ ] **Step 2: Run the focused view tests and verify they fail before the view exists.**
- [ ] **Step 3: Implement the view with date input, extra-constraints textarea, source status/check button, upload confirmation toggle, generation button, editable Markdown preview, validation status, save button, and open-file button.**
- [ ] **Step 4: Register the view, ribbon icon, and command in `main.ts`; keep the existing knowledge-base activation path unchanged and add the planner service to view services.**
- [ ] **Step 5: Add compact responsive CSS using Obsidian variables, including source status, preview, error, and disabled-action styles.**
- [ ] **Step 6: Run the focused view tests and verify they pass.**
- [ ] **Step 7: Commit with `git add src/main.ts src/views/daily-todo-view.ts src/i18n/zh-CN.ts styles.css tests/views/daily-todo-view.test.ts && git commit -m "feat: add left daily todo panel"`.**

### Task 5: Documentation, full verification, and release metadata checks

**Files:**
- Modify: `README.md`
- Modify: `versions.json` if the manifest version is changed during implementation.

- [ ] **Step 1: Document the new command, left-panel behavior, planner root setting, five source files, preview confirmation, and no-overwrite behavior in README.**
- [ ] **Step 2: Run `npm test` and fix any regression in existing knowledge-base, AI, settings, or view tests.**
- [ ] **Step 3: Run `npm run lint` and fix all lint errors without suppressing Obsidian lifecycle rules.**
- [ ] **Step 4: Run `npm run build` and verify the production bundle completes successfully.**
- [ ] **Step 5: Run `git diff --check`, inspect `git status --short`, and verify no generated artifacts are staged.**
- [ ] **Step 6: Commit documentation and final corrections with `git add README.md versions.json src tests styles.css manifest.json && git commit -m "docs: document daily todo workflow"`.**
