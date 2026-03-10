# VAT-120 — UAT execution evidence (dual-journey pass 2)

- Ticket: https://linktovn.atlassian.net/browse/VAT-120
- Parent: https://linktovn.atlassian.net/browse/VAT-114
- Date: 2026-03-10
- Environment: local isolated UAT runtime on `http://localhost:13001`
- Guardrail: no production deploy / no production testing

## 1) Jira/context read-first recap

Context consulted before implementation/UAT:
- https://linktovn.atlassian.net/browse/VAT-110
- https://linktovn.atlassian.net/browse/VAT-112
- https://linktovn.atlassian.net/browse/VAT-114
- https://linktovn.atlassian.net/browse/VAT-119
- https://linktovn.atlassian.net/browse/VAT-120

Repo SoT artifacts consulted:
- `docs/testing/vat-114-manga-webtoon-journey-rebuild-phase-d-execution-2026-03-10.md`
- `docs/testing/vat-119-compatibility-adapter-contract-checklist-2026-03-10.md`
- `docs/testing/vat-120-uat-plan-dual-journey-telemetry-assertions-2026-03-10.md`

## 2) Runtime used for UAT

Started isolated local Next runtime with VAT-safe ports/env only:

```bash
DATABASE_URL='mysql://root:waoowaoo123@127.0.0.1:13306/waoowaoo' \
REDIS_HOST='127.0.0.1' \
REDIS_PORT='16379' \
NEXTAUTH_URL='http://localhost:13001' \
NEXT_PUBLIC_WORKSPACE_DUAL_JOURNEY_ENABLED='1' \
NODE_OPTIONS='--no-deprecation' \
npx next dev -H 0.0.0.0 -p 13001
```

Reason: preserve existing app/container state, avoid production/staging ports, and allow manual browser verification for dual-journey UI.

## 3) Manual UAT checklist execution

### Case A — dual journey workspace entry
- Opened `http://localhost:13001/vi/workspace`
- Verified **2 journey cards** render:
  - `Video / Film` → `Story Studio`
  - `Manga` → `Manga Quick Start`
- Evidence screenshot:
  - `/Users/mrcagents/.openclaw/media/browser/3e7d7cda-05ce-4e98-9c75-507b7c6daddd.png`

### Case B — manga create flow + compatibility bridge
- Clicked Manga card
- Modal showed **3-step wizard**:
  - Step 1 `Hành trình`
  - Step 2 `Template`
  - Step 3 `Nguồn nội dung`
- Verified back-navigation presence (`Quay lại`) at step 2
- Completed create flow and confirmed landing URL uses legacy compatibility bridge:

```text
/vi/workspace/e20ab65d-1e7a-4563-ad05-464ad28e1901?stage=script&quickManga=1
```

This confirms `quickManga=1` bridge stayed intact.

Evidence screenshot:
- `/Users/mrcagents/.openclaw/media/browser/7515a7b8-5515-4865-82d1-29d6a692702a.png`

### Case C — backend onboarding context persistence verification
After project creation, queried:

```http
GET /api/projects/e20ab65d-1e7a-4563-ad05-464ad28e1901/data
```

Observed response fragment:

```json
{
  "status": 200,
  "onboardingContext": {
    "sourceType": "blank",
    "journeyType": "manga_webtoon",
    "entryIntent": "manga_quickstart",
    "capturedAt": "2026-03-10T16:29:25.475Z"
  }
}
```

Conclusion:
- onboarding context now survives project creation
- context is readable from project data API
- runtime landing still preserves legacy `quickManga=1` URL bridge

## 4) Telemetry verification note

Deep wizard telemetry events were implemented and verified through automated tests in this pass:
- `workspace_wizard_step_view`
- `workspace_wizard_step_next`
- `workspace_wizard_step_back`

Primary verification files:
- `tests/unit/helpers/manga-discovery-analytics.test.ts`
- `tests/integration/api/contract/projects-route.test.ts`
- `tests/integration/api/contract/projects-route.dual-journey-post.test.ts`

Manual UAT verified the UI affordances and path transitions for:
- step entry/view
- step next
- step back
- project create
- legacy manga deep-link landing

## 5) Result summary

UAT outcome: **PASS**

Passed checkpoints:
- [x] Dual-journey cards visible in workspace
- [x] Manga wizard opens in expected 3-step flow
- [x] Step back path available and exercised
- [x] Project creation lands on compatibility URL with `quickManga=1`
- [x] Backend returns persisted onboarding context via project data API
- [x] No production deploy performed
