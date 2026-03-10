# VAT-60 + VAT-85 — KEEP / ROLLBACK / REWRITE Matrix (post-upstream sync)

- Date: 2026-03-10
- Scope: Analysis-only sau khi sync source mới nhất, **không implement spec mới**.
- Related Jira:
  - VAT-60: https://linktovn.atlassian.net/browse/VAT-60
  - VAT-85: https://linktovn.atlassian.net/browse/VAT-85

---

## 0) Sync baseline used for this analysis

- Repo: `/Users/mrcagents/.openclaw/workspace/projects/VAT`
- Remotes:
  - `origin`: `git@github.com:cong91/waoowaoo.git`
  - `upstream`: `git@github.com:saturndec/waoowaoo.git`
- Upstream fetched: `upstream/main`
- Working branch analyzed: `main`
- Rebase strategy used: rebase `main` onto `upstream/main`.
  - First attempt produced massive add/add conflicts from divergent histories.
  - Rebase was aborted and re-run with `-X theirs` to preserve current branch intent on replay while landing on latest upstream base.
- Post-sync HEAD: `ff42adb6c68825dbe5669f38e7ede87ea7b8a3d0`

---

## 1) Scope surfaces reviewed (VAT-60 + VAT-85 focus)

### Journey / create / onboarding / IA
- `src/app/[locale]/workspace/page.tsx`
- `src/lib/workspace/project-mode.ts`
- `src/lib/workspace/quick-manga-entry.ts`
- `src/lib/workspace/onboarding-templates.ts`
- `docs/testing/vat-102-phase3-ia-discovery-2026-03-10.md`
- `docs/testing/vat-103-ia-pain-points-discoverability-2026-03-10.md`
- `docs/testing/vat-104-ia-options-tradeoff-2026-03-10.md`
- `docs/ux/vat-manga-vs-film-video-journey-spec-2026-03-10.md`

### Quick-manga bridge / API continuity
- `src/app/api/novel-promotion/[projectId]/quick-manga/route.ts`
- `src/app/api/novel-promotion/[projectId]/quick-manga/history/route.ts`
- `tests/contracts/route-catalog.ts`
- `tests/contracts/route-behavior-matrix.ts`

### Glossary / localization
- `docs/localization/vat-98-manga-glossary-2026-03-10.md`
- `docs/localization/vat-99-manga-terminology-glossary-vi-en-zh-2026-03-10.md`
- `docs/testing/vat-101-linguistic-qa-2026-03-10.md`
- `messages/en/workspace.json`
- `messages/en/novel-promotion.json`

### Analytics / adoption-churn evidence
- `src/lib/workspace/manga-discovery-analytics.ts`
- `src/app/api/projects/route.ts`
- `scripts/quick-manga-phase-metrics.ts`
- `docs/testing/vat-83-phase3-go-no-go-framework-2026-03-09.md`
- `docs/testing/vat-84-phase3-adoption-churn-metrics-2026-03-09.md`
- `docs/testing/vat-60-closure-readiness-2026-03-09.md`

---

## 2) Matrix phân loại

## A. KEEP

| File / Module / Area | Lý do KEEP | Rủi ro nếu giữ | Đề xuất hành động kế tiếp |
|---|---|---|---|
| `src/app/api/novel-promotion/[projectId]/quick-manga/route.ts` + `/quick-manga/history/route.ts` | Contract quick-manga đã ổn định, backward-compatible, được nêu rõ là bridge quan trọng cho VAT-60/85 continuity. | Nợ kỹ thuật semantic naming còn tồn tại (quick-manga nằm trong novel-promotion namespace). | Giữ nguyên runtime/API trong short-term; chỉ annotate deprecation roadmap ở phase migration riêng (không đổi contract ngay). |
| `src/lib/workspace/quick-manga-entry.ts` (`quickManga=1` parser) | Là compatibility hinge cho deep-link cũ và create flow manga entry. | Query flag mang implementation detail, có thể gây khó hiểu nếu không có layer journey rõ hơn. | Giữ parser hiện tại; bổ sung mapping docs giữa query bridge và journey semantics (analysis/task riêng). |
| `src/lib/workspace/onboarding-templates.ts` | Tách SoT template theo mode story/manga, giảm hardcode tại UI. | Drift content nếu copy key/message không đồng bộ giữa locale. | Giữ cấu trúc SoT; bổ sung periodic i18n key validation vào regression checklist. |
| `messages/*/workspace.json` + `messages/*/novel-promotion.json` (Manga copy chuẩn hóa) | VAT-98/99/101 đã chuẩn hóa glossary và QA linguistic rõ ràng. | Có thể phát sinh trộn thuật ngữ khi thêm feature mới mà không follow glossary baseline. | Giữ toàn bộ baseline hiện có; enforce glossary review gate cho PR liên quan Manga copy. |
| `scripts/quick-manga-phase-metrics.ts` + docs VAT-83/84 | Cung cấp gate Go/No-Go theo adoption/churn, phù hợp chủ đích VAT-60 phase 3. | Dữ liệu hiện tại sample thấp => dễ diễn giải sai nếu bỏ qua “insufficient sample”. | Giữ script và framework; chạy định kỳ + gắn note bắt buộc “sample sufficiency”. |
| `src/app/api/projects/route.ts` (emit `workspace_manga_conversion` khi `projectMode=manga`) | Event conversion có điều kiện rõ và ăn khớp baseline discovery funnel. | Taxonomy còn thiên Manga, chưa đối xứng Film/Video journey. | Giữ event hiện tại để continuity; bổ sung event mới dạng additive khi sẵn sàng taxonomy dual-journey. |

## B. ROLLBACK

| File / Module / Area | Lý do ROLLBACK | Rủi ro nếu rollback | Đề xuất hành động kế tiếp |
|---|---|---|---|
| **Không đề xuất rollback code runtime nào** trong pass này | Các thành phần trọng yếu (quick-manga bridge, create mode, glossary, analytics baseline) đều đang là nền continuity cho VAT-60/VAT-85; rollback sẽ phá evidence chain và regression baseline. | Rollback sai bề mặt có thể làm gãy deep-link `quickManga=1`, mất continuity event, và invalidate artefacts QA trước đó. | Giữ nguyên runtime; chỉ rollback khi có sự cố production-level và có rollback trigger rõ (theo VAT-83 framework), không làm trong pass analysis này. |
| `docs/ux/vat-manga-vs-film-video-journey-spec-2026-03-10.md` (nếu bị dùng như implementation mandate ngay) | Tài liệu này là spec/định hướng; chưa phải quyết định triển khai đã approved. “Rollback” ở đây là rollback kỳ vọng triển khai ngay lập tức, không phải xoá file. | Nếu diễn giải nhầm thành committed roadmap bắt buộc, đội có thể mở lane implementation sớm và phá guardrail “no new spec implementation”. | Giữ tài liệu ở trạng thái proposal; thêm nhãn “analysis input only / pending product decision” khi dùng làm planning. |

## C. REWRITE

| File / Module / Area | Lý do REWRITE | Rủi ro nếu không rewrite | Đề xuất hành động kế tiếp |
|---|---|---|---|
| `src/lib/workspace/manga-discovery-analytics.ts` | Event typing hiện manga-centric (`workspace_manga_*`), chưa phản ánh dual-journey taxonomy (manga vs film_video). | Khó đo so sánh hành trình 2 lane một cách chuẩn; data model bị lệch theo 1 phía. | Rewrite theo hướng additive: mở rộng schema sang `journeyType`, `entryIntent`, giữ backward events song song trong ít nhất 1 release. |
| `src/app/[locale]/workspace/page.tsx` (lớp IA shell) | IA hiện đã có story/manga mode + onboarding template, nhưng journey shell chưa explicit Film/Video vs Manga ở cấp đầu vào. | Discoverability cải thiện nhưng vẫn mơ hồ intent top-level; khó giảm cognitive load cho user mới. | Rewrite IA shell ở UI layer (không đổi runtime/API): tách rõ journey card semantics, giữ route + compatibility hiện tại. |
| `src/lib/workspace/project-mode.ts` | Mapping `story|manga` đang đủ dùng, nhưng model chưa biểu diễn rõ journey abstraction (`film_video` vs `manga`) như spec analysis đề xuất. | Về dài hạn dễ lẫn giữa “mode kỹ thuật” và “journey sản phẩm”. | Rewrite type/model theo 2 lớp: `journeyType` (product semantics) và `projectMode` (runtime compatibility), có mapper rõ ràng. |
| Docs IA chain (`vat-102/103/104` + `docs/ux/...journey-spec...`) | Nội dung đang phân tán qua nhiều artefacts, khó thành 1 SoT quyết định implementation. | Team có thể hiểu lệch phase, mở implementation không đồng bộ. | Rewrite thành 1 decision record hợp nhất (single SoT): target state, non-goals, migration order, analytics compatibility matrix. |

---

## 3) Tóm tắt điều hành

- **KEEP:** giữ toàn bộ nền continuity hiện tại của VAT-60 + VAT-85 (quick-manga API bridge, parser `quickManga=1`, onboarding templates theo mode, glossary/localization baseline, metrics framework).
- **ROLLBACK:** không rollback runtime trong pass này; chỉ rollback kỳ vọng “triển khai spec ngay” để tránh vượt scope.
- **REWRITE:** tập trung rewrite ở lớp semantic/model/analytics taxonomy và IA shell clarity — làm theo hướng additive, không phá compatibility.

---

## 4) Guardrails cho bước tiếp theo (không triển khai trong pass này)

1. Chốt 1 decision doc duy nhất cho dual-journey semantics + migration order.
2. Tách rõ `journeyType` vs `projectMode` ở tầng model trước khi đổi UI sâu.
3. Analytics migration phải dual-write (old + new events) theo window quan sát tối thiểu 1 release.
4. Không động contract `/quick-manga` và deep-link `quickManga=1` cho tới khi có compatibility gate pass.
