# 本机 AI CLI 服务商诊断与接入修复设计

## 背景

Obsidian 通过图形界面启动时可能没有终端继承的 `PATH`，导致 `codex`、`claude`、`gemini`、`opencode` 这些裸命令无法启动。当前插件还把启动错误、非零退出、认证失败和输出解析失败统一显示为 `AI CLI process failed`，用户无法判断下一步操作。

## 目标

1. 首次加载时为四个服务商解析本机可执行文件的绝对路径，并在设置页显示实际路径。
2. 继续支持用户手工填写命令名或自定义绝对路径。
3. 保留每个 CLI 的专用参数和输出解析逻辑。
4. 将错误细分为找不到命令、认证/API Key、非零退出、超时、取消和输出解析失败。
5. 不把提示词中的 Vault 内容发送到测试请求；测试请求仍固定返回空建议列表。

## 设计

- 新增本机 CLI 路径解析模块，按 Obsidian GUI 常见路径、当前 `PATH` 和各工具已知安装目录查找可执行文件。
- `normalizeSettings` 在没有用户自定义路径时使用解析结果；已有用户路径保持不变。
- `LocalCliRunner` 保留不启用 shell 的安全约束，同时将 `ENOENT`、`EACCES` 和子进程 error message 传递给上层的脱敏错误映射。
- `LocalCliAiClient` 在检测和测试请求中保留工具名、阶段、退出码和截断后的 stderr；设置页显示脱敏诊断信息。
- 适配器只负责参数与输出协议：Codex stdin JSON、Claude prompt JSON、Gemini prompt JSON、OpenCode run。认证提示不伪装成解析错误。

## 验收标准

- 新安装或未修改路径的设置页显示四个可执行文件的实际绝对路径（若未找到则显示原始命令名和明确的未找到状态）。
- 对启动失败、认证失败、非零退出、无效输出分别显示不同中文错误。
- 单元测试覆盖路径解析、错误分类、四种适配器参数和测试请求不含 Vault 内容。
- `npm test`、`npm run build`、`npm run lint` 通过，并在当前 notebooks Vault 中重新加载插件验证设置页。
