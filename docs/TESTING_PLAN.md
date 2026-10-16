# Testing / Cleanup / Env-separation / CI-CD — Living Plan

Branch: `chore/testing-foundation` (cut from `main` on 2026-10-13).
This file is the source of truth. Update the status tables at the end of every phase.
Rule: each phase lands as a small PR `chore/testing-foundation` ← `chore/phase-N-<slug>`. No direct pushes to `main`.

Related docs: `docs/ENVIRONMENTS.md` (env matrix + secrets), `docs/DECISIONS.md` (append-only decision log).

## Baseline (2026-10-13, pre-change survey)

- Zero test files (`*.test.*`/`*.spec.*`), zero test runner, zero CI workflows (no `.github/` at repo root).
- Only script: `lint = tsc --noEmit`. Manual harnesses: `scripts/test_lab_report_tokens.ts`, `scripts/test_whatsapp.ts`.
- Single `.env` (gitignored) + `.env.example`; only env branch in code is `NODE_ENV !== "production"`.
- One Firebase project, two App Hosting instances (prod + preview) sharing Firestore/Auth/Storage.
- Meta test sender dead; webhook serves the prod number only.
- ~25 dead top-level files (patchers, scratch tests, pasted notes) + duplicated live-vs-legacy modules.
- Dual lockfiles: `bun.lock` + `package-lock.json`. Decision: **npm** (App Hosting buildpacks support npm/yarn/pnpm only — Bun unsupported, not configurable via `apphosting.yaml`).

## Phase 0 — Safety net

- [x] Create `chore/testing-foundation` + this living plan.
- [x] Standardize on npm: delete `bun.lock` (keep `package-lock.json`).
- [x] Record baseline: `npm run lint`, `npm run build` pass/fail on clean checkout.
  - `npm run lint` = **RED**: 11 pre-existing errors, all in `src/components/Dashboard.tsx`
    (missing `familySummaries` on `AppContextType` + `"health"`/`"glucose"`/`"weight"` tab-type mismatches).
    Not fixed in Phase 0 — tracked for the CI phase (CI must start with a green lint; fix lands with Phase 1/4).
  - `npm run build` baseline: **GREEN** (19.7s; chunk-size warnings only; `dist/` is gitignored so no churn).

## Phase 1 — Cleanup first (approved priority)

- [x] Delete dead top-level files in one revertable commit:
  Deleted 26 files (2026-10-13). **Kept `test.pdf`**: it is the default fixture of the manual
  harness `scripts/test_lab_report_tokens.ts:352` — deleted with the harness in Phase 3.
  (`test2.pdf`/`test.tmp` were byte-identical copies and were deleted.)
- [x] Untrack committed `dist/` from git (keep as gitignored build output).
  Not needed — `dist/` was never tracked (gitignored). Verified 2026-10-13.
- [x] Deprecate-don't-delete: add `@deprecated` headers pointing at the live copy for
  `server/services/labReportService.ts` → `labReportServiceDirect.ts`,
  superseded `server/services/whatsapp/*` → `server/services/wa-bot/*`,
  `src/components/AuthScreen.tsx` → `src/components/authflow/`,
  `src/components/WelcomeScreen.tsx` (legacy marketing).
  Switch all imports to live copies; delete legacy only after Phase 3 covers the live path.
  - Done for `labReportService.ts`, `AuthScreen.tsx`, `WelcomeScreen.tsx` + `TestPage.tsx` stub
    (all verified zero importers via grep).
  - NOT applied to `services/whatsapp/*`: routes (`whatsapp.ts`, `auth.ts`) still import the legacy
    barrel via `whatsappService`, while `wa-bot/routeMessage` handles inbound. The two implementations
    coexist — consolidation deferred to Phase 3 behind tests.
- Gate: `tsc --noEmit` + production build green.
  - Lint still exactly the 11 pre-existing `Dashboard.tsx` errors — no new errors introduced.

## Phase 2 — Env separation (incl. WhatsApp test number revival + 2nd Firebase project)

Topology discovered 2026-10-13 (no new project needed): prod = `myhealthyfam-28c2c`
(ENTERPRISE Firestore `ai-studio-…`, `auth.bluepin.in`), dev/preview = `bluepin-f8a09`
(`(default)` Firestore). Local `.env` already points at `bluepin-f8a09`. Model: single
`.env` for local dev + `ENV_NAME` identity; App Hosting yaml/env supplies per-env values
(real process env always wins over files). No per-env dotenv files.

- [x] Add `server/config.ts` (zod-validated, fail-fast): `ENV_NAME=development|preview|production` + all required keys.
  Warns on missing integration keys; **throws** on unknown `ENV_NAME` or
  `WHATSAPP_MODE=live` outside production. Verified: boots `[env=development, whatsapp=test]`,
  refuses `live` in preview.
- [x] `GET /api/health` (version-free: `{status, env, whatsappMode, now}`, no secrets). Verified live.
- [x] Create `apphosting.yaml` (production defaults, Secret Manager refs) +
  `apphosting.preview.yaml` (bluepin-f8a09 values, `WHATSAPP_MODE=test`, smaller instances).
  TODOs left in-file: prod `APP_URL` confirm, prod `VITE_FIREBASE_APP_ID/API_KEY` (which of the
  6 myhealthyfam web apps is prod?), preview `APP_URL` (after backend exists), all Secret
  Manager values (console, manual).
- [x] Extend `.env.example` with `ENV_NAME` + `WHATSAPP_MODE`. Boot log in `server.ts`
  prints `[env=…, whatsapp=…]` (no secrets).
- [x] `WHATSAPP_MODE=test|live` guard in `wa-bot/wa-client/sender.ts:postMessage` (defense in
  depth; Meta also rejects cross-sender sends server-side).
- [ ] **WhatsApp test sender revival (needs you, ~5 min in Meta dashboard):** see
  `docs/ENVIRONMENTS.md` "Test sender revival" checklist. Code side is ready (preview mode +
  separate verify token supported).
  - **DONE 2026-10-13:** preview webhook verified against
    `https://bluepin-f8a09--bluepin-f8a09.us-east4.hosted.app/api/whatsapp/webhook`.
- [ ] Separate Gemini key + SMTP sender for preview (Secret Manager `*-preview` refs stubbed).
- Gate: boot each env with its file, `GET /api/health` reports correct `ENV_NAME`, preview writes absent from prod.
  - Preview gate **PASSED** 2026-10-13: `https://bluepin-f8a09--bluepin-f8a09.us-east4.hosted.app/api/health`
    → `{env: preview, whatsappMode: test}` (after explicit console vars; base yaml had won initially).

## Phase 3 — Test setup

Install: `vitest`, `@vitest/coverage-v8`, `supertest`, Firestore emulator config, `msw` (or `nock`), `playwright` (chromium only).
- [x] Runner installed (`vitest@5` + `@vitest/coverage-v8` as devDeps; `test` / `test:watch` / `test:coverage` scripts).
- [x] Unit batch 1+2 (86 tests, all green 2026-10-13): `server/utils` (cache/jsonparse/generateId),
  `wa-bot/services/reminderSlots`, `src/careReminderRules`, `src/lib` (utils/goalUtils/biomarkerUtils/
  registry/biomarkerLookup). Coverage: `server/utils` 94%, `src/lib` ~81% — gate (≥70%) PASSED.
  Two tests caught real contract subtleties (clinical-override refs, glucose info suppression) —
  tests encode actual behavior, not assumptions. Lint: still exactly the 11 pre-existing errors.

- [ ] Unit (first): `src/lib/derivedMetrics.ts`, `src/lib/biomarkerUtils.ts`,
  `src/lib/registry/biomarkerLookup.ts`, `src/careReminderRules.ts`, `src/lib/goalUtils.ts`,
  `server/utils/jsonparse.ts`, `server/utils/cache.ts`, `wa-bot/services/limits.ts`,
  `reminderSlots.ts`, `whatsapp/utils.ts`. Gemini fixtures: valid / truncated / garbage JSON.
- [x] API (supertest + mocked sender/Gemini + emulator): `routes/whatsapp.ts` (verify, signature reject,
  idempotency), `routes/auth.ts` (OTP send/verify, cooldown, link), `routes/upload.ts`,
  `routes/reminders.ts`, `routes/cron.ts` (`CRON_SECRET`, IST hour, 20:00 sweep).
  - DONE 2026-10-13 (42 API tests, all green): in-memory `FakeFirestore` (`server/test/`) instead of
    the emulator — zero infra, runs in ~1.5s; fetch stubbed so no Meta/Gemini call can escape.
    Covered: webhook verify/403-without-echo, signature reject, non-wa ack, phone-id gating,
    dispatch + redelivery dedupe; OTP send/cooldown/HMAC-only storage/attempt lockout/expiry/
    custom-token + auto-link; analyze idempotency + 20/100 limits + AI-failure 500; markdown
    422; chunk validation/assembly; reminders CRUD + re-enable + soft-stop; cron auth + due-hour
    send + logged-skip + push-only + push report. Lint still exactly the 11 pre-existing errors.
  - NOT covered yet (deferred): `routes/insights.ts` / `notifications.ts` / `feedback.ts`, Firestore rules
    tests (need emulator + Java — CI job instead), Playwright E2E slice.
  - DONE 2026-10-13 (2nd batch): sweep branch (20:00 IST incl. scheduled-vs-sweep interaction),
    `insights` (validation/passthrough/500), `notifications` (CRUD + 7 AM default + uid-keyed docs),
    `feedback` (validation/storage/email-forward, SMTP mocked). All 8 routes now have API tests.
- [ ] Rules tests: `firestore.rules`, `storage.rules` on emulator (`users/{uid}` isolation, `feedbacks` write).
  - DONE 2026-10-14 (`tests/firestore.rules.test.ts`, 6/6 vs local emulator; `test:rules` script;
    `rules-emulator` CI job): catch-all deny, owner isolation + list-denied, family read (not write),
    public feedback create + admin-only read, limits-coupled batch write + increment-skip reject.
    Kept OUT of default `npm test` (needs emulator) — hermetic suite stays 145/145.
    Storage rules (7-line owner-only file) still untested — needs storage emulator; trivial follow-up.
- [x] E2E thin slice (Playwright vs preview + seeded user): login → add glucose → upload report → reminders toggle.
  - DONE 2026-10-13 (`playwright.config.ts` + `e2e/preview.spec.ts`, `test:e2e` script, 3/3 green in ~36s):
    seeded `e2e-test@bluepin.in` via preview signup; covers login → glucose log + timeline →
    unlinked WhatsApp-link prompt → session persistence. Report upload deliberately excluded
    (Gemini quota + slowness; covered by API tests). Lessons: auth inputs need `input[type=…]`
    selectors (labels are detached generics); tour/PWA overlays must be dismissed or completed.
- [x] Playwright MCP confirmed loaded (restart effective).
- [x] Delete manual `scripts/test_*` once automated equivalents land.
  - DONE 2026-10-13: deleted `scripts/test_lab_report_tokens.ts`, `scripts/test_whatsapp.ts`,
    `test.pdf` + `test:tokens`/`test:wa` scripts (webhook/OTP/analyze paths covered by API tests).
    145/145 green, lint 0, build green after deletion.
- [x] Deprecate-don't-delete (Phase 1) → deleted 2026-10-13: legacy `labReportService.ts`,
  `AuthScreen.tsx`, `WelcomeScreen.tsx`, `TestPage.tsx` (all zero importers, imports long since
  on live copies). `services/whatsapp/*` vs `wa-bot/*` coexistence remains — routes still import
  the legacy barrel; consolidation is a separate refactor behind the current suite.
  - DONE 2026-10-13 (`chore/phase5-consolidation`, branched off merged `main`): deleted the orphaned
    legacy inbound island — `dispatcher.ts` (381L) + `handlers/glucose.ts` (274L) +
    `handlers/reports.ts` (152L). Only importer was the dispatcher itself; live path is
    `wa-bot/messageRouter` (covered by webhook dispatch + dedupe tests). Barrel trimmed.
    Kept: `client` (Meta send + signatures), `auth` (OTP/link codes), `utils`, `types` — still
    imported by routes. 145/145 green, lint 0.
- Gate: unit ≥70% on `src/lib` + `server/utils` + `wa-bot/services`; all 5 routes covered; E2E slice green.

## Phase 4 — CI/CD (GitHub Actions + Firebase preview channels)

- [x] New `.github/workflows/ci.yml` (verification only — see header comment for why deploys stay
  out): on PR → `lint` → `vitest --coverage` → `vite build + esbuild server`.
  On `main` push → same + `smoke-preview` job polling preview `/api/health` for `env=preview` /
  `whatsappMode=test` (catches the base-yaml-wins misconfiguration).
  Manual wiring for owner: `preview`/`production` GitHub Environments + `PREVIEW_URL` variable +
  `main` branch protection on the `verify` job (steps in the yaml header).
- [x] Lint fixed to green as a prerequisite: `Dashboard.tsx` had 11 pre-existing errors —
  removed unused `familySummaries` destructure; added `isPinned()` helper because pin-gate
  duplication narrows `pinnedSection` to a constant inside each gate (zero runtime change).
- [ ] Add `GET /api/health` (version + env name, no secrets) for deploy verification.
  DONE in Phase 2 (returns `{status, env, whatsappMode, now}`).

## Status log

| Date | Phase | Change |
|---|---|---|
| 2026-10-13 | 0 | Branch created; plan + env + decision docs added. Baseline survey recorded above. |
| 2026-10-13 | 0 | npm standardized (`bun.lock` deleted). Lint RED (11 pre-existing `Dashboard.tsx` errors); build GREEN. |
| 2026-10-13 | 1 | Deleted 26 dead top-level files (kept `test.pdf` as harness fixture); `@deprecated` headers on 4 unimported modules; `dist/` confirmed untracked; lint still exactly 11 errors. |
| 2026-10-13 | 2 | Owner reported console keys for both projects. yamls rewritten additive-only (no `secret:` refs — console stays source of truth, rollout can't fail on missing secrets). Gaps documented in `docs/ENVIRONMENTS.md` (preview: verify token, app secret, cron secret, APP_URL, test-sender token swap). |
| 2026-10-13 | 2 | Branch deployed to preview backend. `/api/health` first read `production`/`live` (base yaml won); fixed via explicit console `ENV_NAME`/`WHATSAPP_MODE`, now `preview`/`test`. Lesson recorded in `docs/ENVIRONMENTS.md`. Webhook verification unblocked. |
| 2026-10-13 | 2 | Preview webhook verified. |
| 2026-10-13 | 3 | Unit tests batch 1+2: 9 files, 86 tests green; coverage gate passed (server/utils 94%, src/lib ~81%). |
| 2026-10-13 | 3 | API tests: 5 route files, 42 tests green (128 total). FakeFirestore harness replaces emulator. |
| 2026-10-13 | 3 | API batch 2: sweep + insights + notifications + feedback — 145 tests green across 17 files. |
| 2026-10-13 | 3 | Deleted manual harnesses + `test.pdf` + 4 deprecated modules (all zero-importer). Suite/build/lint green. |
| 2026-10-13 | 3 | E2E slice: seeded preview user, 3 Playwright specs green. `@playwright/test` added. |
| 2026-10-13 | 3 | E2E fix: vitest `exclude: e2e/**` (it was swallowing the Playwright spec); `test.skip` moved into `beforeEach`. Occasional cold-start flake on preview (minInstances 0) absorbed by `retries: 1`. |
| 2026-10-14 | 3 | CI-only E2E login hang diagnosed via trace: email fill silently dropped on slow loads (remount race). Fixed with verify-after-fill retry + proper `htmlFor`/`id` label association in auth forms (`auth-email`, `auth-password`, `auth-phone`); spec now uses `getByLabel`, proving the association every run. Docker parity (Ubuntu 24.04, `mcr.microsoft.com/playwright:v1.64.0-noble`) passes — hang is runner-network-specific, not platform. Added `E2E_BASE_URL` override for local runs. |
| 2026-10-14 | 3 | True CI root cause: `E2E_TEST_EMAIL` was set-but-empty in the preview env — `"" ?? default` keeps `""`, fill passed vacuously, submit died on validation with no banner. Fixed with `?.trim() \|\| default` + `fillVerified` refusing empty values (verified locally with blank env: 3/3). Owner action: fill or delete the empty variable. |
| 2026-10-14 | 3 | E2E green in CI (3/3 in ~9s on PR run — warm backend after smoke; speed is normal). Blank-env default confirmed as the fix. |
| 2026-10-14 | 3 | Rules tests: 6/6 on emulator; `rules-emulator` CI job added. Suite total 151 (145 hermetic + 6 emulator). |
| 2026-10-14 | 3 | Storage rules too (owner read/write incl. nested paths; stranger+anon denied): 8/8 with both emulators. CI job starts firestore+storage, polls the hub, fails loudly. Suite total 153. |
| 2026-10-16 | 5 | Thorough bot flows (`chore/wa-bot-flows`, `messageFlows.test.ts`, 24 tests): extractor units, full glucose text→timing→save incl. cap/lockout paths, LINK success/expiry, all menu/help/unknown branches, reminder save + unlinked guard, image OCR success/fail/oversize/error, document link/size/cap guards. Found nothing broken; fixed only test-side assumptions (interactive payloads, error copy). Suite: 169 hermetic + 8 rules + 3 E2E. |
| 2026-10-16 | fix | Report-upload `storage/unauthorized` (`chore/fix-report-upload`): added central `friendlyFirebaseError` mapper (storage/firestore/auth codes, Firestore JSON blobs, Firebase-shaped strings; server/app messages pass through) + applied at all 13 UI error sites (report/glucose/weight/WhatsApp/insights). 7 mapper unit tests. Cause of the denial itself still under diagnosis — needs env + deployed-rules info (see below). |
| 2026-10-16 | 4 | `chore/ci-e2e-on-pr` merged to fork `main`; preview rolled out, `/api/health` = `preview`/`test`. E2E_TEST_EMAIL moved to Variables. Upstream merge deliberately deferred (nothing pending depends on it). |
| 2026-10-16 | 4 | Post-merge full chain green: verify + smoke + e2e + rules-emulator. Testing track complete (deferred: thorough bot flows, WA sandbox, upstream). |
| 2026-10-13 | 4 | Lint fixed to green (Dashboard `isPinned` helper + dropped unused destructure). `ci.yml` added (verify on PR, preview identity smoke on main). Owner to wire: GitHub Environments + PREVIEW_URL + branch protection. |
