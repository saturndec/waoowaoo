# 06 运维与排障

## 关键日志维度

每条关键日志应至少带：

- `runId`
- `stepKey`
- `attempt`
- `taskId`
- `projectId`
- `errorCode`

## 常见故障与处置

### 1) `fetch failed` / `terminated`

现象：

- LLM 或外部 provider 网络中断。

处理：

1. 看 `errorCode` 是否 `NETWORK_ERROR`。
2. 确认是否进入重试策略。
3. 确认 run 是否最终落到 `run.error`。

### 2) 前端显示完成但仍在输出

排查：

1. 查看 run events 是否有晚到 `step.chunk`。
2. 查看是否最终存在 `step.complete` 或 `run.complete`。
3. 检查 stepKey 是否被动态后缀污染。

### 3) 刷新后状态缺失

排查：

1. `GET /api/runs/:id` 是否返回快照。
2. `GET /api/runs/:id/events?afterSeq=` 是否有增量。
3. 前端是否按 seq 正确应用。

### 4) Redis 连接拒绝导致刷屏

说明：

- Redis 仅用于实时广播，MySQL 才是事实源。

处理：

1. 先恢复 Redis。
2. 若短时不可用，确认 run 事件已落库，可通过 afterSeq 补拉恢复视图。

## 观测建议

1. 增加 run 维度错误率看板：`failed / total`。
2. 增加 step 重试次数分布。
3. 增加 seq gap 检测计数。

## 手工排障查询建议

- 查 run：按 `runId`
- 查 step：按 `runId + stepKey`
- 查事件：按 `runId order by seq`
- 查 attempt：按 `runId + stepKey + attempt`
