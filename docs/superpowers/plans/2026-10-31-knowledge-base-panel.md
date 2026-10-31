# Knowledge Base Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`` syntax for tracking.

**Goal:** Build a desktop-only Obsidian knowledge-base assistant with four tabs for index maintenance, rule editing, AI-assisted organization, and daily knowledge backfill.

**Architecture:** Keep `main.ts` focused on lifecycle registration. Treat `000ai知识库价值写作体系/系统/知识库规则.md` as the single source of truth: a marked YAML block drives deterministic checks and safe file operations, while the Markdown body provides human-readable and AI guidance. Local checks and AI suggestions both produce a `ChangePlan`; only a user-confirmed plan can mutate the Vault.

**Tech Stack:** TypeScript strict mode, Obsidian API, esbuild, Node `child_process` on desktop, native `fetch`, the `yaml` package, and Node’s test runner through `tsx`.

## Global Constraints

- Use npm and the existing esbuild build configuration.
- Set `manifest.json.isDesktopOnly` to `true`; Python index execution is desktop-only.
- Never send content to the AI provider without explicit user action and an upload preview.
- Never let an AI response directly write, move, delete, or execute files.
- Restrict every Vault path to the active Vault.
- Do not implement delete, batch rename, background upload, automatic organization, or automatic application of AI suggestions.
- Use Obsidian `register*` helpers for listeners, intervals, and resource cleanup.
- Do not commit `main.js`, `node_modules/`, or `.superpowers/`.
- Preserve unrelated user changes in the separate `notebooks` repository.

---

## File Map

Create focused modules:

~~~text
src/
  main.ts
  settings.ts
  types.ts
  views/knowledge-base-view.ts
  views/tabs/overview-tab.ts
  views/tabs/rules-tab.ts
  views/tabs/ai-organize-tab.ts
  views/tabs/daily-backfill-tab.ts
  rules/rule-document.ts
  rules/rule-schema.ts
  rules/rule-validator.ts
  rules/rule-store.ts
  checks/local-check-engine.ts
  checks/checkers/path-checker.ts
  checks/checkers/frontmatter-checker.ts
  checks/checkers/source-checker.ts
  checks/checkers/link-checker.ts
  ai/openai-compatible-client.ts
  ai/prompt-builder.ts
  ai/response-parser.ts
  changes/change-plan.ts
  changes/diff-preview.ts
  changes/change-applier.ts
  index/index-runner.ts
  daily/daily-backfill-service.ts
tests/
  rules/rule-document.test.ts
  rules/rule-validator.test.ts
  rules/rule-store.test.ts
  checks/local-check-engine.test.ts
  ai/response-parser.test.ts
  changes/change-applier.test.ts
  index/index-runner.test.ts
  daily/daily-backfill-service.test.ts
~~~

---

### Task 1: Establish desktop configuration and test harness

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `src/settings.ts`
- Modify: `src/main.ts`
- Create: `src/types.ts`
- Create: `tests/fixtures/rules-valid.md`
- Create: `tests/fixtures/rules-invalid.md`

**Interfaces:**
- `MyPluginSettings` contains `knowledgeBaseRoot`, `rulesPath`, `indexScriptPath`, `pythonPath`, `apiBaseUrl`, `model`, `apiKey`, and `requestTimeoutMs`.
- `DEFAULT_SETTINGS` uses Vault-relative paths, an empty API URL/model/key, `/usr/bin/python3`, and a 60000 ms timeout.
- Later tasks import these settings and shared types.

- [ ] **Step 1: Replace the sample setting model.** Remove `mySetting` and define the fields above. Keep `loadSettings` and `saveSettings` as the only persistence entry points.
- [ ] **Step 2: Replace the sample settings tab.** Add path, Python, API URL, model, password, and timeout controls. Explain that the key is local and content is sent only after confirmation.
- [ ] **Step 3: Update plugin metadata.** Keep the stable id, change name/description to the knowledge-base assistant, and set `isDesktopOnly` to `true`.
- [ ] **Step 4: Add test tooling.** Add runtime dependency `yaml`, dev dependency `tsx`, and script `"test": "tsx --test \"tests/**/*.test.ts\""`.
- [ ] **Step 5: Run baseline checks.** Run `npm install`, `npm test`, `npm run build`, and `npm run lint`; expected result is successful build/lint and a test runner with no feature failures.
- [ ] **Step 6: Commit.**
~~~bash
git add manifest.json package.json package-lock.json src/settings.ts src/types.ts src/main.ts tests/fixtures
git commit -m "feat: configure knowledge base plugin foundation"
~~~

### Task 2: Implement rule parsing, validation, and fallback storage

**Files:**
- Create: `src/rules/rule-schema.ts`
- Create: `src/rules/rule-document.ts`
- Create: `src/rules/rule-validator.ts`
- Create: `src/rules/rule-store.ts`
- Create: `tests/rules/rule-document.test.ts`
- Create: `tests/rules/rule-validator.test.ts`
- Create: `tests/rules/rule-store.test.ts`

**Interfaces:**
~~~ts
export interface KnowledgeRules {
  schemaVersion: 1;
  scope: { root: string; include: string[]; exclude: string[] };
  frontmatter: { enabled: boolean; required: string[]; allowedStatus: string[] };
  checks: { fileName: boolean; directory: boolean; source: boolean; duplicateTopic: boolean; relatedLinks: boolean };
  actions: { patchFrontmatter: "confirm" | "denied"; applyTemplate: "confirm" | "denied"; moveFile: "confirm" | "denied"; regenerateIndex: "allowed" | "denied"; deleteFile: "denied" };
  ai: { tasks: string[]; manualOnly: true };
  dailyBackfill: { enabled: boolean; dailyReview: "manual"; weeklyReview: "manual" };
}
export function extractRuleBlock(markdown: string): { yaml: string; start: number; end: number } | null;
export function replaceRuleBlock(markdown: string, rules: KnowledgeRules): string;
export function validateRules(value: unknown): { valid: true; rules: KnowledgeRules } | { valid: false; errors: RuleValidationError[] };
~~~

- [ ] **Step 1: Write failing document tests.** Cover exact begin/end markers, missing and duplicate blocks, preservation of prose before/after the block, and replacement without changing the body.
- [ ] **Step 2: Implement block extraction/replacement.** Use only the fixed `KNOWLEDGE-RULES-BEGIN` and `KNOWLEDGE-RULES-END` markers. Reject a missing end marker or duplicate blocks.
- [ ] **Step 3: Write failing validation tests.** Cover unsupported schema versions, missing fields, non-relative roots, invalid statuses, unsafe actions, and non-manual AI settings.
- [ ] **Step 4: Implement YAML parsing and validation.** Return field paths such as `actions.moveFile` and human-readable messages suitable for the R1 editor.
- [ ] **Step 5: Write fallback tests.** Verify valid activation, invalid-new-config fallback, document hash storage, and the no-effective-config state.
- [ ] **Step 6: Implement `RuleStore`.** Persist the last valid rules, hash, schema version, and activation timestamp through plugin data callbacks. Expose `loadEffectiveRules(``, `validateDocument(markdown``, and `activateValidRules(rules, documentHash``.
- [ ] **Step 7: Run and commit.**
~~~bash
npm test -- tests/rules
git add src/rules tests/rules
git commit -m "feat: add executable knowledge rule document"
~~~

### Task 3: Build deterministic checks and change-plan types

**Files:**
- Create: `src/changes/change-plan.ts`
- Create: `src/checks/local-check-engine.ts`
- Create: `src/checks/checkers/path-checker.ts`
- Create: `src/checks/checkers/frontmatter-checker.ts`
- Create: `src/checks/checkers/source-checker.ts`
- Create: `src/checks/checkers/link-checker.ts`
- Create: `tests/checks/local-check-engine.test.ts`

**Interfaces:**
~~~ts
export type CheckSeverity = "info" | "warning" | "error";
export interface ChangePlan {
  kind: "patch" | "move" | "index" | "report";
  target: string;
  reason: string;
  risk: "low" | "medium" | "high";
  diff?: string;
  requiresConfirmation: boolean;
}
export interface CheckResult {
  id: string; severity: CheckSeverity; message: string; filePath: string; change?: ChangePlan;
}
export interface CheckContext {
  vault: VaultLike; rootPath: string; rules: KnowledgeRules; filePaths: string[];
}
~~~

- [ ] **Step 1: Write failing checker tests.** Cover incorrect directory, missing `title/status/created/updated`, unsupported status, missing source metadata, malformed WikiLinks, and a clean card. Assert exact severity and change kind.
- [ ] **Step 2: Implement individual checkers.** Honor each enabled flag, never mutate files, and keep all proposed paths below the configured root.
- [ ] **Step 3: Implement orchestration.** Run enabled checkers for each selected file, order results by file path then checker id, and preserve results when another file has errors.
- [ ] **Step 4: Add local duplicate/link candidates.** Use filenames, headings, and existing WikiLinks for informational suggestions only; do not label heuristic matches as definitive.
- [ ] **Step 5: Run and commit.**
~~~bash
npm test -- tests/checks
npm run build
git add src/checks src/changes/change-plan.ts tests/checks
git commit -m "feat: add deterministic knowledge checks"
~~~

### Task 4: Add previews, conflict detection, and confirmed Vault mutation

**Files:**
- Create: `src/changes/diff-preview.ts`
- Create: `src/changes/change-applier.ts`
- Create: `tests/changes/change-applier.test.ts`

**Interfaces:**
~~~ts
export interface ChangePreview {
  plan: ChangePlan;
  before?: string;
  after?: string;
  sourcePath?: string;
  targetPath?: string;
}
export interface ApplyResult {
  target: string;
  status: "applied" | "skipped" | "failed";
  message: string;
}
~~~

- [ ] **Step 1: Write failing safety tests.** Test patch before/after output, move source/target output, denied actions, existing target conflict, and stale content hash.
- [ ] **Step 2: Implement preview generation.** Produce compact Markdown diffs and move summaries. Include rule version and reason. Reject paths outside the Vault.
- [ ] **Step 3: Implement confirmed application.** Re-read each target, compare the preview hash, and use `Vault.modify` or `Vault.rename`. Never use Node filesystem APIs for Vault content.
- [ ] **Step 4: Implement partial failures.** Return one result per plan, preserve successful changes, and leave failed plans retryable; do not auto-rollback.
- [ ] **Step 5: Run and commit.**
~~~bash
npm test -- tests/changes
git add src/changes tests/changes
git commit -m "feat: add confirmed change application"
~~~

### Task 5: Implement the Python index runner

**Files:**
- Create: `src/index/index-runner.ts`
- Create: `tests/index/index-runner.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
~~~ts
export type IndexMode = "check" | "generate";
export interface IndexResult {
  mode: IndexMode;
  status: "consistent" | "stale" | "generated" | "failed";
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export interface IndexRunner { run(mode: IndexMode): Promise<IndexResult>; }
~~~

- [ ] **Step 1: Write process-wrapper tests.** Inject a spawn-like function and test `--check`, Vault-root `cwd`, stdout mapping for `一致` and `索引已过期`, nonzero exit, timeout, and missing executable.
- [ ] **Step 2: Implement desktop execution.** Use `child_process.spawn` with configured Python and script paths, `cwd` equal to Vault root, and `--check` only for check mode.
- [ ] **Step 3: Enforce path/platform guards.** Reject scripts outside the Vault, kill on timeout, return an unsupported-platform result where desktop APIs are unavailable, and never interpolate content into a shell command.
- [ ] **Step 4: Run and commit.**
~~~bash
npm test -- tests/index
git add src/index src/types.ts tests/index
git commit -m "feat: run knowledge index script safely"
~~~

### Task 6: Implement the constrained OpenAI-compatible AI layer

**Files:**
- Create: `src/ai/openai-compatible-client.ts`
- Create: `src/ai/prompt-builder.ts`
- Create: `src/ai/response-parser.ts`
- Create: `tests/ai/response-parser.test.ts`

**Interfaces:**
~~~ts
export interface AiRequest {
  task: "classify" | "summarize" | "suggestRelations" | "suggestChanges" | "dailyBackfill" | "weeklyReview";
  rules: KnowledgeRules;
  ruleGuidance: string;
  files: Array<{ path: string; content: string }>;
}
export interface AiSuggestion {
  kind: "classification" | "summary" | "relation" | "change" | "review";
  title: string;
  detail: string;
  proposedPath?: string;
  relatedFiles?: string[];
}
export interface AiClient {
  analyze(request: AiRequest, signal?: AbortSignal): Promise<AiSuggestion[]>;
}
~~~

- [ ] **Step 1: Write parser tests.** Cover valid JSON, fenced JSON, missing fields, unknown kinds, outside-root proposed paths, and malformed JSON. Reject invalid file operations rather than repairing them.
- [ ] **Step 2: Implement prompt construction.** Include effective structured rules, only relevant rule-document guidance, selected files, task, and JSON-only output instructions. State that the model cannot execute operations.
- [ ] **Step 3: Implement response parsing.** Validate all fields, reject outside-root paths, and map accepted changes to `ChangePlan` with `requiresConfirmation: true`.
- [ ] **Step 4: Implement the HTTP client.** POST to the configured OpenAI-compatible chat endpoint with model, timeout AbortController, and authorization header. Do not log the key. Map 401, 429, 5xx, timeout, and invalid-response errors.
- [ ] **Step 5: Run and commit.**
~~~bash
npm test -- tests/ai
npm run lint
git add src/ai tests/ai
git commit -m "feat: add constrained AI organization client"
~~~

### Task 7: Build the ItemView shell and four tabs

**Files:**
- Create: `src/views/knowledge-base-view.ts`
- Create: `src/views/tabs/overview-tab.ts`
- Create: `src/views/tabs/rules-tab.ts`
- Create: `src/views/tabs/ai-organize-tab.ts`
- Create: `src/views/tabs/daily-backfill-tab.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Interfaces:**
~~~ts
export type KnowledgeBaseTab = "overview" | "rules" | "ai-organize" | "daily-backfill";
export interface TabContext {
  app: App; plugin: MyPlugin; rootPath: string; effectiveRules: KnowledgeRules | null;
}
~~~

- [ ] **Step 1: Define the manual smoke checklist.** Verify view opening from Ribbon and Command Palette, four tab switches, active-file refresh, and unload cleanup. Obsidian DOM behavior is validated manually rather than in the Node runner.
- [ ] **Step 2: Implement the ItemView shell.** Use a stable view type/display name, keep active tab in memory, expose `activateTab(tab)`, and use `registerEvent` for workspace file-open changes.
- [ ] **Step 3: Implement overview.** Wire index check/generate, open README/folder, rule status, provider status, and bounded command output.
- [ ] **Step 4: Implement R1 rules editor.** Provide settings/body/source sub-tabs, field-level errors, save/validate, last-effective version, and restore-effective controls.
- [ ] **Step 5: Implement AI organize.** Provide current-document/current-folder scope, task selection, file list, upload preview, analyze action, result list, and change-preview entry point. Disable analyze without valid rules or provider settings.
- [ ] **Step 6: Implement daily backfill UI shell.** Provide today’s modified-file list, exclusions, daily organization, weekly review, and status using injected `DailyBackfillActions` callbacks. Keep file/date collection in the service added by Task 8.
- [ ] **Step 7: Add styles and lifecycle registration.** Use Obsidian CSS variables and narrow-sidebar-friendly layout. Remove sample modal, click listener, interval, and sample commands. Register view, Ribbon icon, command, and settings tab.
- [ ] **Step 8: Run and commit.**
~~~bash
npm run build
npm run lint
git add src/main.ts src/views styles.css
git commit -m "feat: add knowledge base assistant view"
~~~

### Task 8: Implement daily backfill and weekly review services

**Files:**
- Create: `src/daily/daily-backfill-service.ts`
- Create: `tests/daily/daily-backfill-service.test.ts`
- Modify: `src/types.ts`
- Modify: `src/views/tabs/daily-backfill-tab.ts`

**Interfaces:**
~~~ts
export interface DailyFile {
  path: string; modifiedAt: number; size: number; included: boolean;
}
export interface DailyBackfillService {
  listTodayChanges(now: Date, rootPath: string): Promise<DailyFile[]>;
  buildDailyRequest(files: DailyFile[], task: AiRequest["task"]): Promise<AiRequest>;
  buildWeeklyReviewRequest(weekStart: Date, weekEnd: Date): Promise<AiRequest>;
}
~~~

- [ ] **Step 1: Write date-boundary tests.** Cover local-day boundaries, midnight transitions, excluded system files, non-Markdown files, and the knowledge-base root boundary.
- [ ] **Step 2: Implement today-change collection.** Use Vault metadata, filter Markdown under the configured root, sort by path, and expose an explicit inclusion flag for user exclusions. Do not upload or mutate files here.
- [ ] **Step 3: Implement daily and weekly request builders.** Daily requests include selected today files. Weekly requests cover associations, conflicts, omissions, stale knowledge, and skill candidates within the selected week.
- [ ] **Step 4: Inject the service into the daily backfill tab.** Connect the tab’s `DailyBackfillActions` callbacks to the service, AI client, preview, and confirmation workflow without adding a second mutation path.
- [ ] **Step 5: Run and commit.**
~~~bash
npm test -- tests/daily
git add src/daily tests/daily src/types.ts
git add src/views/tabs/daily-backfill-tab.ts
git commit -m "feat: add daily knowledge backfill service"
~~~

### Task 9: Wire confirmation workflow, operation history, and documentation

**Files:**
- Modify: `src/views/tabs/ai-organize-tab.ts`
- Modify: `src/views/tabs/daily-backfill-tab.ts`
- Modify: `src/views/tabs/overview-tab.ts`
- Modify: `src/rules/rule-store.ts`
- Modify: `src/main.ts`
- Modify: `README.md`

**Interfaces:**
~~~ts
export interface OperationRecord {
  id: string; startedAt: number; finishedAt?: number; kind: string; scope: string;
  ruleVersion: number; status: "running" | "succeeded" | "failed" | "cancelled"; message: string;
}
~~~

- [ ] **Step 1: Persist operation metadata only.** Store timestamps, operation type, scope, rule version, result status, and user-facing message. Never store raw Vault content or raw AI responses.
- [ ] **Step 2: Wire upload confirmation.** Require an explicit confirmation click before `AiClient.analyze`; cancellation must make no network request.
- [ ] **Step 3: Wire plan confirmation.** Render accept/ignore/reject per patch or move; accepted items pass through `ChangeApplier`.
- [ ] **Step 4: Add stale-file handling.** Compare content hashes captured at preview time and replace stale candidates with conflicts.
- [ ] **Step 5: Update README.** Document desktop-only Python behavior, paths, OpenAI-compatible setup, upload preview, local settings, and no background AI.
- [ ] **Step 6: Run full checks and commit.**
~~~bash
npm test
npm run build
npm run lint
git add src README.md
git commit -m "feat: complete confirmed knowledge workflows"
~~~

### Task 10: Perform end-to-end validation and release preparation

**Files:**
- Modify: `manifest.json` only if release version/minimum app version changes.
- Modify: `versions.json` only when the manifest version changes.
- Generate locally: `main.js`; do not commit it.

- [ ] **Step 1: Build production output.** Run `npm run build`; confirm `main.js` is generated and ignored.
- [ ] **Step 2: Install in a disposable Obsidian plugin directory.** Copy `main.js`, `manifest.json`, and `styles.css`, reload Obsidian, and enable the plugin.
- [ ] **Step 3: Validate four tabs and rules fallback.** Open all tabs, edit a valid field, introduce invalid configuration, verify last-valid fallback, and restore it.
- [ ] **Step 4: Validate index operations.** Test consistent/stale README output, generation, Vault-root working directory, and no plugin-repository execution.
- [ ] **Step 5: Validate AI privacy/failure paths.** Use a mock compatible endpoint to test preview cancellation, valid suggestions, malformed responses, timeout, 401, 429, 5xx, and absence of keys/content in logs.
- [ ] **Step 6: Validate daily backfill.** Create/modify fixtures, exclude one file, run daily and weekly flows, and confirm nothing writes until accepted.
- [ ] **Step 7: Review repository state.**
~~~bash
git status --short
git diff --check
~~~
Confirm only intended source, tests, docs, manifest/version, and lockfile changes are tracked.

## Verification Matrix

| Requirement | Implemented by | Verification |
|---|---|---|
| Four-tab panel | Task 7 | ItemView smoke checklist and manual validation |
| Rule document editing | Tasks 2 and 7 | Parser/store tests and R1 flow |
| Invalid-rule fallback | Task 2 | `rule-store.test.ts` |
| Local safety checks | Task 3 | Checker tests and folder-scope test |
| User-confirmed file operations | Tasks 4 and 9 | Change-applier and diff-preview tests |
| Python index check/generation | Task 5 | Process-wrapper and Vault install tests |
| OpenAI-compatible API | Tasks 6 and 9 | Parser tests and mocked endpoint |
| Current document/folder scope | Tasks 7 and 9 | AI tab validation |
| Daily backfill | Task 8 | Date-boundary and daily workflow tests |
| Weekly knowledge iteration | Task 8 | Weekly request-builder test |
| Desktop/mobile boundary | Tasks 1 and 5 | Manifest and unsupported-platform checks |
| Privacy/no hidden telemetry | Tasks 6 and 9 | README, request preview, and log inspection |

