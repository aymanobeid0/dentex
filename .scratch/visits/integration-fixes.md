# Visits integration review fixes — 2026-11-14

Scope: two verified P2 findings from the final 01–05 review. No architectural, public-interface, permission, package, migration or runtime change. Parent owns final review, full suite, browser evidence, protected dev migration/restart and handoff.

## Midnight between maintenance and human lock

`visits.service.ts` now retains the day successfully processed by each independently committed catchup. After acquiring the human transaction lock it compares the current clinic day; a changed day releases that transaction without executing the human operation, then performs actorless catchup and retries with fresh authorization and versions. There is no arbitrary retry limit or nested maintenance lock. Rejected human writes cannot roll back completed maintenance. The existing legacy older-arrival/current-day-visit rule remains unchanged.

Two controlled-time real HTTP/PostgreSQL regressions reproduce starting yesterday's waiting attendance and manually completing yesterday's visit across the gap. Both returned200 before the fix, where409 was required. Their final assertions also inspect closure persistence before another HTTP read could conceal a rollback, then verify the public snapshot and absence of a fabricated visit/end time.

External reports under `C:/Users/ayman/.codex/visualizations/2026/11/13/01a1d693-7143-7803-b1eb-d414e8c1e236/visits-runtime/`:

- `integration-fix-midnight-red-isolated.json`: both intended regressions fail with200 versus409. The earlier `integration-fix-midnight-red.json` is retained honestly: start reproduced the bug; complete failed during setup because that bug left the doctor occupied. Separate synthetic days corrected that test interference before the clean red run.
- `integration-fix-midnight-green.json`:9/9 pass, no failures/skips/todo, covering the complete existing day-close file plus the two gap regressions.

Two additional real PostgreSQL queue-contention cases were completed before source freeze: the human lock waits across midnight, with and without role removal, requiring independently persisted closure and fresh403/409. They enqueue owned lock holders behind the actual HTTP controller/service maintenance transactions and explicitly observe each waiting backend before release. These last two cases have **not been run by this implementer**. Automatic approval review could not execute their requested QA run because its usage limit was reached; the rejection explicitly said this was a review failure, not a determination that the action was unsafe. No alternate execution bypass was attempted. Parent's final suite owns their result.

## Recovery labels in Arabic and French

`VisitsPage.tsx` now uses a total attendance-status label lookup for both the current recovery snapshot and the reviewed previous patient. Automatically closed attendance therefore displays its actual status rather than departed/completed. Actual completed snapshots retain the existing `t.completed` recording wording. Guards, manual review, uncertain outcomes and retry behavior are unchanged.

- `integration-fix-recovery-red.json`: six intended failures (AR/FR × start, complete and compound previous-patient recovery), each missing the automatic-closure label.
- `integration-fix-recovery-green.json`:21/21 pass across the complete queue UI file, no failures/skips/todo. The six regressions also require one POST only and a disabled submit after review; compound recovery requires both snapshots to show automatic closure.

The parent separately added the existing `ui-textarea` class to the correction reason after observing the raw textarea in Chrome. This implementer did not edit that file or add a class-only test. Browser/computed-style evidence belongs to the parent. Both actual Patient reference images were opened during this fix task; these functional tests are not visual acceptance.

## Freeze and safety

Follow-up after the parent's first final-suite run:573/575 passed; only the two new contention cases failed in their queue-wait setup. A queued backend can wait on an intervening request's tuple lock rather than directly on the original clinic-lock holder. The test now checks that its specifically identified owned backend is blocked on a lock with a nonempty blocking chain; when no backend is specified it still requires the request to wait behind the owned holder. No production change, assertion removal or timeout increase was made. Targeted rerun `integration-fix-midnight-locks-green.json` passes11/11, including both contention/role-refresh cases, and `scripts/check-test-report.mjs` passes with no failures/skips/todo. The earlier unrun/rejection paragraph above describes the state before this follow-up; these two cases are now measured green. Source and tests are frozen again for parent verification.

Production and tests are frozen for the parent's single final suite; no duplicate suite, build or checks were launched after the freeze instruction. Final checks and report guards are parent-owned. No server/dev process was started, no development data/accounts/grants/volume were changed, and no migration/seed/reset/commit/push/PR was performed. QA use was confined to the approved synthetic `dentex_test`55471 and owned rows; secrets were dot-sourced without printing. The excluded `odontogram/`, `debug.log` and `.scratch/frontend-fixture-ASuHzC/` were not read or changed. This document records measured partial evidence only and does not claim final suite success, human acceptance or local runtime readiness.
