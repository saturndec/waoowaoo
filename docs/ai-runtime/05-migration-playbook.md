# 05 迁移执行手册

## 总体策略

一次性切换语义，禁止长期双轨。

## 当前已完成

1. graph_* 表与 run API 已上线。
2. task->run 桥接已上线。
3. step 重试标识已规范化（固定 stepKey + attempt）。
4. 前端已优先使用 run events 拉取。

## 剩余关键迁移

1. 引入 `src/lib/ai-runtime/` 统一调用层。
2. 引入 `GraphExecutor`。
3. 迁移 `story_to_script_run` 到 `PipelineGraph`。
4. 迁移 `script_to_storyboard_run` 到 `PipelineGraph`。
5. 迁移其余 AI 任务（图片/视频/音频）到统一 runtime 外壳。
6. 删除旧 task-stream 作为主状态源的路径。

## 每个任务类型迁移模板

1. 建立稳定 `stepKey` 列表。
2. 执行器改为通过 runtime publish 事件。
3. 结果落业务表，State 只落 refs。
4. 新增 1 成功 + 1 可重试失败 + 1 不可重试失败测试。
5. 通过 `test:regression` 后切换流量。

## 禁止事项

- 不得引入“模型不可用时自动换模型”类隐式回退。
- 不得保留旧 stepId 动态后缀语义。
- 不得把大文本正文塞入 checkpoint state。

## 提交流程

1. 先更新主控文档状态。
2. 再提交代码。
3. 最后补验证记录与已知问题。
