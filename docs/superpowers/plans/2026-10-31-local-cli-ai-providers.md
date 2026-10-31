# 本机 CLI AI 服务商实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留自定义 OpenAI 兼容服务商的同时，增加可检测、可测试、可切换的 Codex、Claude、Gemini、OpenCode 本机 CLI 服务商。

**Architecture:** 保持现有 `AiClient` 接口不变，新增受控的 CLI 进程运行器、四个命令适配器和按设置动态选择客户端的路由器。设置页负责保存服务商配置及测试状态；实际 AI 整理继续经过现有上传确认、建议解析、差异预览和人工确认链路。

**Tech Stack:** TypeScript strict mode, Obsidian desktop API, Node/Electron `child_process.spawn`, esbuild, Node test runner via `tsx`。

## Global Constraints

- 仅桌面端支持本机 CLI；不改变移动端声明。
- 不使用 `shell: true`，所有命令通过可执行文件和参数数组启动。
- 测试请求不读取 Vault、不修改文件，只验证 CLI 返回可解析的空建议数组。
- 实际文档内容只有在现有 UI 上传确认后才可发送给当前服务商。
- 保持 `AiClient`、`AiRequest`、`AiSuggestion`、规则键、命令 ID 和已有自定义 API 设置兼容。
- 默认可执行文件名为 `codex`、`claude`、`gemini`、`opencode`，同时允许填写自定义路径。
- CLI 输出、错误信息和测试状态不写入 Vault 内容或原始 AI 响应。
- 每个任务完成后运行对应测试并提交独立 commit。

---

### Task 1: 扩展 AI 服务商设置与中文文案

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/i18n/zh-CN.ts`
- Test: `tests/settings/settings.test.ts`

**Interfaces:**
- Produces `AiProviderKind = 'custom' | 'codex' | 'claude' | 'gemini' | 'opencode'`。
- Produces `LocalCliProviderSettings` with executable path and runtime test status。
- Extends `KnowledgeBaseSettings` with backward-compatible defaults: `aiProvider`, `localCliProviders`。

- [ ] **Step 1: Write failing settings tests.** Assert old data without new fields receives `custom` and four default executable names; assert provider status defaults to `unknown` and test metadata is not treated as a credential.
- [ ] **Step 2: Run the focused test and confirm failure.**

```bash
npm test -- tests/settings/settings.test.ts
```

Expected: FAIL because provider types and defaults do not exist.

- [ ] **Step 3: Add settings types and defaults.** Keep `apiBaseUrl`, `model`, `apiKey`, and `requestTimeoutMs` unchanged. Add per-provider executable path, status, version, tested timestamp, and sanitized error fields.
- [ ] **Step 4: Add Chinese copy.** Add labels and descriptions for the provider selector, four CLI cards, detection, test request, successful use, unavailable state, and failure state. Technical command names remain unchanged.
- [ ] **Step 5: Run the focused tests.**

```bash
npm test -- tests/settings/settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/settings.ts src/i18n/zh-CN.ts tests/settings/settings.test.ts
git commit -m "feat: add local CLI provider settings"
```

### Task 2: Implement bounded CLI process execution

**Files:**
- Create: `src/ai/local-cli-runner.ts`
- Test: `tests/ai/local-cli-runner.test.ts`

**Interfaces:**
- Produces `LocalCliRunner.run(options: { executable: string; args: string[]; cwd: string; stdin?: string; timeoutMs: number; maxOutputBytes: number; signal?: AbortSignal }): Promise<{ stdout: string; stderr: string; exitCode: number }>`。
- Produces typed errors for configuration, command-not-found, non-zero exit, timeout, cancellation, and output-limit failures.
- Accepts an injected `spawn` factory so tests never start a real CLI.

- [ ] **Step 1: Write failing runner tests.** Cover argument-array forwarding, stdin delivery, successful output, command-not-found mapping, non-zero exit, timeout termination, caller cancellation, and bounded output.
- [ ] **Step 2: Run the focused tests and confirm failure.**

```bash
npm test -- tests/ai/local-cli-runner.test.ts
```

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement `spawn` runner.** Use `shell: false`, `windowsHide: true`, `cwd`, bounded stdout/stderr buffers, `window.setTimeout`-compatible cleanup, and `kill()` on timeout or abort. Never include full stdin or output in error messages.
- [ ] **Step 4: Run the focused tests.**

```bash
npm test -- tests/ai/local-cli-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ai/local-cli-runner.ts tests/ai/local-cli-runner.test.ts
git commit -m "feat: add safe local CLI runner"
```

### Task 3: Add provider adapters and normalized response parsing

**Files:**
- Create: `src/ai/cli-provider-adapters.ts`
- Modify: `src/ai/response-parser.ts`
- Test: `tests/ai/cli-provider-adapters.test.ts`

**Interfaces:**
- Produces `CliProviderAdapter` with `versionArgs`, `requestArgs(test: boolean)`, `buildPrompt(request)`, `parseOutput(stdout, stderr)`, and `parseVersion(stdout, stderr)`.
- Produces adapters for `codex`, `claude`, `gemini`, and `opencode`.
- Reuses `parseAiSuggestions` with the active rules scope as the final safety parser.

- [ ] **Step 1: Write failing adapter tests.** Assert exact non-interactive arguments: Codex `exec` with JSON mode, Claude `-p` with JSON output, Gemini `--prompt` with JSON output, and OpenCode `run`; assert each adapter extracts a final text response from representative JSON, JSONL, and plain-text output.
- [ ] **Step 2: Run focused tests and confirm failure.**

```bash
npm test -- tests/ai/cli-provider-adapters.test.ts
```

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters.** Keep prompts fixed for tests, request JSON-only `[]` for the test call, and use the existing full prompt builder for real analysis. Reject malformed or missing assistant output with `AiClientError('invalid_response', ...)`.
- [ ] **Step 4: Add safe output extraction.** Support JSON envelopes and JSONL final-message events without logging or persisting the complete raw output. Keep the extracted assistant text limited by the runner’s output bound.
- [ ] **Step 5: Run focused tests.**

```bash
npm test -- tests/ai/cli-provider-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/ai/cli-provider-adapters.ts src/ai/response-parser.ts tests/ai/cli-provider-adapters.test.ts
git commit -m "feat: add local CLI provider adapters"
```

### Task 4: Implement CLI clients, testing, and provider routing

**Files:**
- Create: `src/ai/local-cli-client.ts`
- Create: `src/ai/ai-client-router.ts`
- Test: `tests/ai/local-cli-client.test.ts`
- Test: `tests/ai/ai-client-router.test.ts`

**Interfaces:**
- Produces `LocalCliAiClient.detect(signal?): Promise<{ version: string }>`。
- Produces `LocalCliAiClient.testConnection(signal?): Promise<void>` using a fixed no-Vault-content prompt and requiring `parseAiSuggestions` to return an array.
- Produces `LocalCliAiClient.analyze(request, signal?): Promise<AiSuggestion[]>`.
- Produces `AiClientRouter.analyze(request, signal?): Promise<AiSuggestion[]>` and `getProviderStatus(kind)`.

- [ ] **Step 1: Write failing client tests.** Cover successful detection, successful test request, invalid test response, command failures, and forwarding of a real request only through the selected adapter.
- [ ] **Step 2: Write failing router tests.** Assert custom API and each CLI provider are selected from settings; assert an untested or failed CLI provider throws configuration error and does not spawn a process for analysis.
- [ ] **Step 3: Run focused tests and confirm failure.**

```bash
npm test -- tests/ai/local-cli-client.test.ts tests/ai/ai-client-router.test.ts
```

Expected: FAIL because clients and router do not exist.

- [ ] **Step 4: Implement local CLI client.** Compose adapter + runner, use Vault root as cwd, enforce request timeout and max output, and map runner failures to sanitized `AiClientError` values.
- [ ] **Step 5: Implement router.** Create the configured client lazily from current settings, keep the existing OpenAI-compatible client for `custom`, and reject non-tested CLI providers before content is sent.
- [ ] **Step 6: Run focused tests.**

```bash
npm test -- tests/ai/local-cli-client.test.ts tests/ai/ai-client-router.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/ai/local-cli-client.ts src/ai/ai-client-router.ts tests/ai/local-cli-client.test.ts tests/ai/ai-client-router.test.ts
git commit -m "feat: route AI requests through tested local CLIs"
```

### Task 5: Integrate settings UI and dynamic client into the plugin

**Files:**
- Modify: `src/main.ts`
- Modify: `src/settings.ts`
- Modify: `src/views/knowledge-base-view.ts`
- Modify: `src/views/tabs/ai-organize-tab.ts`
- Modify: `src/views/tabs/daily-backfill-tab.ts`
- Modify: `styles.css`

**Interfaces:**
- Settings UI calls `plugin.detectLocalProvider(kind)`, `plugin.testLocalProvider(kind)`, and `plugin.selectAiProvider(kind)`.
- View services receive the `AiClientRouter` through the existing `AiClient` interface.

- [ ] **Step 1: Add plugin provider operations.** Wire runner/adapters using the Vault base path and current timeout. Save only status metadata after detect/test; clear status when executable path changes.
- [ ] **Step 2: Replace the static OpenAI client.** Create one router in `createViewServices()` so AI tabs resolve the selected provider dynamically without reopening the view.
- [ ] **Step 3: Add the Chinese provider selector.** Keep the custom API fields visible for `custom`; show each CLI executable path and status card for local providers.
- [ ] **Step 4: Add action buttons.** Disable “发送测试请求” until detection succeeds; disable “使用此服务商” until the test succeeds; refresh the settings after each action; display version and sanitized failure text.
- [ ] **Step 5: Preserve upload confirmation.** Ensure the existing AI tab still builds and previews the request before calling the router; no CLI call may occur before confirmation.
- [ ] **Step 6: Run all tests and build.**

```bash
npm test
npm run build
npm run lint
```

Expected: all tests pass, build succeeds, lint has zero errors.

- [ ] **Step 7: Commit.**

```bash
git add src/main.ts src/settings.ts src/views/knowledge-base-view.ts src/views/tabs/ai-organize-tab.ts src/views/tabs/daily-backfill-tab.ts styles.css
git commit -m "feat: add local CLI provider controls"
```

### Task 6: Document and verify in Obsidian

**Files:**
- Modify: `README.md`
- Modify: `manifest.json` only if the desktop-only requirement needs correction after review

- [ ] **Step 1: Document prerequisites.** Add Chinese instructions for installing/logging into each CLI, setting the executable path, running detection, running the minimal test, selecting the provider, and the fact that real Vault content is sent only after upload confirmation.
- [ ] **Step 2: Build release artifacts and copy them to the current Vault.**

```bash
npm run build
cp main.js manifest.json styles.css /Users/henryheng/Code/personCode/notebooks/.obsidian/plugins/sample-plugin/
```

- [ ] **Step 3: Reload the plugin in Obsidian.** Confirm the settings page shows the custom provider plus four CLI providers in Chinese.
- [ ] **Step 4: Test each installed CLI independently.** For each provider, verify detect status, run the minimal request test, inspect success/failure text, and select only a provider that passes. Do not run a real Vault-content analysis during smoke testing.
- [ ] **Step 5: Verify unchanged safety flow.** Confirm AI organize and daily backfill still require upload confirmation and suggestions still require separate acceptance before file operations.
- [ ] **Step 6: Run final checks.**

```bash
npm test
npm run build
npm run lint
git diff --check
```

- [ ] **Step 7: Commit documentation.**

```bash
git add README.md
git commit -m "docs: document local CLI AI providers"
```

## Verification Matrix

| Requirement | Verification |
|---|---|
| Existing custom provider remains available | Settings compatibility test and custom router test |
| Four local CLIs can be detected independently | Adapter/runner tests and Obsidian smoke test |
| Test request proves parseable AI response | Client test with fixed `[]` prompt and output parser |
| Untested provider cannot receive Vault content | Router test and UI disabled-state check |
| No shell injection path | Runner test asserts `shell: false` and argument-array invocation |
| Current safety behavior unchanged | Existing 45 tests plus AI tab manual confirmation check |
