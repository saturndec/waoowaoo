# 08 当前差距与后续动作

## 已解决

1. step 重试标识混乱（动态后缀）已解决。
2. runId 透传不全导致桥接缺失已解决。
3. run/step 终态不一致问题已做后端投影收敛。
4. story/script 前端主链路已切换为 run-event 单通道（不再依赖 task SSE 兜底）。
5. `GraphExecutor`、`PipelineGraph`、`QuickRunGraph` 已落地并接入两条核心 worker 主路径。
6. `src/lib/ai-runtime/` 已落地并接入 story/script 两条核心链路。

## 未完全收口

1. 长尾 AI handler 已完成第一批迁移，但仍有部分直接调用 `llm-client`（如 shot 系列、`text.worker`、`storyboard-phases`）待收口。
2. 图片/视频/音频页面的运行态展示与控制仍存在 task-state 路径，未全部切到 run-store。
3. 旧 task-stream 基础设施仍用于非 run 页面，尚未最终下线。

## 下一个迭代优先级

1. P0：将其余 AI worker handler 全量切到 `src/lib/ai-runtime/`。
2. P0：图片/视频/音频运行 UI 与取消控制统一到 run-store。
3. P1：移除剩余 task-stream 作为主状态源的代码路径。
4. P1：补齐全链路回归并清理 dead code。

## 完成定义（DoD）

1. `story_to_script_run` 和 `script_to_storyboard_run` 均由 graph runtime 驱动。
2. 所有 AI route 通过同一运行时协议暴露状态。
3. `npm run test:regression` 全绿。
4. 主控文档阶段状态全部切为 `✅ 已完成`。
