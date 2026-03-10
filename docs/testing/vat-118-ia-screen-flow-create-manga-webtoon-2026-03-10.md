# VAT-118 — [Manga/Webtoon] IA & screen-flow chi tiết cho Create Manga/Webtoon (entry/create/onboarding)

- Ticket: https://linktovn.atlassian.net/browse/VAT-118
- Parent story: https://linktovn.atlassian.net/browse/VAT-114
- Date: 2026-03-10
- Strategy: `code_light` (doc-first, không đổi runtime/API/UI code trong pass này)
- Scope: thiết kế IA + screen-flow chi tiết cho journey **Create Manga/Webtoon** ở 3 lớp:
  1) entry,
  2) create,
  3) onboarding.

---

## 1) Jira context read-first (đã đọc trước khi thực hiện)

- Issue key: `VAT-118`
- Summary: `[Manga/Webtoon] IA & screen-flow chi tiết cho Create Manga/Webtoon (entry/create/onboarding)`
- Type: `Sub-task`
- Parent: `VAT-114`
- Start status: `To Do`
- Labels: `dual-journey`, `manga-webtoon`, `vat-110-reset`

Context parent `VAT-114` xác nhận định hướng:
- tách semantics product journey Manga/Webtoon khỏi framing quickManga-centric cũ,
- vẫn reuse runtime capability hợp lệ trong phase chuyển tiếp.

---

## 2) Input references (SoT dùng để thiết kế)

1. `docs/ux/vat-dual-journey-separation-final-analysis-2026-03-10.md`
2. `docs/ux/vat-manga-vs-film-video-journey-spec-2026-03-10.md`
3. `docs/testing/vat-117-spec-mapping-matrix-2026-03-10.md`
4. Current implementation surfaces (để map transition không gãy):
   - `src/app/[locale]/workspace/page.tsx`
   - `src/lib/workspace/project-mode.ts`
   - `src/lib/workspace/onboarding-templates.ts`
   - `src/lib/workspace/quick-manga-entry.ts`

---

## 3) Scope guard (strict VAT-118)

Pass VAT-118 này chỉ tạo **IA + screen-flow chi tiết** ở mức implement-ready.

Không làm trong pass này:
- Không refactor component runtime.
- Không đổi API contract.
- Không thay telemetry implementation trong code.
- Không deploy.

---

## 4) IA model cho Create Manga/Webtoon (target)

## 4.1 Information architecture (Manga/Webtoon branch)

```text
Workspace Entry
  -> Choose Journey (Manga/Webtoon | Film/Video)
      -> (if Manga/Webtoon) Create Project (journey-aware)
          -> Manga/Webtoon Onboarding
              -> Template select
              -> Input source select
              -> Generation readiness review
                  -> Enter workspace runtime (script stage)
```

## 4.2 Intent contract (UI semantic layer)

Tại lớp UI/create payload, intent tối thiểu cần hiện diện:
- `journeyType: "manga_webtoon" | "film_video"`
- `entryIntent: "create_manga_webtoon" | "create_film_video"`
- `templateId` (nullable ở bước chưa chọn template)
- `sourceType` (ví dụ: `blank` | `story_text` | `import_script`)

Lưu ý compatibility:
- `quickManga=1` vẫn là bridge compatibility ở phase chuyển tiếp,
- nhưng **không** là nguồn semantic chính cho intent ở lớp journey.

---

## 5) Screen-flow chi tiết (entry/create/onboarding)

## S0 — Workspace Entry (Journey chooser)

**Mục tiêu:** user nhìn thấy rõ ngay 2 đường sản phẩm ngang hàng.

### UI blocks
1. Primary journey cards:
   - `Create Manga/Webtoon`
   - `Create Video/Film`
2. Supporting copy ngắn theo outcome của từng journey.
3. Optional “continue last project” nằm tách dưới, không lấn át journey cards.

### Actions
- Click card Manga/Webtoon -> sang `S1` với `journeyType=manga_webtoon`.
- Click card Film/Video -> rẽ sang lane khác (ngoài scope chi tiết VAT-118).

### Analytics (logical)
- `workspace_journey_impression`
- `workspace_journey_selected`

Required fields:
`journeyType`, `entryIntent`, `locale`, `sourceScreen="workspace_entry"`.

---

## S1 — Create Project (journey-aware create)

**Mục tiêu:** tạo project trong đúng ngữ cảnh Manga/Webtoon, không ép user hiểu implementation detail.

### UI blocks
1. Header: xác nhận journey hiện tại (Manga/Webtoon).
2. Project name input.
3. Optional quick options:
   - style tone,
   - output orientation preference (webtoon vertical / manga page-like),
   - language seed.
4. CTA `Continue to onboarding`.

### Validation
- `projectName` required (non-empty).
- journey lock: không cho silently switch sang lane khác trong form này.

### Output payload (logical)
- `journeyType="manga_webtoon"`
- `entryIntent="create_manga_webtoon"`
- `projectName`
- optional quick options.

### Transition
- success create -> `S2` (Onboarding step 1)
- fail -> inline error + giữ state để retry.

---

## S2 — Onboarding step 1: Template selection

**Mục tiêu:** giúp user bắt đầu nhanh bằng template theo đúng mục tiêu Manga/Webtoon.

### UI blocks
1. Template categories:
   - Action/Battle
   - Romance/Drama
   - Slice of Life
   - Comedy / 4-koma
2. Mỗi template có:
   - thumbnail/preview,
   - short description,
   - expected output flavor.
3. Option `Start blank`.

### Rules
- Cho phép skip template, nhưng khuyến nghị chọn.
- Khi chọn template -> set `templateId` vào onboarding state.

### Transition
- Next -> `S3`.

---

## S3 — Onboarding step 2: Source input mode

**Mục tiêu:** xác định dữ liệu đầu vào generation.

### Source modes
1. `blank` (bắt đầu từ ý tưởng ngắn)
2. `story_text` (paste truyện/ngữ cảnh)
3. `import_script` (đã có script thô)

### UI behavior
- Mỗi mode có helper text rõ expected input.
- Với text/script mode: có textarea + character counter.
- Hiển thị “quality hint” (ví dụ độ dài tối thiểu gợi ý) nhưng không block cứng quá sớm.

### Transition
- Next -> `S4`.

---

## S4 — Onboarding step 3: Generation readiness review

**Mục tiêu:** checkpoint trước khi vào runtime generation.

### Summary card
- Journey: Manga/Webtoon
- Selected template (nếu có)
- Source mode + preview snippet
- Initial style preferences

### User actions
1. `Back` để chỉnh bước trước.
2. `Start creating` để vào runtime.

### Transition contract (compatibility phase)
Khi start creating, adapter map semantic -> runtime bridge:
- semantic intent giữ ở context/log,
- runtime entry dùng đường tương thích hiện tại (ví dụ script stage + quick manga compatibility khi cần).

Target outcome:
- vào workspace runtime đúng Manga context,
- legacy deep-link continuity không gãy.

---

## 6) State-transition table (compact)

| From | Event | Guard | To | Notes |
|---|---|---|---|---|
| S0 | select_manga_journey | always | S1 | set `journeyType=manga_webtoon` |
| S1 | create_project_success | valid name | S2 | persist project + intent context |
| S1 | create_project_fail | API error | S1 | show inline error |
| S2 | next | always | S3 | `templateId` optional |
| S3 | next | source valid | S4 | store source payload |
| S4 | start_creating | review ok | Runtime Entry | adapter -> compatibility bridge |
| Any onboarding step | back | always | previous step | no data loss |

---

## 7) Acceptance criteria (implementation-ready for VAT-118)

1. IA entry thể hiện rõ 2 journeys ngang hàng, Manga/Webtoon có lane riêng từ bước đầu.
2. Create flow Manga/Webtoon luôn gắn semantic intent (`journeyType`, `entryIntent`) trước onboarding.
3. Onboarding gồm tối thiểu 3 bước rõ ràng: template -> source -> readiness review.
4. User có thể quay lại chỉnh bước trước mà không mất dữ liệu đã nhập.
5. Transition từ onboarding vào runtime giữ compatibility bridge, không phá continuity link cũ.
6. Event schema logic cho các bước entry/create/onboarding có thể đối soát journey funnel end-to-end.

---

## 8) Risks & guardrails

### Risks
1. Drift giữa semantic journey mới và runtime bridge cũ.
2. Overload onboarding nếu nhồi quá nhiều option từ đầu.
3. Analytics mismatch nếu thiếu required fields khi emit event.

### Guardrails
1. Dùng adapter rõ ràng semantic -> compatibility, không encode intent thuần bằng query flag.
2. Keep onboarding progressive disclosure (3 bước gọn, option nâng cao ẩn).
3. Event field contract bắt buộc cho mọi step event.

---

## 9) Handover cho execution phase tiếp theo

Artifact này là blueprint chi tiết cho implementation tasks kế tiếp thuộc VAT-114 chain:
- UI shell build (entry + onboarding wizard),
- intent contract wiring,
- compatibility adapter wiring,
- telemetry instrumentation.

Pass VAT-118 đã hoàn tất phần IA/screen-flow ở mức implementation-ready, không mở rộng sang code runtime.
