# Type Safety

> 前端与共享 TypeScript 代码必须“边界显式校验、域内强类型流转”。

---

## Overview

- 项目使用 TypeScript，**禁止 `any`**。
- 边界数据（API、DB JSON、用户输入）先以 `unknown` 接收，再通过类型守卫/断言函数收敛。
- 禁止用断言掩盖不确定性（例如 `as any`、`as unknown as T`）。
- 约定：数据契约失败必须抛出显式错误，不能静默返回伪数据。

---

## Type Organization

- `src/types/`：领域模型与跨模块共享类型。
- `src/lib/contracts/`：边界编解码与运行时契约（例如 `decode*Strict` / `encode*`）。
- 业务模块局部类型与实现同目录共置，避免“全局 types 垃圾场”。
- 类型命名必须体现语义，不允许 `Data` / `Info` 这类无边界泛名滥用。

---

## Validation

- 对外部 JSON 字符串，必须使用严格解码函数（例如 `decodeImageUrlsStrict`）。
- 校验失败必须抛出专用错误（例如 `ImageUrlsContractError`），交由上层统一归一化。
- 类型守卫必须验证具体结构，不允许只做“存在性判断”。

```ts
function assertStringArray(value: unknown, fieldName: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new ImageUrlsContractError(`${fieldName} must be a JSON array`)
  }
  const invalidIndex = value.findIndex((item) => typeof item !== 'string')
  if (invalidIndex !== -1) {
    throw new ImageUrlsContractError(`${fieldName}[${invalidIndex}] must be a string`)
  }
}
```

---

## Common Patterns

### Pattern: unknown 输入 + asserts 收敛

```ts
let parsed: unknown
parsed = JSON.parse(raw)
assertStringArray(parsed, 'imageUrls')
return parsed
```

### Pattern: 先校验再映射

```ts
export function isKnownErrorCode(code: unknown): code is UnifiedErrorCode {
  return typeof code === 'string' && code in ERROR_CATALOG
}
```

### Pattern: 合同函数必须有回归测试

- 示例：`src/lib/contracts/image-urls-contract.test.ts` 对非法 JSON、非数组、数组项类型错误均有具体断言。

---

## Forbidden Patterns

### Don't: `any` 或双重断言逃逸

```ts
// ❌ 禁止
const urls = JSON.parse(raw) as any
const model = payload as unknown as BillingPlan
```

### Don't: 未校验直接消费 JSON 结果

```ts
// ❌ 禁止
const urls: string[] = JSON.parse(raw)
```

### Don't: 静默吞掉契约错误并返回伪正常值

```ts
// ❌ 禁止
try {
  return decodeImageUrlsStrict(raw)
} catch {
  return []
}
```

### Correct

```ts
// ✅ 推荐
const urls = decodeImageUrlsStrict(raw)
```
