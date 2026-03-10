# VAT-89 — QA regression editor flow sau khi đổi label/toggle

- Ticket: [VAT-89](https://linktovn.atlassian.net/browse/VAT-89)
- Parent story: [VAT-86](https://linktovn.atlassian.net/browse/VAT-86)
- Epic: [VAT-85](https://linktovn.atlassian.net/browse/VAT-85)
- Ngày thực hiện: 2026-03-10

## Mục tiêu regression

Xác nhận editor flow vẫn đúng sau baseline Phase 1 đã merge:

- `f89a97a` — add manga quick-start entrypoints
- `e6968e5` — relabel manga entry và persist toggle
- `d15c7e8` — i18n regression cho manga beta entrypoint
- `1dec56e` / `af9cd02` — harden session toggle persistence

## Phạm vi VAT-89

Chỉ QA regression cho editor flow liên quan tới label/toggle Manga:

1. Label editor entrypoint giữ đúng `Manga (Beta)`.
2. Toggle editor entrypoint giữ copy đúng theo locale.
3. Session persistence helper vẫn hoạt động an toàn.
4. Editor enable-state resolution không hồi quy khi kết hợp:
   - explicit query `quickManga=1`
   - persisted session preference
   - runtime current state khi không có input nào khác

## Thay đổi thực hiện

### 1. Tách logic resolve enable-state thành helper thuần

File: `src/lib/workspace/quick-manga-editor-flow.ts`

Mục đích: gom logic quyết định `quickManga.enabled` từ entry param + session preference về một helper thuần để test được regression hành vi editor flow, thay vì chỉ test storage helper riêng lẻ.

### 2. Hook editor dùng helper chung

File: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts`

Thay vì inline logic trong `useEffect`, hook nay gọi helper thuần để đảm bảo hành vi được khóa bằng regression test.

### 3. Thêm regression test cho editor flow

File: `tests/unit/helpers/quick-manga-editor-flow.test.ts`

Case cover:

- explicit entry param luôn bật Manga
- không có entry param thì ưu tiên persisted session preference
- nếu không có entry param và cũng không có session preference thì giữ nguyên runtime state hiện tại

## Evidence test

### Targeted tests

```bash
npx vitest run \
  tests/unit/helpers/quick-manga-editor-flow.test.ts \
  tests/unit/helpers/quick-manga-session.test.ts \
  tests/unit/workspace/manga-entrypoint-i18n.test.ts
```

Kết quả: **PASS 3 files, 10 tests**

### Lint

```bash
npm run lint -- "src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts" src/lib/workspace/quick-manga-editor-flow.ts tests/unit/helpers/quick-manga-editor-flow.test.ts
```

Kết quả: **PASS**

### Build

```bash
npm run build
```

Kết quả: **PASS**

Ghi chú build: còn warning có sẵn từ `bullmq/dist/esm/classes/child-processor.js` về `Critical dependency: the request of a dependency is an expression`; không phải thay đổi do VAT-89.

## Kết luận

VAT-89 đạt scope QA regression cho editor flow sau đổi label/toggle. Evidence đã có ở test + build artifact; không deploy production.
