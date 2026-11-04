## Agent skills

### Session handoff

عند بدء جلسة أو إنهاء عمل، اقرأ وحدّث `dentex-session-handoff-2026-11-03-updated.md` في جذر المشروع. هذا هو ملف تسليم الجلسة المعتمد؛ حدّثه في مكانه نفسه بدل إنشاء نسخة في المجلد المؤقت، مع الإحالة إلى المواصفات وأدلة التحقق بدل تكرارها. هذا اختيار المستخدم الصريح ويتقدم على مكان الحفظ الافتراضي في مهارة handoff.

### Architecture

قبل إضافة Module أو تعديل تنظيم الخادم أو مراجعة اعتمادياته، اقرأ `docs/architecture.md`. التنظيم المعتمد Module لكل ميزة بطبقات route/controller/service/repository؛ يجب إكمال إعادة تنظيم الحسابات قبل تنفيذ المرضى. خطة الانتقال في `.scratch/architecture/plan.md`.

**أمر إلزامي للوكيل:** التزم بالمعمارية المعتمدة حرفيًا. أي تغيير معماري، مهما كان صغيرًا، أو استثناء مؤقت، أو تخفيف لفحصها، يتطلب إذنًا صريحًا مسبقًا من المستخدم نفسه. لا تملك صلاحية الموافقة بدلًا عنه أو تعديل الوثائق لتبرير مخالفة. عند الحاجة لتغيير، اعرض المقترح وأثره وانتظر موافقته قبل تطبيق الجزء المتأثر؛ الصمت وطلب تنفيذ ميزة ليسا إذنًا بتغيير المعمارية. اتبع إجراء الموافقة في `docs/architecture.md`.

### UI implementation

Before implementing or changing any screen, read `docs/ui-contract.md`, `DESIGN.md`, and the relevant screen reference. `login-preview.html` is the user-approved login visual baseline. Follow its refined neutral borders, Lucide icons, autofill treatment, and bilingual behavior. Implement screen content against the backend contract in `docs/ui-contract.md`; distinguish approved scope from proposals. Verify the complete UI-to-API flow and both languages before closing a ticket. Report blocked visual verification honestly.

### UI primitives

بقرار المستخدم في 2026-11-04، Radix Primitives معيار عام للمكونات القديمة والحالية والمستقبلية. قبل إضافة تفاعل أو تعديل مكوّن واجهة، اقرأ `docs/ui-primitives.md` واستخدم primitive المناسبة من خلال `client/ui`، مع الحفاظ على التصميم المعتمد. تبقى عناصر HTML الأصلية حين لا يوجد بديل في Primitives؛ تحقق فعليًا من لوحة المفاتيح واللغتين ولا تعتبر المكتبة وحدها إثباتًا للوصول.

### Issue tracker

تُحفظ المهام محليًا. راجع `docs/agents/issue-tracker.md`.

### Triage labels

تُستخدم حالات التصنيف الافتراضية. راجع `docs/agents/triage-labels.md`.

### Domain docs

المشروع ذو مجال واحد. راجع `docs/agents/domain.md`.
