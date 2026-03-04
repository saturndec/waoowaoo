# Error Handling

> 后端错误处理遵循 **显式失败** 与 **零隐式回退** 原则。

---

## Overview

- 统一错误码来源：`src/lib/errors/codes.ts`（`ERROR_CATALOG`）。
- API 路由统一使用 `apiHandler` 包装，异常统一进入 `normalizeError` / `normalizeAnyError`。
- 返回体必须包含 `requestId` 和结构化 `error`，并在响应头写入 `x-request-id`。
- 禁止静默吞错、自动降级模型、无告警默认值兜底。

---

## Scenario: API/Worker 错误归一与跨层透传

### 1. Scope / Trigger

- Trigger：`Route -> Service -> Provider/DB` 任一层抛出异常。
- Trigger：错误需要从后端透传到前端展示层，同时保持机器可读字段（code/retryable/category）。
- Trigger：需要将未知错误归一为统一错误码，避免“字符串消息耦合业务逻辑”。

### 2. Signatures

```ts
export type UnifiedErrorCode = keyof typeof ERROR_CATALOG

export class ApiError extends Error {
  code: UnifiedErrorCode
  status: number
  details?: Record<string, unknown>
  retryable: boolean
  category: string
  userMessageKey: string
}

export function normalizeAnyError(
  input: unknown,
  options?: {
    context?: 'api' | 'worker'
    fallbackCode?: UnifiedErrorCode
    details?: Record<string, unknown> | null
  },
): NormalizedError

export function apiHandler<TParams extends RouteParams>(
  handler: ApiHandler<TParams>,
): ApiHandler<TParams>
```

### 3. Contracts

- **请求侧契约**：入参校验失败必须抛 `new ApiError('INVALID_PARAMS')`，禁止返回伪成功。
- **归一化契约**：所有未知异常必须经过 `normalizeAnyError`，禁止直接把原始 `Error` 透传给客户端。
- **响应体契约**（由 `apiHandler` 输出）：

```json
{
  "success": false,
  "requestId": "req_xxx",
  "error": {
    "code": "INVALID_PARAMS",
    "message": "Invalid parameters",
    "retryable": false,
    "category": "VALIDATION",
    "userMessageKey": "errors.INVALID_PARAMS",
    "details": {
      "requestId": "req_xxx"
    }
  },
  "code": "INVALID_PARAMS",
  "message": "Invalid parameters"
}
```

- **响应头契约**：成功与失败响应都必须带 `x-request-id`。

### 4. Validation & Error Matrix

| 触发场景 | 归一化 code | HTTP 状态 | retryable | 关键断言 |
|---|---|---:|---:|---|
| 缺失参数 / 参数类型错误 | `INVALID_PARAMS` | 400 | false | `body.error.code === 'INVALID_PARAMS'` |
| 余额不足 | `INSUFFICIENT_BALANCE` | 402 | false | `body.required`、`body.available` 为数值 |
| 网络中断（如 `TypeError('terminated')`） | `NETWORK_ERROR` | 502 | true | `normalized.retryable === true` |
| 未知异常 | `INTERNAL_ERROR` | 500 | false | `body.error.code === 'INTERNAL_ERROR'` 且带 `requestId` |
| 重复请求冲突 | `CONFLICT` | 409 | false | 二次请求返回 `CONFLICT` 且不重复扣费 |

### 5. Good / Base / Bad Cases

- **Good**：在路由边界抛 `ApiError`，由 `apiHandler` 统一封装响应。
- **Base**：普通 `Error` 未带 code 时，归一为 `INTERNAL_ERROR`，并附带 `requestId`。
- **Bad**：`catch` 后返回默认成功值（如空数组、`{ success: true }`）掩盖真实失败。

### 6. Tests Required（含断言点）

- `tests/unit/task/normalize-error.test.ts`
  - 断言 `TypeError('terminated')` / `socket hang up` 映射为 `NETWORK_ERROR`。
  - 断言 `retryable === true`，不能只断言“函数被调用”。
- `tests/integration/billing/api-contract.integration.test.ts`
  - 余额不足：断言 HTTP 402、`body.error.code`、`required/available` 具体字段值。
  - 幂等冲突：断言第二次请求为 409 `CONFLICT`，并断言账单只扣一次。
- 新增或修改 API route 时，必须补充/更新对应测试，至少断言：
  - `status`
  - `body.error.code`
  - `body.requestId` 与 `x-request-id`
  - 关键业务副作用（例如是否重复写库/扣费）

### 7. Wrong vs Correct

#### Wrong

```ts
export async function POST() {
  try {
    const result = await runBusiness()
    return NextResponse.json({ success: true, data: result })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }
}
```

#### Correct

```ts
export const POST = apiHandler(async (req) => {
  const body = await req.json()
  if (typeof body?.projectId !== 'string' || !body.projectId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await runBusiness()
  return NextResponse.json({ success: true, data: result })
})
```

---

## Common Mistakes

- 将“无错误状态”直接送入归一化函数，导致空输入被误判为 `INTERNAL_ERROR`。
- 捕获异常后只记录日志不抛出，造成调用方误判成功。
- API 路由绕过 `apiHandler`，导致响应结构和追踪字段不一致。

---

## Scenario: queued 任务卡死超时治理（watchdog）

### 1. Scope / Trigger
- Trigger：任务长时间停留在 `queued`，前端轮询无法收敛。
- Trigger：Redis/队列状态与 DB 脱节，导致任务永远不进入 `processing`。

### 2. Signatures

```ts
export async function sweepStaleQueuedTasks(params: {
  queuedThresholdMs: number
  limit?: number
}): Promise<Array<{
  id: string
  errorCode: string
  errorMessage: string
}>>
```

### 3. Contracts
- 超过 `queuedThresholdMs` 的 `queued` 任务必须标记 `failed`。
- 错误码统一为 `QUEUE_STUCK_TIMEOUT`（补偿失败时为 `BILLING_COMPENSATION_FAILED`）。
- 任务失败时清理 `dedupeKey`，避免后续提交被旧任务卡住。

### 4. Validation & Error Matrix

| 条件 | 状态迁移 | errorCode | 关键副作用 |
|---|---|---|---|
| queued 超时 + 回滚成功 | queued → failed | `QUEUE_STUCK_TIMEOUT` | `dedupeKey = null` |
| queued 超时 + 回滚失败 | queued → failed | `BILLING_COMPENSATION_FAILED` | 保留失败原因 |
| 未超时 | 保持 queued | 无 | 不更新任务 |

### 5. Good / Base / Bad Cases
- **Good**：前端不再硬编码 45s 排队超时，后端 watchdog 统一判死。
- **Base**：仅处理 `processing` 超时，`queued` 不处理（会形成盲区）。
- **Bad**：前端超时直接报错、后端不治理，导致误报和无限轮询并存。

### 6. Tests Required（含断言点）
- `tests/unit/task/reconcile-queued-timeout.test.ts`
  - 断言超时 queued 任务被标记 `failed`。
  - 断言 `errorCode === 'QUEUE_STUCK_TIMEOUT'`。
  - 断言 `dedupeKey` 被清空。
- `tests/unit/task/task-client-wait-timeout.test.ts`
  - 断言不传 `maxQueuedMs` 时不会触发 45s 假超时。

### 7. Wrong vs Correct

#### Wrong
```ts
// 前端 45 秒超时，后端不处理 queued 卡死
resolveTaskResponse(response, { maxQueuedMs: 45_000 })
```

#### Correct
```ts
// 前端仅轮询，后端 watchdog 负责 queued 判死
resolveTaskResponse(response, { intervalMs: 1500 })
// watchdog: sweepStaleQueuedTasks({ queuedThresholdMs: 600_000 })
```
