# 本机 AI CLI 服务商诊断与接入修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Obsidian 插件可靠启动并诊断 Codex、Claude、Gemini、OpenCode 四个本机 CLI。

**Architecture:** 增加独立的 CLI 路径解析模块；由 runner 保留进程安全边界并产出可诊断结果；由客户端将错误映射为可读的服务商错误；设置模型负责显示实际路径和错误状态。

**Tech Stack:** TypeScript、Node `child_process`、Obsidian API、Node test runner、esbuild。

## Global Constraints

- 不启用 shell 执行 CLI，不拼接 shell 命令。
- 测试请求固定不包含 Vault 内容。
- API Key、token、secret 和原始敏感诊断必须脱敏。
- 不修改 Vault 内用户文档。
- 使用 npm、esbuild，构建产物只复制到当前测试 Vault，不提交到 Git。

---

### Task 1: 本机 CLI 路径解析

**Files:**
- Create: `src/ai/cli-path-resolver.ts`
- Modify: `src/settings-model.ts`
- Test: `tests/ai/cli-path-resolver.test.ts`

**Interfaces:**
- `resolveCliExecutable(command: string, env?: NodeJS.ProcessEnv): string`
- `resolveDefaultCliPaths(env?: NodeJS.ProcessEnv): Record<'codex'|'claude'|'gemini'|'opencode', string>`

- [ ] 添加测试覆盖 PATH 命中、已知 macOS 安装目录命中和未找到时返回原始命令。
- [ ] 在设置规范化时仅替换默认裸命令；保留用户已经填写的路径。
- [ ] 运行路径解析测试并确认先失败后通过。

### Task 2: CLI 错误诊断

**Files:**
- Modify: `src/ai/local-cli-runner.ts`
- Modify: `src/ai/local-cli-client.ts`
- Test: `tests/ai/local-cli-client.test.ts`

**Interfaces:**
- 现有 `LocalCliRunResult` 保持兼容。
- 错误消息包含阶段、退出码或脱敏 stderr，不暴露 secret。

- [ ] 添加 ENOENT、EACCES、非零退出、认证关键字、超时和无效输出测试。
- [ ] 扩展 runner 错误携带安全的原始诊断信息。
- [ ] 在客户端按错误种类映射中文可识别的错误码和消息。
- [ ] 运行客户端测试并确认错误分类正确。

### Task 3: 设置页与适配器验证

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/ai/cli-provider-adapters.ts`
- Test: `tests/ai/cli-provider-adapters.test.ts`

- [ ] 设置页显示实际执行路径和检测阶段状态。
- [ ] 四个 CLI 的测试按钮继续只发送固定空列表请求。
- [ ] 为四个适配器断言参数、传输方式和可解析输出。
- [ ] 运行 AI 相关测试。

### Task 4: 构建与 Obsidian 验证

**Files:**
- Modify: `README.md`

- [ ] 运行 `npm test`、`npm run build` 和 `npm run lint`。
- [ ] 将 `main.js`、`manifest.json`、`styles.css` 复制到当前 notebooks Vault 插件目录。
- [ ] 在 Obsidian 设置中重新加载第三方插件。
- [ ] 验证四个服务商显示实际路径和分级错误，不发送含 Vault 内容的测试请求。
