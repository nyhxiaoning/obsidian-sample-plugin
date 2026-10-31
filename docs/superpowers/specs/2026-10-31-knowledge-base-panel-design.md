# 知识库功能面板设计

## 1. 背景与目标

当前仓库是 Obsidian 官方示例插件，入口位于 `src/main.ts`，尚未包含知识库管理能力。目标是在此基础上增加一个桌面端知识库助手面板，用于管理 `notebooks` Vault 中的 `000ai知识库价值写作体系`。

面板提供四个一级页签：

1. **概览**：查看当前文档、当前知识库目录、索引状态和系统配置状态。
2. **规则**：直接编辑 `系统/知识库规则.md`，同时维护可执行的结构化规则配置。
3. **AI 整理**：处理当前打开的文档或当前文件夹，提供分类、摘要、关联和修改建议。
4. **每日回填**：把“白天记录、工作结束整理、每周知识迭代”组织成可手动执行的工作流。

核心原则是“本地确定性规则负责安全执行，AI 负责语义建议，用户确认后才写入”。插件不后台自动上传内容，不允许 AI 直接执行文件操作。

## 2. 已确认的范围

### 2.1 处理范围

- 默认处理当前打开的 Markdown 文档。
- 可切换到当前文件夹；文件夹模式先扫描并显示文件清单。
- 每日回填按 Vault 文件修改时间汇总当天变更，默认限制在 `000ai知识库价值写作体系/` 内。
- AI 只由用户在面板中手动触发，不因打开或保存文档自动上传。

### 2.2 确定性操作

首版支持：

- 检查文件位置、命名、Frontmatter、状态、来源和双链。
- 生成补充 Frontmatter、套用模板、移动文件和重新生成索引的变更建议。
- 用户确认后执行 Frontmatter 修改、模板应用和文件移动。
- 执行索引检查或重新生成。

首版不支持：

- 删除文件。
- AI 直接写入或移动文件。
- 后台定时上传、自动整理或自动应用建议。
- 未经确认的批量移动、批量重命名或覆盖原文。

### 2.3 AI 能力

首版使用 OpenAI 兼容 API。设置页提供 API 地址、模型、密钥和请求超时配置。密钥只保存在插件本地配置中，不写入知识库文档。

AI 负责：

- 分类和建议保存位置。
- 内容摘要。
- 关联知识建议。
- 重复主题、遗漏和潜在冲突建议。
- 知识卡片和每日/每周复盘草稿建议。

AI 不负责：

- 直接决定是否移动或覆盖文件。
- 绕过结构化规则的动作权限。
- 在用户确认前写入 Vault。

## 3. 面板与交互设计

### 3.1 面板位置

实现为 Obsidian `ItemView`，注册视图类型和 Ribbon 图标，并提供命令打开面板。推荐默认打开在右侧工作区；在宽屏下也支持拖动到主工作区。

### 3.2 概览页

显示：

- 当前 Vault 和 `000ai知识库价值写作体系` 路径。
- 当前打开文档和当前文件夹。
- 索引状态、上次检查时间和脚本输出。
- **检查索引**、**重新生成**、**打开 README**、**打开知识库文件夹**按钮。
- 规则配置有效性、AI 提供商配置状态和最近操作摘要。

索引调用固定为：

```text
python3 000ai知识库价值写作体系/系统/generate-index.py
python3 000ai知识库价值写作体系/系统/generate-index.py --check
```

由于当前脚本在索引过期时仍返回退出码 0，插件首版解析 stdout 文本判断“ 一致”或“索引已过期”。后续可以增强脚本的退出码或 JSON 输出，但不作为插件首版前置条件。

### 3.3 规则页

采用 R1 设计：

- **规则设置**：以表单编辑结构化配置。
- **说明正文**：编辑规则文档的自然语言内容。
- **源文件**：查看和编辑整个 Markdown 文件。

保存行为：

- 允许保存正文。
- 保存时解析结构化规则块并校验。
- 有效配置成为当前生效规则。
- 无效配置不激活，插件继续使用最近一次有效配置并显示错误位置。
- 提供**验证**、**保存规则**和**恢复有效版本**操作。

### 3.4 AI 整理页

提供范围选择：

- 当前文档。
- 当前文件夹。

提供任务选择：

- 本地规则检查。
- 分类和保存位置建议。
- 摘要。
- 关联知识建议。
- 修改建议。

执行前显示上传预览，列出将发送的文件、规则章节、结构化配置和任务类型。用户确认后才调用 API。结果进入候选区，统一显示本地检查结果与 AI 建议，并提供变更预览入口。

### 3.5 每日回填页

按三个动作组织：

| 阶段 | 面板行为 | 输出 |
|---|---|---|
| 白天 | 汇总今天创建或修改的想法、问题、项目进展 | 原始素材清单 |
| 工作结束 | 用户手动触发 AI 整理当天内容 | 知识卡片候选、摘要、分类和关联建议 |
| 每周 | 用户手动运行知识迭代检查 | 周检报告、周复盘草稿、建议变更清单 |

“今日变更”依据 Vault 文件修改时间筛选。用户可以查看并排除文件。每日回填复用 AI 整理页的分析、上传预览、变更计划和确认组件，不创建第二套执行逻辑。

### 3.6 设置页

以下配置放在 Obsidian 插件设置页，不放入日常面板：

- 知识库根目录。
- Python 可执行文件路径。
- 索引脚本相对路径。
- 规则文档相对路径。
- OpenAI 兼容 API 地址。
- 模型名称。
- API 密钥。
- 请求超时时间。

## 4. 规则文档与执行模型

### 4.1 单一规则源

`000ai知识库价值写作体系/系统/知识库规则.md` 是唯一权威规则源。文档中增加固定标记的 YAML 配置块，正文继续承载原则、示例和 AI 语义指导。

固定标记为：

```markdown
<!-- KNOWLEDGE-RULES-BEGIN -->
```yaml
...
```
<!-- KNOWLEDGE-RULES-END -->
```

首版配置至少支持：

```yaml
schemaVersion: 1

scope:
  root: 000ai知识库价值写作体系
  include: ["**/*.md"]
  exclude: ["系统/**"]

frontmatter:
  enabled: true
  required: [title, status, created, updated]
  allowedStatus: [draft, reviewing, verified, deprecated]

checks:
  fileName: true
  directory: true
  source: true
  duplicateTopic: true
  relatedLinks: true

actions:
  patchFrontmatter: confirm
  applyTemplate: confirm
  moveFile: confirm
  regenerateIndex: allowed
  deleteFile: denied

ai:
  tasks: [classify, summarize, suggestRelations, suggestChanges]
  manualOnly: true

dailyBackfill:
  enabled: true
  dailyReview: manual
  weeklyReview: manual
```

### 4.2 最近有效配置

插件在 `loadData` 中保存最近一次有效配置、规则文档哈希、schema 版本和生效时间。规则文档无效时，插件不得部分使用新配置；必须整体回退到最近一次有效配置。

### 4.3 变更计划

本地引擎和 AI 层都输出统一的变更计划，而不是直接操作 Vault：

```ts
interface ChangePlan {
	kind: 'patch' | 'move' | 'index' | 'report';
	target: string;
	reason: string;
	risk: 'low' | 'medium' | 'high';
	diff?: string;
	requiresConfirmation: boolean;
}
```

所有 `patch` 和 `move` 变更必须确认；索引检查可直接执行，索引生成属于规则明确允许的本地动作。

## 5. 数据流

1. 面板加载当前上下文和插件设置。
2. 规则加载器读取规则文档，解析固定配置块。
3. 校验器验证 schema、路径、字段、状态和动作权限。
4. 本地检查引擎扫描当前文档或当前文件夹。
5. 用户选择 AI 任务后，面板生成上传预览。
6. 用户确认上传，OpenAI 客户端发送最小必要内容。
7. 响应解析器只接受约束后的结构化 JSON；非法或越权响应降级为文本建议。
8. 变更计划生成器合并本地结果和 AI 结果。
9. 用户逐条接受、忽略或拒绝，查看 Markdown diff 或移动前后路径。
10. 变更应用器检查文件版本/修改时间未变化后，使用 Obsidian Vault API 执行。
11. 操作结果写入本地运行记录；索引按需重新检查或生成。

## 6. 错误与安全处理

- API 密钥缺失：不发起请求，显示设置入口。
- API 请求失败：保留本地检查结果，允许重试。
- AI 返回非法结构：拒绝文件操作，只保留文本建议。
- 文件在分析后被修改：重新读取并要求重新确认，禁止覆盖新内容。
- 移动目标已存在：停止该项操作并显示冲突。
- Python 不存在、脚本失败或超时：显示命令、退出码和输出，不影响规则检查和 AI 结果。
- 写入失败：逐项报告，已完成变更不回滚，未执行变更保持待处理。
- 所有外部 API 请求显示上传范围；默认不发送整个 Vault。
- 不执行远程代码，不把 API 返回内容当作可执行脚本。
- 路径解析限制在当前 Vault 内，禁止访问 Vault 外路径。

由于 Python 子进程属于桌面能力，插件 `manifest.json` 的 `isDesktopOnly` 应改为 `true`。移动端可以保留规则查看和部分 Markdown 检查，但应禁用 Python 索引操作，并在 UI 中明确说明。

## 7. 代码组织

```text
src/
  main.ts
  settings.ts
  types.ts
  views/
    knowledge-base-view.ts
    tabs/
      overview-tab.ts
      rules-tab.ts
      ai-organize-tab.ts
      daily-backfill-tab.ts
  rules/
    rule-document.ts
    rule-schema.ts
    rule-validator.ts
    rule-store.ts
  checks/
    local-check-engine.ts
    checkers/
      path-checker.ts
      frontmatter-checker.ts
      source-checker.ts
      link-checker.ts
  ai/
    openai-compatible-client.ts
    prompt-builder.ts
    response-parser.ts
  changes/
    change-plan.ts
    diff-preview.ts
    change-applier.ts
  index/
    index-runner.ts
  daily/
    daily-backfill-service.ts
```

`main.ts` 只负责加载设置、注册视图、Ribbon 图标、命令和设置页；具体功能拆到上述模块中。所有事件、定时器和视图资源使用 Obsidian 的 `register*` 生命周期管理。

## 8. 测试策略

### 单元测试

- 结构化规则块提取和 YAML 解析。
- schema 校验、错误位置和最近有效配置回退。
- 路径、文件名、Frontmatter、来源、双链检查器。
- AI 响应 JSON 校验、缺字段、非法动作和越权路径拒绝。
- 今日变更筛选和每周范围计算。

### 集成测试

- 当前文档和当前文件夹两种分析范围。
- 规则编辑后面板状态刷新。
- 变更预览、接受/忽略/拒绝和 Vault 写入。
- 文件外部修改后的冲突检测。
- 移动目标冲突和 Python 进程错误。
- 索引检查与索引生成输出解析。

### 手工验收

- 桌面端打开面板、切换四个页签、编辑规则并恢复有效版本。
- 使用一个缺失 Frontmatter 的 Markdown 文件生成修复建议。
- 使用一个分类错误的文件生成移动预览并确认移动。
- 触发当前文件夹 AI 整理，确认上传预览只包含所选范围。
- 执行每日回填和每周检查，确认结果不会自动写入文件。
- 无 API 配置、无 Python、索引过期、规则语法错误时分别验证提示。

## 9. 实施阶段

1. 将示例插件清理为最小生命周期结构，修改 manifest 为桌面端。
2. 建立设置、类型和 ItemView 骨架，完成四页签静态 UI。
3. 实现规则文档解析、schema 校验、保存和最近有效配置回退。
4. 实现本地检查引擎与索引脚本执行器。
5. 实现变更计划、diff 预览和用户确认后的 Vault 操作。
6. 实现 OpenAI 兼容客户端、上传预览、结构化响应解析和 AI 建议。
7. 实现每日回填与每周检查，复用已有分析和确认流程。
8. 完成桌面端构建、lint、集成测试和手工验收。

## 10. 明确不纳入首版的事项

- 自动定时任务和后台 AI 调用。
- 删除、批量重命名和无确认批量移动。
- 多 AI 提供商管理界面。
- 对自然语言规则的完全自动解释执行。
- 移动端 Python 索引支持。
