# VAT-103 — Mapping current IA và pain points discoverability

- Ticket: https://linktovn.atlassian.net/browse/VAT-103
- Parent: https://linktovn.atlassian.net/browse/VAT-102
- Date: 2026-03-10
- Strategy: `code_light` (discovery artifact only, no runtime/API contract change)

## 1) Jira context read first

Đã đọc context trực tiếp từ Jira trước khi thực hiện:
- Key: `VAT-103`
- Summary: `[Sub-task] Mapping current IA và pain points discoverability`
- Current status at start: `To Do`
- Scope từ mô tả: tách đầu việc discovery, tạo artifact/evidence, bám scope story cha VAT-102.

## 2) Scope guard (strictly VAT-103)

Pass này chỉ thực hiện **mapping current IA + pain points discoverability**.

Không làm trong VAT-103 pass:
- Không refactor UI shell.
- Không đổi route/API contract.
- Không đổi analytics event contract.
- Không triển khai backlog build phase.

## 3) Current IA map (as-is)

### 3.1 User entry points
1. Workspace landing: `src/app/[locale]/workspace/page.tsx`
   - New Project card (story default)
   - Manga CTA card (entry mode manga)
2. Create modal project type switch (story/manga) tại cùng file.
3. Project entry URL mapping: `src/lib/workspace/project-mode.ts`
   - `story` -> `/workspace/:id`
   - `manga` -> `/workspace/:id?stage=script&quickManga=1`
4. Quick manga bridge parser: `src/lib/workspace/quick-manga-entry.ts`
   - bật quick manga khi query `quickManga=1`.

### 3.2 Compatibility rails hiện hữu
- Contract create payload giữ `mode: 'novel-promotion'`, thêm `projectMode?` để tương thích ngược.
- Query compatibility giữ `quickManga=1` cho deep-link cũ.

## 4) Discoverability pain points

1. **Entry semantics chưa tách rõ theo intent ngay từ landing**
   - Có 2 card (story + manga), nhưng toàn bộ grid vẫn thiên về danh sách project; chưa có “journey-first shell”.

2. **Decision point bị dàn trải**
   - Người dùng phải hiểu cả card + modal + query behavior để nắm luồng Manga.
   - Mental model bị split giữa “project type” và “runtime stage/query”.

3. **Technical cue lộ sớm hơn use-case cue**
   - `quickManga=1` là kỹ thuật bridge hữu ích cho continuity nhưng không phải ngôn ngữ intent của người dùng.

4. **Analytics focus chủ yếu ở CTA/conversion, thiếu bước IA intent clarity**
   - Đã có CTA view/click/conversion tracking; chưa thấy taxonomy rõ cho bước “intent selection confidence / wrong-path correction”.

## 5) Impacted modules for follow-up (reference only, no implementation in this pass)

- `src/app/[locale]/workspace/page.tsx` (entry shell semantics)
- `src/lib/workspace/project-mode.ts` (intent-to-entry mapping)
- `src/lib/workspace/quick-manga-entry.ts` (compat parser)
- `src/lib/workspace/manga-discovery-analytics.ts` (event taxonomy extension)

## 6) Output of VAT-103

- Hoàn tất artifact mapping current IA + discoverability pain points.
- Cung cấp base input cho bước IA redesign build ở story cha VAT-102.

## 7) Evidence checklist

- [x] Jira context read first
- [x] Scope strictly VAT-103
- [x] Artifact created (this doc)
- [ ] Jira comment (to be added from executor)
- [ ] Jira status transition (to be updated from executor)
