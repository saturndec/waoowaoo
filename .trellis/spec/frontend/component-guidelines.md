# Frontend Component Guidelines

> 本项目前端组件以 **shadcn/ui + Tailwind CSS** 为主，禁止新增 Glass 组件体系。

---

## Overview

- 统一复用目录：`src/components/ui/*`。
- 统一样式函数：`src/lib/utils.ts` 的 `cn()`，禁止各文件重复实现 `cx()/mergeClassNames()`。
- 组件层不做隐式降级；出现非法状态时直接显示错误或抛出可观测异常。
- 禁止 `any`，外部输入先 `unknown` 再收敛。

---

## Scenario: 全站 UI 组件统一（Glass → shadcn）

### 1. Scope / Trigger
- Trigger：页面出现 `glass-*` 类、`GlassButton`/`GlassModalShell` 等旧组件。
- Trigger：新增页面/弹窗/表单需要一致视觉与可访问性交互。

### 2. Signatures

```ts
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
```

### 3. Contracts
- 所有可复用基础组件必须放入 `src/components/ui/`，业务组件只组合不重造轮子。
- 类名拼接必须使用 `cn(...)`，禁止局部 `function cx(...)`。
- 表单控件必须保留可访问性属性（`label htmlFor`、`disabled`、`focus-visible`）。

### 4. Validation & Error Matrix

| 场景 | 处理策略 | 必须断言 |
|---|---|---|
| props 缺失关键字段 | 组件显示可识别错误态或中止渲染 | 不得静默渲染伪内容 |
| 异步保存失败 | UI 显示 `error` 状态徽标/提示 | 用户可见错误文案 |
| 选择器无数据 | 显示空选项或提示，不抛浏览器异常 | 不得出现 uncontrolled warning |

### 5. Good / Base / Bad Cases
- **Good**：`Button asChild` + `Link`，避免嵌套交互元素。
- **Base**：沿用旧布局，但控件替换为 `Input/Button/Dialog`。
- **Bad**：新代码继续引入 `Glass*` primitives 或新增 `glass-*` 语义类。

### 6. Tests Required（含断言点）
- 新增/改造弹窗：断言 `open/close` 行为和按钮触发回调。
- 新增/改造表单：断言输入值、禁用态、错误态文案。
- 样式迁移改动：至少验证关键页面可渲染（无 runtime throw）。

### 7. Wrong vs Correct

#### Wrong
```tsx
function SaveButton({ loading }: { loading: boolean }) {
  return <button className="glass-btn-base glass-btn-primary">{loading ? '保存中' : '保存'}</button>
}
```

#### Correct
```tsx
import { Button } from '@/components/ui/button'

function SaveButton({ loading }: { loading: boolean }) {
  return <Button disabled={loading}>{loading ? '保存中' : '保存'}</Button>
}
```

---

## Common Mistakes

- 在页面组件里重复实现 `cx` 导致类名合并策略不一致。
- 继续使用 `glass-*` 作为新增样式来源，造成主题与视觉分裂。
- `Dialog` 仅替换外观但遗漏 `onOpenChange`，导致关闭行为失效。
