# VAT-132 — AC follow-up (2026-03-12, pass 2)

- Ticket: VAT-132
- Branch: `work/vat-manga-webtoon-lane-20260312`
- Purpose: tiếp tục khép AC benchmark + before/after evidence theo yêu cầu phase 2.

## New evidence added in this pass

Artifact folder:
- `docs/testing/artifacts/vat-132-vat-133-blocker-followup-2026-03-12/`

Files:
- `vitest-targeted.log` (PASS 23/23 targeted lane tests)
- `rg-benchmark-scan.txt` (scan benchmark/time-to-first-panel related traces)
- `rg-quick-action-gates.txt` (scan gate/render path liên quan manga lane controls)

## Current AC closure status

1. Benchmark `>= 30%` time-to-first-panel
   - **Status:** ❌ chưa đóng.
   - **Why:** chưa có harness/baseline pair đo trực tiếp `time-to-first-panel` cho 3 flow VAT-132 ở cùng điều kiện run.
   - **Evidence:** benchmark scan artifact không cho thấy bộ đo execution-level cho VAT-132 AC này.

2. Before/after screenshots đủ 3 flows
   - **Status:** ❌ chưa đóng.
   - **Why:** có artifacts lane-related nhưng chưa đủ bộ chuẩn hóa before/after cho đúng 3 flow VAT-132 trong cùng môi trường signed-in.

## Conclusion

- VAT-132 giữ **In Progress** (không overclaim Done).
- Tiến triển mới: bổ sung evidence scan + test pass để khóa rõ blocker kỹ thuật, tránh trạng thái mơ hồ.