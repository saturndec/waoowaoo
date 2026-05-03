# Assistant 全系统操作能力检查报告

> 检查日期：2026-05-02
> 目标：评估当前 Project Assistant 是否已经具备“用户通过对话操作整个系统”的基础，并列出后续需要新增、优化和补测试的事项。

## 1. 一句话结论

当前架构方向是对的：系统已经把大部分业务能力收敛到 `operation registry`，AI tool 和 API route 基本都能走统一 operation 兼容层。

但如果目标是让 AI 稳定操作整个系统，还缺三类关键能力：

1. **异步任务完成结果自动进入 AI 上下文**：AI 现在能看到“任务已提交”，但不能稳定自动看到“最终生成了什么/失败在哪里”。
2. **UI 当前选择状态进入 AI 上下文**：用户说“这个镜头”“当前图片”“刚才那个素材”时，AI 还缺少足够明确的页面选择信息。
3. **operation 覆盖与反馈质量需要持续盘点**：已有 operation 很多，但还需要标注哪些可给 AI 用、哪些只给 API/UI 用、哪些缺完成卡片/撤回/测试。

## 2. 当前架构现状

### 2.1 Assistant 主链路

现在的主链路是：

```txt
Workspace Assistant UI
  -> /api/projects/[projectId]/assistant/chat
    -> project-agent runtime
      -> router 判断用户意图
      -> operation injection 选择工具组
      -> tool adapter 执行 operation
        -> operation registry
          -> domain operation
            -> task / worker / provider / storage / DB
```

这条链路是合理的。它和代码编辑器类 AI agent 的思路一致：AI 不是直接操作数据库，而是拿到受控工具，再通过权限、确认、schema 和执行结果来闭环。

### 2.2 Operation 当前覆盖情况

基于 `agent:export-operation-registry` 导出的 registry：

| 指标 | 当前数量 |
| --- | ---: |
| operation 总数 | 198 |
| `tool: true, api: true` | 101 |
| `tool: false, api: true` | 92 |
| `tool: true, api: false` | 5 |
| `intent=query` | 51 |
| `intent=plan` | 4 |
| `intent=act` | 143 |
| tool 通道高风险 operation | 56 |
| 高风险 tool 缺 confirmation | 0 |

解释：

- `tool: true` 表示 AI 可以在对话里调用。
- `api: true` 表示前端/API route 可以调用。
- 高风险指 `billable / destructive / overwrite / bulk / externalSideEffects / longRunning` 任一为 true。
- 当前 registry guard 已能拦截“高风险 tool operation 没有 confirmation”的问题。

### 2.3 API route 当前收敛情况

静态检查结果：

| 指标 | 当前数量 |
| --- | ---: |
| API route 总数 | 145 |
| 使用 `executeProjectAgentOperationFromApi` 的 route | 131 |
| 未使用 operation adapter 的 route | 14 |
| 未使用 adapter 但直接 `submitTask` 的 route | 0 |
| 未使用 adapter 但直接 `prisma` 的 route | 0 |

未走 adapter 的 route 主要是：

- assistant chat/chat log 本身
- auth / files / storage / system / admin 等基础设施 route
- 少量 user balance / style presets 等用户侧读取或专用能力

这说明 route 层总体已经收敛得比较好，没有发现明显“生成类 route 绕过 operation 直接 submitTask”的问题。

## 3. 已经做得比较好的部分

### 3.1 Operation 是统一能力层

系统已经有统一的 operation 定义：

```ts
{
  id,
  summary,
  intent,
  groupPath,
  channels,
  effects,
  confirmation,
  inputSchema,
  outputSchema,
  execute,
}
```

这很好，因为它让系统能力具备以下属性：

- AI 能知道自己能调用什么。
- API/UI 也能复用同一套执行逻辑。
- 输入输出能被 schema 校验。
- 高风险操作能被 confirmation gate 拦住。
- plan mode 可以禁止写入类工具。

### 3.2 Tool 和 API 已经分 adapter

当前有两条执行入口：

```txt
AI tool -> executeProjectAgentOperationFromTool
API/UI  -> executeProjectAgentOperationFromApi
```

这两个 adapter 做的是同一件事：找到 operation、校验输入、执行、校验输出、返回结构化结果。

差异是：

- tool adapter 会写 assistant data part，例如确认卡、任务提交卡。
- api adapter 不写 data part，只返回 JSON。

这个分层是合理的。

### 3.3 高风险确认机制已经存在

当前 high-risk tool operation 都需要 confirmation。

例如音乐生成：

```ts
effects: {
  writes: true,
  billable: true,
  externalSideEffects: true,
  longRunning: true,
}

confirmation: {
  required: true,
}
```

这代表 AI 可以提出操作，但用户确认前不能真正执行。

### 3.4 Assistant UI 已有基础反馈卡片

当前已有这些 assistant 可见 UI 反馈：

- confirmation request card
- approval request card
- task submitted card
- task batch submitted card
- workflow plan/status card
- project phase/context card
- script/storyboard preview card

这说明“结构化反馈”方向已经存在，不需要重做，只需要补齐“完成结果”和“失败结果”。

## 4. 关键缺口

### 4.1 缺口一：异步任务最终结果没有统一自动注入给 AI

当前状态：

- AI 调用生成类 operation 后，能看到 `taskId / status / runId / deduped`。
- worker 完成后会把 result 写到 `Task.result`。
- 但 `ProjectContextSnapshot` 没有 `recentOperationResults`。
- assistant 下一轮不会自动得到“刚才任务完成了，生成了这个 mediaId/url”。

通俗理解：

```txt
AI 现在知道：我已经提交了一个生成音乐任务。
AI 还不能稳定自动知道：这个音乐已经生成成功，音频地址是哪个。
```

需要新增：

```ts
type RecentOperationResult = {
  operationId: string | null
  taskId: string
  runId?: string | null
  taskType: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'
  source?: string | null
  targetType: string
  targetId: string
  episodeId?: string | null
  provider?: string | null
  model?: string | null
  media?: {
    mediaId?: string | null
    mediaType?: 'image' | 'video' | 'audio' | 'music' | null
    url?: string | null
    storageKey?: string | null
    mimeType?: string | null
    width?: number | null
    height?: number | null
    durationMs?: number | null
  } | null
  error?: {
    code?: string | null
    message: string
    retryable?: boolean | null
  } | null
  submittedAt: string
  completedAt?: string | null
  mutationBatchId?: string | null
  canUndo?: boolean
}
```

### 4.2 缺口二：worker result 形态不统一

当前 worker 返回结果是分散的：

- 音乐 worker 返回 `mediaId / audioUrl / storageKey / musicModel / provider`
- 图片 worker 常见返回 `imageUrl`
- 视频 worker 常见返回 `videoUrl`
- 文本/分析任务返回各自业务结果

这对业务可用，但对 AI 不够稳定。AI 需要一个统一语言理解：

```txt
这是哪个 operation 的结果
状态是什么
生成了什么媒体
媒体在哪里
用的哪个 provider/model
失败原因是什么
下一步能不能重试/撤回
```

需要新增统一 normalizer：

```txt
Task.result + Task.type + Task.payload + Task.billingInfo
  -> normalizeTaskOperationResult()
    -> RecentOperationResult
```

这样不要求每个 worker 直接写 assistant 消息，也不要求 worker 知道 assistant 存在。

### 4.3 缺口三：task 缺少 first-class operation 元信息

`Task` 表已有：

```txt
type
targetType
targetId
payload
result
billingInfo
externalId
status
```

但没有独立字段：

```txt
operationId
source
confirmed
```

目前这些信息可能在 payload、mutation batch 或调用上下文里间接存在，但不够稳定。

推荐短期做法：

- 不急着迁移数据库。
- 先在 `submitOperationTask` 统一写入 payload.meta：

```ts
meta: {
  operationId,
  source,
  confirmed,
  requestId,
}
```

中长期再评估是否把 `operationId/source` 提升为 Task 表字段。

### 4.4 缺口四：ProjectContext 没有 recentOperationResults

当前 `ProjectContextSnapshot` 有：

```ts
latestArtifacts
activeRuns
policy
workflow
```

没有：

```ts
activeOperationTasks
recentOperationResults
```

这导致 AI 每轮只能看到项目阶段和 workflow 状态，不能自然看到最近异步任务的最终产物。

需要新增：

```ts
ProjectContextSnapshot {
  activeOperationTasks: RecentOperationResult[]
  recentOperationResults: RecentOperationResult[]
}
```

建议读取规则：

- `activeOperationTasks`：最近 queued/processing 的任务，默认最多 10 条。
- `recentOperationResults`：最近 completed/failed/canceled 的任务，默认最多 10 条。
- 按 projectId 过滤。
- 有 episodeId 时优先返回同 episode 的任务，同时保留 project-level 任务。
- 不注入大 payload、base64、大段 provider 原始响应。

### 4.5 缺口五：UI 当前选择上下文不足

当前 assistant 前端传入的 context 主要是：

```ts
{
  locale,
  projectId,
  episodeId,
  interactionMode,
}
```

代码里已有 `selectedScopeRef` 的类型和 ProjectContext 字段，但 Workspace Assistant 当前没有稳定传入：

```ts
selectedPanelId
selectedClipId
selectedAssetId
selectedScopeRef
currentStage
```

这会影响自然语言操作：

```txt
用户说：把这个镜头重新生成。
AI 需要知道：这个镜头具体是哪个 panelId。
```

需要补齐 UI selection context。

### 4.6 缺口六：完成/失败卡片缺失

当前有 task submitted card，但没有统一的：

```txt
OperationCompletedCard
OperationFailedCard
```

短期可以先不自动写聊天消息，只让 ProjectContext 给 AI 看到。

但 UI 体验上，建议后续增加：

- 任务完成卡：展示 media 预览、model、provider、耗时。
- 任务失败卡：展示错误原因、是否可重试、建议下一步。
- 可撤回卡：展示 mutationBatchId 和撤回按钮。

### 4.7 缺口七：权限模式还比较粗

当前模式是：

```txt
auto
plan
fast
```

已经够用，但如果要让 AI 操作整个系统，建议未来改成更明确的权限 profile：

```txt
readOnly：只能查询
plan：只能计划，不执行写入
confirm：写入/计费/外部调用都确认
fast：低风险自动执行，高风险确认
admin：更大范围执行，但 destructive 仍确认
```

这不是第一阶段必须做，但应该进入长期计划。

### 4.8 缺口八：API-only operation 需要分类

当前有 92 个 `tool: false, api: true` operation。

这不一定是问题，因为有些能力确实不该给 AI 直接调用，例如上传、内部 GUI mutation、资产中心后台操作。

但需要做一张清单，把 API-only 分成三类：

1. **应该继续 API-only**：例如上传、auth、内部系统能力。
2. **应该开放给 AI tool**：例如某些用户自然会要求的编辑、资产、设置能力。
3. **需要新包装 operation**：原能力太底层，不适合直接给 AI，需要一个更安全的高层 operation。

### 4.9 缺口九：测试还缺“AI 最终可见性”链路

现有测试覆盖了：

- operation registry
- tool adapter confirmation
- api adapter
- project-agent runtime/router
- project context assembler
- worker
- route contract

但缺少这些测试：

- worker completed result -> normalizer -> recentOperationResults
- failed task -> AI context 可见 error
- assistant next turn 能看到 recentOperationResults
- UI selection context 传入 assistant runtime
- completed/failed operation card
- 高风险 operation coverage guard 的完整报表

## 5. 需要新增的工作

### P0-A 新增统一异步结果类型

新增文件建议：

```txt
src/lib/task/operation-result-types.ts
```

定义：

- `RecentOperationResult`
- `RecentOperationMedia`
- `RecentOperationError`
- `OperationResultStatus`

目标：

让图片、视频、音乐、配音、文本任务都能被 AI 用同一种结构理解。

### P0-B 新增 task result normalizer

新增文件建议：

```txt
src/lib/task/operation-result-normalizer.ts
```

职责：

```txt
Task row
  -> 根据 task.type / task.result / task.payload / task.billingInfo
  -> 转成 RecentOperationResult
```

第一版至少覆盖：

- `music_generate`
- `image_panel`
- `image_character`
- `image_location`
- `video_panel`
- `lip_sync`
- `voice_line`
- `voice_design`
- `regenerate_storyboard_text`
- `story_to_script_run`
- `script_to_storyboard_run`

失败任务统一读取：

```txt
errorCode
errorMessage
```

### P0-C ProjectContext 注入 recentOperationResults

修改：

```txt
src/lib/project-context/types.ts
src/lib/project-context/assembler.ts
src/lib/project-agent/presentation.ts
```

新增字段：

```ts
activeOperationTasks: RecentOperationResult[]
recentOperationResults: RecentOperationResult[]
```

目标：

AI 下一轮自动知道最近后台任务的完成/失败结果。

### P0-D Assistant prompt 增加结果读取规则

修改：

```txt
src/lib/project-agent/copy.ts
```

增加规则：

```txt
如果用户询问“刚才生成的结果”“刚才任务怎么样了”，优先读取 project context 中的 recentOperationResults 和 activeOperationTasks。
不要猜测异步任务已经完成；以 task status 和 result 为准。
```

### P0-E 补测试

新增测试建议：

```txt
tests/unit/task/operation-result-normalizer.test.ts
tests/unit/project-context/recent-operation-results.test.ts
tests/unit/project-agent/presentation.test.ts
tests/integration/api/contract/project-assistant-chat.route.test.ts
```

重点场景：

- completed music task -> recentOperationResults 带 mediaId/audioUrl/provider/model
- failed image task -> recentOperationResults 带 errorCode/errorMessage
- processing video task -> activeOperationTasks 可见
- context full/snapshot 都不包含大 payload/base64

## 6. 需要优化的工作

### P1-A 统一 operation 提交 task 的 metadata

当前有些 operation 直接调用 `submitTask`，有些通过 `submitOperationTask`。

建议逐步收敛：

```txt
operation.execute
  -> submitOperationTask
    -> submitTask
```

并让 `submitOperationTask` 统一写：

```ts
meta: {
  operationId,
  source,
  confirmed,
  requestId,
}
```

这样 recentOperationResults 可以稳定知道“这个 task 来源于哪个 operation”。

### P1-B UI selection context 注入 assistant

修改：

```txt
WorkspaceAssistantPanel
useWorkspaceAssistantRuntime
```

建议 context 支持：

```ts
{
  currentStage,
  selectedScopeRef,
  selectedPanelId,
  selectedClipId,
  selectedAssetId,
}
```

用户说“这个”“当前”“刚才那个”时，AI 才有明确对象。

### P1-C Operation 覆盖表

新增文档或脚本输出：

```txt
docs/agent/operation-coverage-matrix.md
```

字段：

```txt
功能名称
现有入口 route/hook/mutation
是否已有 operation
operationId
channels.tool
channels.api
effects
confirmation
是否异步 task
是否有 UI 卡片反馈
是否可撤回
是否有测试
```

这张表用于判断“哪些功能已经准备好交给 AI 操作”。

### P1-D 完成/失败 UI 卡片

新增或扩展 assistant renderer：

```txt
OperationCompletedCard
OperationFailedCard
```

注意：

- 不建议 worker 直接写 assistant thread。
- 应该由 ProjectContext/recentOperationResults 或 task event 投影统一生成 UI 信息。

### P1-E 权限模式升级

当前 `auto / plan / fast` 先保留。

后续可以升级为：

```txt
readOnly
plan
confirm
fast
admin
```

第一版不急着改，避免一次性影响太大。

### P1-F Tool 注入策略继续优化

当前按 requestedGroups 注入，方向正确。

后续可以增加：

- 当前 stage 相关工具优先。
- 当前 selection 相关工具优先。
- 有 failed task 时注入 retry/recovery 工具。
- provider/config 缺失时注入设置查询工具。

目标不是给 AI 更多工具，而是给 AI 刚好够用的工具。

## 7. 功能级覆盖初步判断

### 7.1 已比较成熟，可继续沿用

- operation registry
- tool/api adapter
- high-risk confirmation gate
- plan mode 禁止写入
- router requestedGroups 工具注入
- assistant thread persistence
- task submitted UI card
- workflow approval/status card
- mutation batch revert 基础能力

### 7.2 可用但需要补 AI 最终可见性

- 图片生成
- 视频生成
- 音乐生成
- 配音生成
- lip sync
- LLM 分析/剧本/分镜工作流
- 资产中心 AI 生成/修改

这些现在能提交任务，但完成后需要 `recentOperationResults` 自动注入。

### 7.3 需要继续分类是否开放给 AI

- `gui` group 下的 API-only operation
- asset-hub library 类 operation
- user style preset 类 route
- balance/cost/details 类用户财务 route
- upload / files / storage / admin 类基础设施 route

这些不应简单全部开放给 AI。需要按“用户是否会自然要求 AI 操作它”“是否有高层安全封装”来决定。

## 8. 推荐落地顺序

### 第一阶段：让 AI 自动看到异步结果

1. 新增 `RecentOperationResult` 类型。
2. 新增 `normalizeTaskOperationResult()`。
3. ProjectContext 增加 `activeOperationTasks` / `recentOperationResults`。
4. assistant presentation 和 prompt 读取这些字段。
5. 补 normalizer 和 ProjectContext 测试。

验收标准：

```txt
AI 提交音乐任务
  -> 当轮看到 task submitted
worker 完成
  -> 下一轮 get_project_context 能看到 mediaId/audioUrl/provider/model
AI 能准确回复“刚才的音乐已生成”
```

### 第二阶段：让 AI 知道“这个”是谁

1. 注入 currentStage。
2. 注入 selectedScopeRef。
3. 注入 selectedPanelId / selectedClipId / selectedAssetId。
4. 更新 router/prompt，让 AI 优先使用当前选择对象。
5. 补组件和 runtime 测试。

验收标准：

```txt
用户在某个 panel 上说“重新生成这个镜头”
AI 使用 selectedPanelId
不会误操作其他 panel
```

### 第三阶段：完善反馈 UI 和操作覆盖表

1. 新增 operation coverage matrix。
2. 新增 completed/failed card。
3. 标注哪些 API-only 应开放给 tool。
4. 补撤回/重试推荐。

验收标准：

```txt
每个核心功能都知道：
能不能给 AI 用
是否需要确认
是否异步
完成后 AI 怎么知道
失败后用户怎么处理
```

### 第四阶段：权限模式和审计增强

1. 评估 `readOnly / confirm / admin` 是否需要落地。
2. 统一 operation/task/audit 元信息。
3. 让 task 和 mutation batch 能更稳定串联。

验收标准：

```txt
AI 的每次写入/计费/删除操作都能追踪：
谁触发
从哪里触发
用户是否确认
影响了什么对象
能否撤回
最终结果如何
```

## 9. 本次检查用到的事实来源

主要检查了：

- `src/lib/project-agent/**`
- `src/lib/operations/**`
- `src/lib/adapters/tools/**`
- `src/lib/adapters/api/**`
- `src/lib/project-context/**`
- `src/lib/task/**`
- `src/lib/workers/**`
- `src/features/project-workspace/components/workspace-assistant/**`
- `src/app/api/**`
- `prisma/schema.prisma`
- `tests/unit/project-agent/**`
- `tests/unit/operations/**`
- `tests/unit/project-context/**`
- `tests/unit/worker/**`
- `tests/integration/api/contract/**`

辅助命令：

```bash
npm run agent:export-operation-registry
find src/app/api -name route.ts
rg "executeProjectAgentOperationFromApi" src/app/api
rg "writeOperationDataPart" src/lib/operations
rg "submitTask\\(|submitOperationTask\\(" src/lib/operations src/app/api
rg "recentOperationResults|operationResult" src tests
```

## 10. 最重要的下一步

如果只做一件事，先做：

```txt
RecentOperationResult + task result normalizer + ProjectContext 自动注入
```

原因：

这是当前 assistant 从“能提交任务”升级到“能理解任务完成结果”的关键一步。没有它，AI 可以操作系统，但不能可靠跟进异步结果；有了它，AI 才能真正持续推进工作。
