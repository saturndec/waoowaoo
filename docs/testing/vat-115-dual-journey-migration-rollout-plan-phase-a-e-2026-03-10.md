# VAT-115 — [Dual Journey] Migration & rollout plan theo Phase A→E + risk/rollback matrix

- Ticket: https://linktovn.atlassian.net/browse/VAT-115
- Parent Epic (SoT): https://linktovn.atlassian.net/browse/VAT-110
- Date: 2026-03-10
- Strategy: `code_light`
- Scope: lập kế hoạch migration/rollout theo Phase A→E, định nghĩa gate/KPI/rollback matrix. Không thay đổi runtime/API/UI trong pass này.

---

## 1) Jira context read-first (before execution)

- Issue key: `VAT-115`
- Summary: `[Dual Journey] Migration & rollout plan theo Phase A→E + risk/rollback matrix`
- Type: `Story`
- Parent: `VAT-110`
- Start status: `To Do`
- Labels: `dual-journey`, `manga-webtoon`, `vat-110-reset`
- Description nhấn mạnh thứ tự bắt buộc: Phase A Contract freeze → B UX split → C adapter rollout → D telemetry gate → E optional runtime separation.

---

## 2) Scope guard (strictly VAT-115)

In scope:
1. Chốt migration plan theo đúng thứ tự Phase A→E từ final analysis.
2. Định nghĩa release gate + KPI gate + rollback trigger theo phase.
3. Tổng hợp risk matrix và rollback runbook nhanh (feature-flag-first).

Out of scope:
- Không implement runtime/API/schema/UI.
- Không thay đổi behavior production.
- Không deprecate event/API trong pass planning này.

---

## 3) SoT alignment

Nguồn SoT dùng để lập kế hoạch:
- `docs/ux/vat-dual-journey-separation-final-analysis-2026-03-10.md`

Các nguyên tắc được kế thừa:
1. Product Intent là SoT (`journeyType`, `entryIntent`).
2. Compatibility adapter giữ continuity với legacy runtime (`projectMode`, `quickManga`).
3. Analytics dual-journey bắt buộc dimension chuẩn (`journeyType`, `entryIntent`, `templateId`, `locale`, `projectId`).
4. Runtime separation là optional, chỉ mở sau khi pass telemetry/KPI gate.

---

## 4) Migration & rollout plan theo Phase A→E

## Phase A — Contract & taxonomy freeze

Mục tiêu:
- Đóng băng contract intent và analytics taxonomy để chặn scope drift.

Deliverables:
- Contract freeze record cho `journeyType/entryIntent`.
- Event taxonomy freeze record + naming convention.

Gate để qua Phase B:
- PM + Eng sign-off trên contract/taxonomy.
- Không còn mismatch mapping giữa journey intent và create flow.

Rollback trigger:
- Phát hiện xung đột semantics giữa 2 lane chưa giải quyết được.

Rollback action:
- Dừng rollout phase tiếp theo; giữ trạng thái current shell; không thay đổi runtime.

## Phase B — UX split (feature flag)

Mục tiêu:
- Tách rõ 2 lane ở create/workspace UI (Video/Film vs Manga/Webtoon) dưới feature flag.

Deliverables:
- UI flow split có parity điều hướng.
- Checklist deep-link continuity cho entry cũ.

Gate để qua Phase C:
- UX smoke pass cho 2 lane.
- Không có blocker P1/P2 ở luồng create chính.

Rollback trigger:
- Conversion lane mới giảm mạnh hoặc lỗi luồng create tăng bất thường.

Rollback action:
- Tắt feature flag split UI, quay về shell cũ; giữ data/adapter không đổi.

## Phase C — Compatibility adapter rollout

Mục tiêu:
- Chuyển FE sang gửi field intent mới; BE adapter map sang legacy fields để continuity.

Deliverables:
- Adapter contract checklist pass.
- Xác nhận quickManga/history continuity còn hoạt động.

Gate để qua Phase D:
- 0 breakage ở backward-compatible routes critical.
- Regression checklist pass cho create/history.

Rollback trigger:
- Contract mismatch gây fail create/history hoặc deep-link cũ.

Rollback action:
- Revert đường gửi field mới ở UI/adapter routing (không chạm DB destructive); giữ API legacy path.

## Phase D — Telemetry gate

Mục tiêu:
- Xác nhận dual-journey observability ổn định trước mọi quyết định deprecate/separate sâu.

Deliverables:
- UAT plan + telemetry assertions được thực thi theo chu kỳ release.
- Dashboard funnel so sánh 2 lane.

KPI gate tối thiểu để qua Phase E:
- Đủ dữ liệu tối thiểu 2 release cycles liên tiếp.
- Event completeness cho 5 dimension bắt buộc đạt 100% trên events trọng yếu.
- Không có gap nghiêm trọng giữa old/new taxonomy mapping.

Rollback trigger:
- Mất continuity telemetry hoặc quality dữ liệu không đạt gate.

Rollback action:
- Giữ dual-write + giữ event cũ; tạm dừng deprecate.

## Phase E — Optional runtime separation (decision gate)

Mục tiêu:
- Chỉ quyết định tách runtime khi đã đạt KPI + stability, không làm sớm theo cảm tính.

Deliverables:
- Decision package (Go/No-Go) có đầy đủ số liệu và risk acceptance.
- Rollout plan incremental nếu Go, hoặc hold plan nếu No-Go.

Go criteria:
- KPI Phase D pass ổn định.
- Không có blocker compatibility còn mở.
- Có rollback drill evidence < 30 phút.

No-Go handling:
- Duy trì mô hình adapter + dual journey ở layer intent/UX/analytics, chưa tách runtime sâu.

---

## 5) Risk / rollback matrix

| Risk | Phase dễ phát sinh | Signal | Trigger | Rollback | Owner |
|---|---|---|---|---|---|
| Intent mới lệch runtime cũ | B/C | Tăng fail create, mismatch mode | lỗi create tăng đột biến sau rollout | tắt flag UI split + giữ legacy mapping | Eng |
| Đứt analytics continuity | C/D | event thiếu dimension, funnel lệch | data quality gate fail | giữ dual-write, dừng deprecate event cũ | Data/Eng |
| Gãy deep-link/history quickManga | C | tỷ lệ fail entry quickManga tăng | regression critical fail | route về parser cũ, giữ adapter compatibility | Eng |
| Scope drift (đụng runtime quá sớm) | D/E | thay đổi ngoài plan đã freeze | review phát hiện vi phạm non-goals | stop rollout, quay về phase gate trước | PM+Eng |
| Rollout gây nhiễu conversion | B/D | conversion 1 lane giảm mạnh | vượt ngưỡng cảnh báo release gate | disable lane split bằng flag | PM |

---

## 6) Release governance checklist (Phase E handoff)

- [x] Có thứ tự phase A→E rõ ràng.
- [x] Mỗi phase có deliverables + gate + trigger + rollback.
- [x] Chỉ rõ điều kiện mới được mở runtime separation.
- [x] Giữ nguyên nguyên tắc non-destructive rollout trong đợt đầu.
- [ ] Jira comment evidence (sẽ cập nhật sau khi post).
- [ ] Jira status transition evidence (sẽ cập nhật sau khi transition).

---

## 7) Evidence pointers

- Artifact: `docs/testing/vat-115-dual-journey-migration-rollout-plan-phase-a-e-2026-03-10.md`
- Story: https://linktovn.atlassian.net/browse/VAT-115
- SoT analysis: `docs/ux/vat-dual-journey-separation-final-analysis-2026-03-10.md`
