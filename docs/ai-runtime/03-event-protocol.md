# 03 事件协议与时钟

## RunEventV2 事件类型

- `run.start`
- `step.start`
- `step.chunk`
- `step.complete`
- `step.error`
- `run.complete`
- `run.error`
- `run.canceled`

## 统一字段

- `runId`
- `projectId`
- `userId`
- `seq`（仅持久化后的 run event 有）
- `eventType`
- `stepKey`（step 事件）
- `attempt`（step 事件）
- `lane`（chunk 事件：`text|reasoning`）
- `payload`
- `createdAt`

## task -> run 映射规则（当前实现）

来源：`src/lib/run-runtime/task-bridge.ts`

1. `task.lifecycle + task.created` -> `run.start`
2. `task.lifecycle + task.processing` -> `step.start`
3. `task.stream` -> `step.chunk`
4. `task.lifecycle + task.processing + done/stage=complete` -> `step.complete`
5. `task.lifecycle + task.processing + stage=error or payload.error` -> `step.error`
6. `task.lifecycle + task.completed` -> `step.complete` + `run.complete`
7. `task.lifecycle + task.failed` -> `step.error` + `run.error`

补充规则：

- stream 缺失 `stepId` 时，fallback 为 `step:${taskType}`。
- `runId` 可从 payload 或 payload.meta 提取。

## 顺序保障

- 后端：`(runId, seq)` 唯一，按 seq 查询。
- 前端：只应按 seq 前进应用事件；重复 seq 应跳过。

## 跳号处理（目标语义）

当收到事件 `seq > lastSeq + 1`：

1. 立即触发 `GET /api/runs/:id/events?afterSeq=lastSeq`
2. 先补齐缺失段，再应用实时事件

当前状态：

- 前端已接入 run 增量拉取；
- “显式 gap 检测 + 自动补拉”仍在收口中（见 `08-open-gaps.md`）。
