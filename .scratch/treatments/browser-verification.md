# Browser verification — 2026-11-14/15

Real Chrome, synthetic clinic9876 and patient435c0013-e77d-4ce5-8264-e972a9ddbb5f on isolated frontend5163/API5162/PostgreSQL55464. No user credentials or development patient data used. Actual blue Patient.png/Session.png opened before design. Reference layout retained: patient card, four Radix tabs and one visible panel; no dental chart/finance/recommendations added.

## Observed flows
- Arabic created a real plan and item, opened detailed before/after audit. Initial unstyled native form fields were caught by screenshot and replaced with shared field/ui-input/ui-textarea markup, then visually verified.
- French recorded a linked procedure, inspected the associated plan/items within a Radix disclosure, then voided it with a reason. Original performed description/notes/actor/time remained visible.
- After void, the plan still opened its historical visit. On the next day, automatic administrative closure remained independent: plan progress0/2 and procedure history still accessible.
- New synthetic next-day visit opened a long standalone procedure form. At390×844 the modal body had overflow:auto, clientHeight734/scrollHeight795, with visible scrolling and no horizontal overflow. It uses existing ui-dialog-body ownership. Unsaved text→Escape opened AlertDialog; Stay retained the exact text; Escape→explicit Discard closed it and restored focus to the initiating clinical button. No write occurred for that discarded draft.
- Home/End switched first/last patient tabs using keyboard. One visible tabpanel measured. Arabic/French labels/RTL/LTR and Radix Select were inspected; real linked selection worked by pointer, storage tests select by keyboard.

## Dimensions and motion
- Desktop1676×719: shared controls36px.
- Tablet requested1024×768, browser reported1025px: controls40px and no horizontal overflow.
- Phone390×844: controls44px; historical modal~358px wide and640px tall, no horizontal overflow. Long form scroll verified separately.
- prefers-reduced-motion reduce: computed dialog animationName=none. Media and viewport overrides reset afterward.
- Browser debugger detached once; fresh tab in the same browser recovered. Earlier full-suite architecture fixture writes triggered Vite reload and invalidated one focus attempt; the final fresh-tab Stay/Discard/focus flow succeeded after recovery.

Screenshots at C:/Users/ayman/.codex/visualizations/2026/11/14/01a1dbda-778c-7ae2-a319-1a8d0aea4bb6/: treatment-plan-ar-desktop.jpg, treatment-plan-fr-phone.jpg, treatment-plan-fr-tablet.jpg, treatment-procedure-fr-desktop.jpg, treatment-history-fr-desktop.jpg, treatment-history-ar-phone.jpg, treatment-history-ar-tablet.jpg, treatment-form-ar-phone.jpg.

Browser emits Origin http://127.0.0.1 withoutport. Only the isolatedQA API configured for that exact observed source; development/product origin security unchanged. Physical phone/tablet, screen reader and human acceptance not claimed.
