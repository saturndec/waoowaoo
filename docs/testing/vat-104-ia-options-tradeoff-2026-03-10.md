# VAT-104 — Đề xuất 2-3 phương án IA use-case-first + đánh giá trade-off

- Ticket: https://linktovn.atlassian.net/browse/VAT-104
- Parent story: https://linktovn.atlassian.net/browse/VAT-102
- Date: 2026-03-10
- Scope pass này: **chỉ VAT-104** (đề xuất phương án + trade-off), không triển khai UI/runtime/API.

## 1) Jira context đã đọc trước khi đề xuất

- VAT-104 summary: **[Sub-task] Đề xuất 2-3 phương án IA use-case-first + đánh giá trade-off**.
- VAT-104 status lúc bắt đầu: **To Do**.
- Parent VAT-102 đã chốt mục tiêu: IA theo hướng use-case-first, có impact map và migration plan không gãy flow.
- Baseline liên quan đã có:
  - `docs/testing/vat-102-phase3-ia-discovery-2026-03-10.md`
  - `docs/testing/vat-103-ia-pain-points-discoverability-2026-03-10.md`

## 2) Tiêu chí đánh giá phương án

1. **Độ rõ intent user (discoverability)**: user mới có hiểu ngay đường đi “General vs Manga” không?
2. **Rủi ro continuity**: có làm gãy flow hiện tại (`quickManga=1`, API quick-manga) không?
3. **Effort/complexity**: có vượt scope Phase 3 discovery không?
4. **Khả năng rollout an toàn**: có thể feature-flag + rollback nhanh không?
5. **Khả năng đo lường**: có gắn telemetry cho bước chọn hành trình IA không?

## 3) Các phương án IA use-case-first

## Option A — Overlay hướng dẫn trên IA hiện tại (Guide-first, structure giữ nguyên)

### Mô tả
- Giữ nguyên cấu trúc entry hiện tại (card + modal + query bridge).
- Thêm helper copy/tooltips/onboarding ngắn để giải thích “General vs Manga”.

### Ưu điểm
- Effort thấp, nhanh ship.
- Rủi ro regression thấp nhất vì không đổi cấu trúc điều hướng.

### Nhược điểm
- Chỉ xử lý phần “diễn giải”, chưa xử lý gốc rễ IA.
- User vẫn đi qua nhiều điểm chạm kỹ thuật trước khi vào đúng hành trình.

### Khi nào phù hợp
- Cần hotfix nhận diện nhanh trong 1 sprint ngắn và chưa sẵn sàng đổi IA shell.

---

## Option B — Workspace use-case-first shell (Recommended)

### Mô tả
- Workspace là điểm chọn hành trình theo mục tiêu:
  - **Write a Story (General)**
  - **Create Manga (Manga)**
- Giữ compatibility kỹ thuật bên dưới:
  - vẫn dùng `projectMode` bridge,
  - vẫn giữ deep-link `quickManga=1`,
  - vẫn giữ API quick-manga hiện tại.

### Ưu điểm
- Giải quyết trực tiếp pain point discoverability ở lớp IA top-level.
- Cân bằng tốt giữa UX rõ ràng và rủi ro kỹ thuật thấp.
- Có thể rollout theo feature flag, rollback đơn giản ở lớp shell.

### Nhược điểm
- Cần thiết kế taxonomy analytics mới cho bước chọn hành trình.
- Cần adapter intent semantics để tránh lệch giữa UI term và technical lane.

### Khi nào phù hợp
- Mục tiêu chính là chuyển sang use-case-first nhưng vẫn cần bảo toàn continuity release.

---

## Option C — Tách route/mode độc lập cho Manga ngay (Hard split)

### Mô tả
- Tách hẳn một IA lane/route riêng cho Manga ngay trong phase này.
- Giảm phụ thuộc vào `novel-promotion` naming ở top-level.

### Ưu điểm
- Mô hình IA sạch nhất, ngữ nghĩa rõ nhất.
- Giảm debt “mixed nomenclature” về dài hạn.

### Nhược điểm
- Rủi ro regression cao nhất.
- Vượt scope VAT-104/VAT-102 discovery (đụng runtime contract, migration nặng).
- Chi phí test/rollout tăng đáng kể.

### Khi nào phù hợp
- Chỉ nên làm khi đã có phase implementation riêng + regression budget đầy đủ.

## 4) Bảng trade-off tổng hợp

| Tiêu chí | Option A | Option B (Recommended) | Option C |
|---|---|---|---|
| Rõ intent user | Trung bình | Cao | Rất cao |
| Rủi ro continuity | Rất thấp | Thấp | Cao |
| Effort triển khai | Thấp | Trung bình | Cao |
| Phù hợp scope VAT-104 | Cao | Cao | Thấp |
| Rollout/rollback an toàn | Cao | Cao | Trung bình |
| Giá trị dài hạn IA | Thấp | Cao | Rất cao |

## 5) Kết luận cho VAT-104

**Chọn Option B** làm hướng target IA cho pha build tiếp theo.

Lý do chốt:
1. Đạt đúng yêu cầu use-case-first của VAT-102/VAT-104.
2. Không phá continuity của flow hiện tại (`quickManga=1`, quick-manga APIs).
3. Có đường rollout/rollback rõ bằng feature flag ở UI shell.
4. Tránh over-scope so với một sub-task discovery.

## 6) Input handoff cho sub-task kế tiếp (tham chiếu VAT-105)

- Mục tiêu target IA: Option B.
- Cần checklist migration gồm:
  1. mapping intent mới ↔ contract cũ,
  2. event taxonomy cho bước chọn hành trình,
  3. regression checklist cho route/query compatibility,
  4. feature-flag rollout + rollback criteria.

## 7) Evidence

- Artifact: `docs/testing/vat-104-ia-options-tradeoff-2026-03-10.md`
- Không có thay đổi runtime/API trong pass này (đúng scope code_light/discovery).
