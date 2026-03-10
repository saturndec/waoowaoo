# VAT-105 — Chốt IA mục tiêu và migration checklist

- Ticket: https://linktovn.atlassian.net/browse/VAT-105
- Parent story: https://linktovn.atlassian.net/browse/VAT-102
- Date: 2026-03-10
- Scope pass này: **chỉ VAT-105** (chốt IA target + checklist migration), không triển khai runtime/API/UI.

## 1) Jira context đã đọc (read-first)

- VAT-105 summary: **[Sub-task] Chốt IA mục tiêu và tạo migration checklist**.
- Status lúc bắt đầu: **To Do**.
- Parent VAT-102 hiện trạng: **Done**.
- Input kế thừa:
  - `docs/testing/vat-103-ia-pain-points-discoverability-2026-03-10.md`
  - `docs/testing/vat-104-ia-options-tradeoff-2026-03-10.md`

## 2) IA mục tiêu được chốt

## Target IA: **Option B — Workspace use-case-first shell**

Workspace là điểm chọn hành trình theo mục tiêu người dùng:
- **Write a Story (General)**
- **Create Manga (Manga)**

Đồng thời giữ continuity kỹ thuật ở lớp dưới:
- giữ bridge `projectMode`
- giữ deep-link `?stage=script&quickManga=1`
- giữ quick-manga APIs hiện có

### Vì sao chốt Option B
1. Giải quyết trực tiếp pain point discoverability ở top-level IA.
2. Không phá các compatibility contract đang chạy thực tế.
3. Cho phép rollout theo feature flag và rollback nhanh ở UI shell.
4. Đúng scope VAT-105 (discovery/checklist), tránh over-scope runtime refactor.

## 3) Migration checklist (implementation-ready)

## A. Intent & contract mapping
- [ ] Định nghĩa rõ mapping intent mới:
  - `general` -> technical lane hiện tại
  - `manga` -> lane có `quickManga=1`
- [ ] Chốt adapter contract để UI semantics mới không làm đổi API contract cũ.
- [ ] Document hoá mapping trong module workspace intent (không implicit fallback).

## B. Routing/query compatibility
- [ ] Giữ tương thích URL vào project:
  - `?stage=script&quickManga=1` phải còn hiệu lực.
- [ ] Backward compatibility cho bookmark/deep-link cũ.
- [ ] Không đổi endpoint:
  - `/api/novel-promotion/[projectId]/quick-manga`
  - `/api/novel-promotion/[projectId]/quick-manga/history`

## C. IA telemetry taxonomy
- [ ] Bổ sung event cho bước chọn hành trình IA (entry-level intent selection).
- [ ] Không xoá baseline events đang dùng:
  - `workspace_manga_cta_view`
  - `workspace_manga_cta_click`
  - `workspace_manga_conversion`
- [ ] Có mapping table old/new event để đảm bảo continuity dashboard.

## D. Regression checklist
- [ ] Route entry workspace -> create -> project open (general lane) pass.
- [ ] Route entry workspace -> manga -> script stage (`quickManga=1`) pass.
- [ ] Quick manga generation/history APIs không regression.
- [ ] Analytics event phát đúng ở cả đường cũ và đường IA mới.

## E. Feature flag rollout/rollback
- [ ] Gate IA shell mới bằng feature flag độc lập.
- [ ] Rollout theo cohort nhỏ trước (internal -> partial -> full).
- [ ] Rollback criteria rõ ràng:
  - discoverability metrics giảm mạnh,
  - lỗi route/query compatibility,
  - conversion drop bất thường.
- [ ] Rollback không đụng runtime/API, chỉ tắt IA shell mới.

## 4) Out-of-scope của VAT-105

- Không sửa runtime business logic.
- Không đổi API contract quick-manga.
- Không rename/tách mode hệ thống ở pass này.
- Không deploy production.

## 5) Kết luận VAT-105

- **IA target đã chốt:** Option B (use-case-first shell tại Workspace).
- **Migration checklist đã hoàn tất:** gồm 5 nhóm A-E, đủ làm input cho phase implementation.
- Pass này giữ đúng chiến lược **code_light**: chỉ tạo artifact thiết kế/migration, không thay đổi runtime.

## 6) Evidence

- Artifact: `docs/testing/vat-105-ia-target-migration-checklist-2026-03-10.md`
- Jira evidence (comment + transition): cập nhật bởi phase executor sau khi commit.
