# Treatment plans and performed visit procedures

Status: ready-for-human — delegated implementation 2026-11-14, completed2026-11-15. No human acceptance claimed.

Execution follow-up2026-11-15: both slices complete, independent review corrections applied, final592/592 and report guard passed. Development migrated additively with backups and exact preservation. Verification/contracts are tracked in integration-verification.md; browser evidence distinguishes real synthetic QA from human acceptance. No push/PR/merge/deployment.

## Problem Statement
The patient file has no usable treatment plan and administrative visits cannot document performed care. Planned care must never be mistaken for completed treatment.

## Solution
Keep the patient card and four tabs. The treatment tab manages named plans and ordered procedure items; each item represents one procedure occurrence, with optional tooth/location and notes. Visit details record performed procedures, optionally completing exactly one plan item. Both views show the linked visit, progress, outstanding items and immutable change history.

## User Stories
1. As a dentist, I can create multiple named plans for a patient without inventing clinical advice.
2. As a dentist, I can add and edit procedure items, location and notes before performance.
3. As a dentist, I can cancel an outstanding item with a reason while retaining history.
4. As a clinician, I can review current and cancelled plans and their full history.
5. As a dentist, I can record a performed procedure in a genuine ongoing visit, with or without a plan.
6. As a dentist, I can choose an outstanding item of the same patient and preserve the performed description as a snapshot.
7. As a clinician, I can see performed and remaining items and each linked visit.
8. As a dentist, I can void a mistaken procedure with a required reason, preserving its original record and releasing its plan item for subsequent genuine performance.
9. As a clinician, I can see who recorded and corrected care and when.
10. As a receptionist, I retain administrative visit operations but cannot read or write clinical treatment details.
11. As a user, stale edits and concurrent duplicate performance are rejected without partial writes.
12. As a user, lost responses preserve my draft and require explicit review rather than automatic resubmission.
13. As a user, ending an administrative visit neither completes a plan nor requires any procedure.
14. As a clinician, administrative invalidation/deletion cannot remove a visit with any treatment history, even after a void.
15. As a user, I can operate forms, tabs and dialogs in Arabic/French with the keyboard and protected drafts.
16. As a clinic, all references and history remain isolated and authorization is checked after the clinic lock.

## Implementation Decisions
- Extend the existing visits feature Module with clinical treatment planning and performance, using its established route/controller/service/repository layers, transaction scope, clinic lock, patient references and actor facts. No cross-feature table access, new dependency direction, transaction-manager change or relaxed check. Treatment-specific files remain internal to the visits Module.
- Client visits owns treatment queries, mutations and drafts. It exports PatientTreatmentPlans; patients adds renderTreatmentPlans using its existing patient context, composed by app. PatientVisits owns the performed-care dialog. No feature imports another feature.
- Treatment authorization: current active admin/dentist roles only, both reads and writes. Reception retains visits and sees no treatment content. Admin can document on behalf of the assigned dentist; actor and visit dentist are distinct. No new permission keys or grants.
- Plan states active/cancelled, with reactivation allowed. Plan items pending/cancelled; completed is derived from one non-void procedure. Repeated sessions use separate items. No manual mark-complete or numeric percentages entered by users.
- Changes use editVersion and required reasons for cancellation/reactivation and voiding. Completed items are immutable; voiding preserves the old performance and reopens the item. Plans with performed items may be cancelled: completed facts remain visible, pending items are unavailable until reactivation. No deletion of treatment records.
- Plan creation and item addition carry caller-generated UUID ids for replay protection. Duplicate ids are conflicts (no second record). Procedure recording carries caller UUID, visitVersion and optional itemVersion. All writes, audit and version increments are atomic. Active item uniqueness enforced in PostgreSQL. Every reference includes clinic and patient ownership; foreign ids return not_found.
- HTTP under /api/clinic/visits: GET/POST /patient/:patientId/treatment-plans; PATCH /treatment-plans/:planId; POST /treatment-plans/:planId/items; PATCH /treatment-items/:itemId; GET/POST /:attendanceId/procedures; PATCH /procedures/:procedureId/void. Successful writes return confirmed snapshots; errors invalid_input400, forbidden403, not_found404, edit_conflict409, treatment_not_allowed409, treatment_history_exists409. Reads of plans return items, derived progress, linked procedures and ordered audit; procedure reads return treatment history for the visit and available plan items.
- Recording requires genuine in_progress visit and active patient; closed visits retain read/void access, but no new performance can be silently backdated. Administrative corrections cannot invalidate any visit ever containing a procedure, including voided history. FK restrictions additionally prevent orphaning. Voiding on archived patient remains possible for corrections; new care/plans/items and edits require active patient.
- Descriptions 1–200 chars; optional location up to80 and notes up to2000; correction reasons 1–500. Server timestamps and actor identity only. No fees, recommendations, automatic diagnoses or full dental chart.
- Drafts stay local; Query is session scoped and displayed only. No optimistic success/retry. Uncertain write requires refresh and explicit closing/review before another attempt, with original UUID retained for new records.

## Testing Decisions
Existing highest Seams: HTTP through real isolated PostgreSQL for authorization, references, concurrency, atomicity, replay and history; React UI through HTTP to the same isolated storage for both languages, draft protection, conflict and lost-response behavior. Browser separately verifies real layout and keyboard at desktop/tablet/mobile. User delegation authorizes these seams without another confirmation. TDD one observable behavior at a time. Targeted tests after each slice; full suite only after final slice and spec completion (ADR0005). Fresh main pinned on every two-axis independent review, including new/uncommitted files.

## Out of Scope
Dental chart, finance, clinical recommendations, procedure catalogue, prescriptions, deployment, push/PR and changes to existing accounts. Excluded paths remain untouched.

## Further Notes
Baseline a8132ff, original handoff changes preserved. PR15 observed MERGED at deb789d5b281ac57395e0b757b8f129b0a35619e; no local reset/merge required. Development check16/16 before work. Reference blue Patient/Session images actually opened; use their card/tab and procedure/plan hierarchy only within approved scope.
