# VAT-67 Phase 0 - Smoke test + Telemetry baseline (Quick Manga)

Thời gian thực hiện: 2026-03-09 (GMT+7)
Phạm vi: hoàn tất lane còn lại Phase 0 cho Epic VAT-60 gồm VAT-67 / VAT-68 / VAT-69.

## 1) Jira context đã đọc trước khi thực thi
- [VAT-60](https://linktovn.atlassian.net/browse/VAT-60)
- [VAT-67](https://linktovn.atlassian.net/browse/VAT-67)
- [VAT-68](https://linktovn.atlassian.net/browse/VAT-68)
- [VAT-69](https://linktovn.atlassian.net/browse/VAT-69)
- Kickoff/update liên quan đã đối chiếu:
  - VAT-60 comment `13263`
  - VAT-64 comment `13271`, `13280`
  - VAT-65 comment `13272`, `13281`
  - VAT-66 comment `13273`, `13282`
  - VAT-61 comment `13264`, `13268`, `13274`

## 2) VAT-68 - Smoke matrix Quick Manga (UI/API/SSE/retry)

### 2.1 Test matrix
| Lane | Mục tiêu | Command | Kết quả |
|---|---|---|---|
| UI (Quick Manga options contract) | Verify directive/preset/layout/color wiring logic | `npx vitest run tests/unit/workspace/quick-manga.test.ts tests/unit/helpers/quick-manga-contract.test.ts` | PASS (7 tests) |
| API façade (Quick Manga route) | Verify route contract + task type mapping cho 2 stage | `npx vitest run tests/integration/api/contract/llm-observe-routes.test.ts` | PASS (49 tests), có coverage cho `/api/novel-promotion/[projectId]/quick-manga/route.ts` với `story-to-script` + `script-to-storyboard` |
| Orchestration retry | Verify retry behavior + quick manga prompt injection | `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts` | PASS (3 tests), retry tối đa 3 lần cho lỗi retryable; không retry lỗi non-retryable |
| SSE invalidation guard | Verify SSE invalidation path không regression | `npx vitest run tests/unit/optimistic/sse-invalidation.test.ts` | PASS (1 test) |
| Build regression | Verify compile/build toàn app | `npm run build` | PASS (Next build thành công, chỉ còn warning non-blocking của BullMQ dynamic dependency) |

### 2.2 Smoke run thực tế đã chạy
```bash
npx vitest run \
  tests/unit/helpers/quick-manga-contract.test.ts \
  tests/unit/workspace/quick-manga.test.ts \
  tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts \
  tests/integration/api/contract/llm-observe-routes.test.ts \
  tests/unit/optimistic/sse-invalidation.test.ts
```
Kết quả tổng: **5 files pass, 60 tests pass, 0 fail**.

## 3) VAT-69 - Telemetry/log baseline Quick Manga

### 3.1 Script baseline bổ sung
Đã thêm script:
- `scripts/quick-manga-telemetry-baseline.ts`

Mục tiêu script:
- Query baseline theo time window (`--hours`, default 72h) cho:
  - Quick Manga theo `dedupeKey` prefix `quick_manga:`
  - Fallback baseline core flow `story_to_script_run` / `script_to_storyboard_run`
  - Event distribution từ `task_events`
  - Top latest quick manga tasks

### 3.2 Command baseline đã chạy
```bash
DATABASE_URL='mysql://root:waoowaoo123@127.0.0.1:13306/waoowaoo' \
REDIS_HOST=127.0.0.1 REDIS_PORT=16379 \
NEXTAUTH_SECRET='local-dev-secret' CRON_SECRET='local-dev-cron' \
INTERNAL_TASK_TOKEN='local-dev-token' API_ENCRYPTION_KEY='local-dev-enc' \
LOG_LEVEL=INFO \
npx tsx scripts/quick-manga-telemetry-baseline.ts --hours=72
```

### 3.3 Baseline snapshot (72h)
- Quick Manga (`dedupeKey=quick_manga:*`):
  - total=0, completed=0, failed=0
  - => hiện **chưa có traffic Quick Manga thật** trong DB window 72h
- Fallback core flows:
  - `story_to_script_run`: completed=5, failed=7 (success 41.7%)
  - `script_to_storyboard_run`: completed=4, failed=2 (success 66.7%)
- Failed error mix gần nhất (tham chiếu từ output script):
  - `INVALID_PARAMS` chiếm đa số cho `story_to_script_run`
  - `INTERNAL_ERROR`, `TASK_LOCALE_REQUIRED` xuất hiện ở `script_to_storyboard_run`

### 3.4 Query/check bổ sung
```bash
DATABASE_URL='mysql://root:waoowaoo123@127.0.0.1:13306/waoowaoo' \
... LOG_LEVEL=INFO \
npx tsx scripts/task-error-stats.ts --minutes=720
```
Kết quả: failed_total=9 (12h), trong đó `INVALID_PARAMS` chiếm 77.8%.

## 4) Kết luận nghiệm thu Phase 0 lane VAT-67/68/69
- Smoke checklist đã chạy đủ lane yêu cầu (UI/API/SSE/retry + build).
- Telemetry baseline tối thiểu đã có script + snapshot số liệu DB.
- Kết quả hiện tại cho thấy **lane kỹ thuật hoàn tất**, nhưng **adoption Quick Manga runtime còn 0** (cần follow-up ở Phase 1 cho usage capture/go-live traffic).

## 5) Không làm
- Không deploy production.
- Không mở rộng scope sang mode mới ngoài novel-promotion.
