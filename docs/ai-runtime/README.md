# AI Runtime Unification Docs

本目录是“统一 AI 运行时重构”的正式文档集合，目标是让任何新模型或新工程师在无上下文下也能立即接手执行。

## 文档索引

1. [01-架构总览](./01-architecture.md)
2. [02-数据模型](./02-data-model.md)
3. [03-事件协议与时钟](./03-event-protocol.md)
4. [04-接口契约](./04-api-contract.md)
5. [05-迁移执行手册](./05-migration-playbook.md)
6. [06-运维与排障](./06-operations-runbook.md)
7. [07-测试与验收](./07-testing-acceptance.md)
8. [08-当前差距与后续动作](./08-open-gaps.md)

## 单一事实源

- 执行状态看板：`docs/AI_RUNTIME_UNIFICATION_EXECUTION_MASTER_PLAN.md`
- 运行时类型：`src/lib/run-runtime/types.ts`
- 运行时服务：`src/lib/run-runtime/service.ts`
- 事件发布：`src/lib/run-runtime/publisher.ts`
- 任务桥接：`src/lib/run-runtime/task-bridge.ts`

## 强约束

- 不做兼容层。
- 不做隐式回退。
- State 只存引用，不存大文本正文。
- 事件必须基于 `seq` 单调递增消费。
