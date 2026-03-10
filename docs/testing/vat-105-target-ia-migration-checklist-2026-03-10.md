# VAT-105 — Chốt IA mục tiêu và migration checklist (Phase 3)

- Ticket: https://linktovn.atlassian.net/browse/VAT-105
- Parent story: https://linktovn.atlassian.net/browse/VAT-102
- Date: 2026-03-10
- Strategy: `code_light`
- Scope pass này: **chỉ VAT-105** (chốt target IA + checklist migration), không triển khai refactor UI/runtime/API.

## 1) Jira context read-first

- Key: `VAT-105`
- Summary: **[Sub-task] Chốt IA mục tiêu và tạo migration checklist**
- Scope expectation: đóng gói quyết định IA cuối cùng và checklist migration phục vụ implementation phase sau VAT-102.

## 2) Scope guard (strictly VAT-105)

Trong pass này chỉ làm:
1. Chốt phương án IA mục tiêu dựa trên VAT-104.
2. Định nghĩa migration checklist có thứ tự, acceptance signals, rollback rule.
3. Ghi artifact + evidence.

Không làm trong VAT-105:
- Không đổi route contract.
- Không đổi API `/api/novel-promotion/[projectId]/quick-manga*`.
- Không đổi hành vi runtime `quickManga=1`.
- Không refactor UI shell thực thi (để phase build tiếp theo).

## 3) IA mục tiêu đã chốt

**Target IA: Option B — Workspace use-case-first shell** (theo VAT-104).

### 3.1 Intent model (user-facing)
- `Write a Story (General journey)`
- `Create Manga (Manga journey)`

### 3.2 Compatibility model (technical continuity)
- Giữ `projectMode` bridge hiện tại.
- Giữ deep-link query `quickManga=1`.
- Giữ endpoint quick-manga hiện có.
- Giữ khả năng fallback về shell cũ qua feature flag.

Kết luận: dùng **semantic IA mới ở lớp entry shell**, nhưng **không phá contract kỹ thuật hiện hành**.

## 4) Migration checklist (ordered)

## M0 — Baseline lock & traceability
- [ ] Freeze baseline artifacts VAT-102/103/104.
- [ ] Link rõ dependency VAT-105 -> VAT-102/104 trong Jira comment.
- [ ] Chốt danh sách modules impacted (tham chiếu, chưa code):
  - `src/app/[locale]/workspace/page.tsx`
  - `src/lib/workspace/project-mode.ts`
  - `src/lib/workspace/quick-manga-entry.ts`
  - `src/lib/workspace/manga-discovery-analytics.ts`

Exit criteria M0:
- Decision Option B được ghi rõ trong artifact + Jira.

## M1 — IA shell rollout plan (implementation phase, not in this pass)
- [ ] Thiết kế entry shell theo use-case-first (General vs Manga).
- [ ] Bảo toàn đường vào cũ (bookmark/deep-link) không đổi URL.
- [ ] Ánh xạ intent mới -> `projectMode` cũ bằng adapter.

Exit criteria M1:
- User có thể chọn hành trình theo mục tiêu ngay tại workspace.
- Không có regression với create flow hiện tại.

## M2 — Telemetry & taxonomy migration
- [ ] Giữ event baseline hiện có (`workspace_manga_cta_*`, `workspace_manga_conversion`).
- [ ] Bổ sung event bước chọn hành trình IA (intent selection) bằng taxonomy mới.
- [ ] Mapping dashboard cũ/mới để tránh mất continuity dữ liệu.

Exit criteria M2:
- Đo được funnel “intent select -> create -> quick manga entry”.
- Không mất chuỗi số liệu so với baseline.

## M3 — Compatibility regression gate
- [ ] Regression case cho `quickManga=1` parser và entry URL mapping.
- [ ] Regression case cho API quick-manga/history không đổi contract.
- [ ] Smoke cho create story vs create manga từ workspace.

Exit criteria M3:
- Pass regression checklist trước rollout.

## M4 — Feature-flag rollout + rollback
- [ ] Rollout sau flag ở entry shell.
- [ ] Theo dõi chỉ số discoverability/churn trong ít nhất 1 chu kỳ release.
- [ ] Rollback criteria rõ ràng:
  - drop conversion bất thường,
  - tăng wrong-path correction,
  - lỗi navigation/regression vượt ngưỡng.

Rollback action:
- Tắt flag IA shell mới để quay về shell Phase 1 ngay; không đụng API/runtime contract.

## 5) Definition of Done for VAT-105 (artifact-level)

- [x] Chốt target IA Option B rõ ràng.
- [x] Có checklist migration theo pha (M0..M4) + exit criteria.
- [x] Có rule continuity/rollback rõ.
- [x] Không mở rộng ngoài scope code_light.

## 6) Evidence

- Artifact: `docs/testing/vat-105-target-ia-migration-checklist-2026-03-10.md`
- Commit: _(to be attached after commit)_
- Jira comment: _(to be attached after posting)_
- Jira status transition: _(to be attached after transition)_
