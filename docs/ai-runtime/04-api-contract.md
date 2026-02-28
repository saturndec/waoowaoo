# 04 接口契约

## 1) 创建 Run

`POST /api/runs`

请求：

```json
{
  "projectId": "project_x",
  "episodeId": "episode_x",
  "workflowType": "story_to_script_run",
  "taskType": "story_to_script_run",
  "targetType": "NovelPromotionEpisode",
  "targetId": "episode_x",
  "input": {}
}
```

响应：

```json
{
  "success": true,
  "runId": "run_x",
  "run": {}
}
```

## 2) 查询 Run 列表

`GET /api/runs?projectId=&workflowType=&status=&limit=`

响应：

```json
{
  "runs": []
}
```

## 3) 查询 Run 快照

`GET /api/runs/:runId`

响应：

```json
{
  "run": {},
  "steps": []
}
```

## 4) 查询增量事件

`GET /api/runs/:runId/events?afterSeq=0&limit=200`

响应：

```json
{
  "runId": "run_x",
  "afterSeq": 0,
  "events": []
}
```

## 5) 取消 Run

`POST /api/runs/:runId/cancel`

响应：

```json
{
  "success": true,
  "run": {}
}
```

## 鉴权规则

- 必须登录。
- 仅允许访问 `run.userId === session.user.id` 的数据。

## 兼容关系

- 现有业务 route 仍走 `submitTask`。
- `submitTask` 现在会返回 `taskId` + `runId`（AI 任务）。
- 前端优先消费 run 事件，task SSE 作为兜底链路。
