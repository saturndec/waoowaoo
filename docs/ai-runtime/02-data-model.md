# 02 数据模型

本节对应 `prisma/schema.prisma` 中新增的 graph 相关模型。

## 表清单

1. `graph_runs`
2. `graph_steps`
3. `graph_step_attempts`
4. `graph_events`
5. `graph_checkpoints`
6. `graph_artifacts`

## graph_runs

用途：一次 AI 运行的根对象。

关键字段：

- `id`
- `userId`, `projectId`, `episodeId`
- `workflowType`, `taskType`, `taskId`
- `status` (`queued|running|completed|failed|canceling|canceled`)
- `lastSeq`：run 内事件时钟游标
- `input`, `output`, `errorCode`, `errorMessage`
- `cancelRequestedAt`, `queuedAt`, `startedAt`, `finishedAt`

关键约束：

- `taskId` 唯一（一个 task 对应一个 run）

## graph_steps

用途：run 级步骤投影。

关键字段：

- `runId + stepKey` 唯一
- `status` (`pending|running|completed|failed|canceled`)
- `currentAttempt`
- `stepIndex`, `stepTotal`
- `lastErrorCode`, `lastErrorMessage`

## graph_step_attempts

用途：每个 step 的尝试明细。

关键字段：

- `runId + stepKey + attempt` 唯一
- `status`
- `outputText`, `outputReasoning`
- `errorCode`, `errorMessage`
- `usageJson`

## graph_events

用途：事件日志 + 回放源。

关键字段：

- `runId`
- `seq`（run 内单调递增）
- `eventType`
- `stepKey`, `attempt`, `lane`
- `payload`

关键约束：

- `(runId, seq)` 唯一

## graph_checkpoints

用途：图节点恢复点。

关键字段：

- `runId`, `nodeKey`, `version`
- `stateJson`
- `stateBytes`

约束策略：

- State 大小守卫，当前实现上限 `64KB`（`RUN_STATE_MAX_BYTES`）。
- State 只存 refs，不存正文大文本。

## graph_artifacts

用途：运行产物引用（DB 行、对象存储、版本哈希等）。

建议存储：

- `artifactType`
- `refType`（db/object-storage）
- `refId` 或 `uri`
- `metaJson`

## 时钟与事务策略

`appendRunEventWithSeq` 在单事务内执行：

1. `graph_runs.lastSeq += 1`
2. 插入 `graph_events(seq=lastSeq)`
3. 更新 step/run 投影

这样保证：

- 不会生成重复 seq
- 事件与投影一致提交
