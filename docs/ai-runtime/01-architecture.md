# 01 架构总览

## 目标

统一所有 AI 任务的“运行时语义”，把状态、事件、取消、回放、重试观测收敛到一套模型。

注意：统一的是运行时，不是把所有任务执行逻辑改成同一种模型调用。  
文本任务仍走 LLM，图片/视频任务仍走媒体生成器。

## 设计原则

1. 单一事实源：MySQL。
2. 显式失败：不吞错，不静默降级。
3. 稳定标识：`stepKey` 稳定，`attempt` 独立。
4. 有序事件：run 内 `seq` 单调递增。
5. 可恢复：刷新后快照 + 增量回放。

## 组件边界

- `submitTask`：创建任务并创建/绑定 `runId`（AI 任务）。
- `worker`：执行实际任务，发布 task 事件。
- `task-bridge`：把 task 事件映射为 run 事件。
- `run-runtime/service`：分配 seq、写入 graph 表、做投影。
- `run-runtime/publisher`：发布 run Redis 事件。
- 前端 `run-stream`：消费 run 事件并渲染阶段 UI。

## 当前执行路径（已落地）

1. API route 调用 `submitTask`。
2. `submitTask` 对 AI task 创建 `graph_runs` 记录并回写 `runId` 到 payload。
3. worker 运行并发出 task lifecycle/stream 事件。
4. `task-bridge` 将 task 事件转换为 `run.start/step.start/step.chunk/step.complete/step.error/run.complete/run.error`。
5. `service` 在事务内递增 `lastSeq`，写 `graph_events`，更新 `graph_runs/graph_steps/graph_step_attempts`。
6. 前端优先通过 `/api/runs/:runId/events?afterSeq=` 拉增量事件。

## 为什么这比旧架构稳定

- 消除 stepId 重试后缀爆炸：`stepId` 固定 + `stepAttempt` 递增。
- 消除 run 与 step 终态不一致：run 终态时批量收敛未终态 step。
- 消除“只靠 SSE 运气”的刷新恢复：run 事件可持续补拉。

## 当前仍未完成

- `GraphExecutor` 与 `PipelineGraph` 还未替换全部复杂链路。
- 旧 task SSE 仍保留兜底路径（短期合理，长期要收口）。
