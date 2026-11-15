# Final treatment feature review

Fresh main deb789d5b281ac57395e0b757b8f129b0a35619e fetched on2026-11-14 and2026-11-15. Scope: eb1df09 plus every working change/new treatment file; protected paths excluded. Independent Standards/Spec reviewers used fresh contexts.

## Standards
Final finding: void correction draft did not warn when another actor changed its origin. Fixed by comparing current procedure version with selected snapshot, preserving reason, warning and guarding Save. Follow-up confirmed unsafe-write issue resolved, then found the button lacked the disabled condition; it is now present. Actor projections batched across histories/performance. Generic plan-writing transport interface remains a nonblocking depth/locality judgment call within visits ownership/layers.

## Spec
- Confirmed visit snapshot was discarded before another procedure could start. Now published to session-scoped cache before invalidation; regression expects versions1,2 despite all post-write GETs failing.
- Voiding removed plan→visit access. Ordered performances now retain all history; completion uses active procedure only, historical visit buttons remain.
- Visit did not identify plan/item. Radix disclosure now names the associated plan, shows items/states/notes and marks the linked item.
- Plan writes had analogous stale cache. Confirmed plan now published before invalidation; regression expects item-add versions1,2 during failed refreshes and empty new-item description. Spec follow-up found no remaining concrete issue.

No human acceptance/CI/push/PR implied. Verification in integration-verification.md; failed intermediate reports retained outsideGit.

Both reviewers checked the final old-calendar test split: all AR/FR assertions retained, no timeout changes/skips, two added cases. It isolates clean opening/keyboard behavior from the long save scenario; no product change.
