# P0/P1 采纳落地记录（2026-03-05）

## 背景

本记录用于沉淀本轮“上游 PR 结论在 fork 落地”的执行证据，确保多人协作时可复用、可追溯。

- 分级范围：P0 + P1
- 落地方式：仅采纳可验证且与当前架构兼容的改动；全部配套单元测试

## 本轮采纳项与证据

### 1) 任务提交计费防线修正（P0）

**问题**
- 计费 guard 依赖 `computedBillingInfo`，会在“外部已传入 billingInfo 但 computed 为空”的场景误判。

**落地改动**
- guard 改为基于 `preparedBillingInfo`（任务最终可用 billing 信息）判定。

**代码位置**
- `src/lib/task/submitter.ts:162`
- `src/lib/task/submitter.ts:164`

**测试证据**
- `tests/unit/task/submitter-billing-guard.test.ts`
  - 覆盖：
    - computed 为空但 external billingInfo 存在 -> 允许提交
    - billable 且无 billingInfo -> `INVALID_PARAMS`
    - 非 billable type -> 跳过 guard

---

### 2) AI 空响应错误标准化补齐（P1）

**问题**
- runtime 对 `LLM_EMPTY_RESPONSE` 标记未归一到 `EMPTY_RESPONSE`。

**落地改动**
- `inferEmptyResponse` 增加 `llm_empty_response` 关键词。

**代码位置**
- `src/lib/ai-runtime/errors.ts:13`
- `src/lib/ai-runtime/errors.ts:19`

**测试证据**
- `tests/unit/ai-runtime/errors.test.ts:5`
  - `LLM_EMPTY_RESPONSE` -> `EMPTY_RESPONSE` 且 `retryable=true`

---

### 3) 403 challenge/captcha 归类修正（P0）

**问题**
- challenge 类 403 被统一当作 `FORBIDDEN`，导致错误重试策略不合理。

**落地改动**
- 新增 challenge 判定：`cf-challenge` / `cloudflare` / `captcha` / `turnstile` 等关键词命中时归类 `EXTERNAL_ERROR`。
- 普通 403 仍保留 `FORBIDDEN`。

**代码位置**
- `src/lib/errors/normalize.ts:61`
- `src/lib/errors/normalize.ts:162`

**测试证据**
- `tests/unit/task/normalize-error.test.ts`
  - 覆盖 challenge-like 403 与普通 403 的分流行为

---

### 4) character-profile 分析模型回退统一（P1）

**问题**
- worker 直接依赖项目字段，回退策略与其他链路不一致。

**落地改动**
- `resolveProjectModel` 接入 `resolveAnalysisModel`，统一模型解析路径。
- 调用侧改为使用 helper 返回值，不再走非空断言路径。

**代码位置**
- `src/lib/workers/handlers/character-profile-helpers.ts`
- `src/lib/workers/handlers/character-profile.ts`

**测试证据**
- `tests/unit/worker/character-profile.test.ts`
  - mock 返回结构同步补齐 `userId`，并验证确认逻辑正常

---

### 5) ARK 默认超时调整（P0）

**问题**
- 默认超时窗口偏短，不利于跨境/拥塞网络场景。

**落地改动**
- 默认超时从 60s 调整为 300s。

**代码位置**
- `src/lib/ark-api.ts:16`

---

### 6) OpenAI 兼容链路 User-Agent 注入（P0）

**问题**
- 部分 OpenAI-compatible 客户端请求缺少统一 UA。

**落地改动**
- 统一注入：`defaultHeaders['User-Agent'] = 'waoowaoo/0.1'`。

**代码位置**
- `src/lib/generators/image/openai-compatible.ts:222`
- `src/lib/generators/video/openai-compatible.ts:246`
- `src/lib/llm/chat-completion.ts:186`
- `src/lib/llm/chat-completion.ts:314`
- `src/lib/llm/chat-stream.ts:215`
- `src/lib/llm/chat-stream.ts:646`
- `src/lib/llm/vision.ts:184`

**测试证据**
- `tests/unit/generators/openai-compatible-image.test.ts`
- `tests/unit/generators/openai-compatible-video.test.ts`
  - 通过构造参数断言验证 UA 注入

---

## 回归验证

- 单元测试：已执行并通过（80 files / 293 tests）。
- 新增测试文件：
  - `tests/unit/task/submitter-billing-guard.test.ts`
  - `tests/unit/ai-runtime/errors.test.ts`

## 风险与后续跟踪

1. **未纳入本轮的同类点位**
   - 仍有部分链路可继续做 model fallback / UA / error normalize 一致化（后续批次处理）。
2. **观测建议**
   - 关注 worker 错误分布中 `FORBIDDEN` vs `EXTERNAL_ERROR` 比例变化。
   - 关注 ARK 请求的超时率与平均耗时变化。
3. **回滚策略**
   - 若线上出现兼容性异常，按功能模块回滚（submitter / normalize / generator），保持最小影响面。

## 关联文档

- 持续流程：`docs/pr-triage/continuous-triage-playbook.md`
- AI runtime 缺口：`docs/ai-runtime/08-open-gaps.md`
