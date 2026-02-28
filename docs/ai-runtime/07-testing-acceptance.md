# 07 测试与验收

## 验收目标

1. 状态一致：不出现“run 完成但 step 卡 running”。
2. 顺序一致：按 seq 单调推进，重复事件不回退状态。
3. 恢复一致：刷新后能恢复 run 快照和增量输出。
4. 失败可解释：run.error/step.error 有明确错误码与错误信息。

## 最低测试矩阵

每个核心 workflow 至少覆盖：

1. 成功路径
2. 可重试失败后成功
3. 不可重试失败
4. 中途取消
5. 刷新恢复

## 当前新增测试

1. `tests/unit/run-runtime/task-bridge.test.ts`
2. `tests/unit/helpers/run-request-executor.run-events.test.ts`

## 建议执行命令

```bash
npx vitest run tests/unit/run-runtime/task-bridge.test.ts
npx vitest run tests/unit/helpers/run-request-executor.run-events.test.ts
npx vitest run tests/unit/helpers/run-stream-state-machine.test.ts
npm run build
npm run test:regression
```

## 当前已知阻塞

`test:regression` 当前存在仓库内既有失败（非本轮 run-runtime 文档化引入）：

1. `tests/unit/optimistic/task-target-overlay.test.ts`
2. `tests/unit/billing/cost-error-branches.test.ts`

这些失败需单独修复后才能宣告全量回归绿灯。
