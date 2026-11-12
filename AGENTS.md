## Agent skills

### Session handoff

عند بدء جلسة أو إنهاء عمل، اقرأ وحدّث `dentex-session-handoff-2026-11-03-updated.md` في جذر المشروع. هذا هو ملف تسليم الجلسة المعتمد؛ حدّثه في مكانه نفسه بدل إنشاء نسخة في المجلد المؤقت، مع الإحالة إلى المواصفات وأدلة التحقق بدل تكرارها. هذا اختيار المستخدم الصريح ويتقدم على مكان الحفظ الافتراضي في مهارة handoff.

### Local review before PR

اكتملت التهيئة المحلية المعتمدة في 2026-11-03: عيادة `arabesque` برمز `2000` والحسابات الأربعة وفق إجابات المستخدم. أُلغي الإعداد القديم واستُبدلت `dentex_dev` وحدها؛ لا تعِد تهيئة القاعدة أو إنشاء الحسابات أو تغيير كلمات المرور والصلاحيات تلقائيًا في التذاكر التالية. احفظ قاعدة التطوير وvolume وحساباتها وبيانات فحص المستخدم دائمًا، ولا تستخدم `scripts/seed-local.mjs` الملغى. بعد كل تذكرة شغّل السيرفر وقاعدة التطوير واتركهما لفحص المستخدم قبل فتح PR وفق قسم «فحص المستخدم المحلي قبل PR» في `docs/development-database.md`. سجّل حالة التشغيل والتهيئة والفحص في التسليم دون أسرار، وانتظر انتهاء مراجعة المستخدم قبل PR.

قبل اعتماد جاهزية التطبيق المحلي أو تشخيص تعذر الدخول، اتبع «التحقق من نسخة التطبيق» في `docs/development-database.md` لإثبات مسار العملية والمصدر وقاعدة البيانات.

### Ticket review baseline

بقرار المستخدم في 2026-11-03، راجع كل تذكرة مقابل آخر تعديلات `main` بعد جلبه حديثًا من المستودع (`git fetch origin main`). ثبّت معرّف الالتزام المجلوب في دليل المراجعة، وضم تغييرات التذكرة غير الملتزم بها وملفاتها الجديدة إلى القراءة؛ لا تعتمد نسخة محلية قديمة من main أو تستبعد الملفات الجديدة من المراجعة.

### Architecture

قبل إضافة Module أو تعديل تنظيم الخادم أو مراجعة اعتمادياته، اقرأ `docs/architecture.md`. التنظيم المعتمد Module لكل ميزة بطبقات route/controller/service/repository؛ يجب إكمال إعادة تنظيم الحسابات قبل تنفيذ المرضى. خطة الانتقال في `.scratch/architecture/plan.md`.

**أمر إلزامي للوكيل:** التزم بالمعمارية المعتمدة حرفيًا. أي تغيير معماري، مهما كان صغيرًا، أو استثناء مؤقت، أو تخفيف لفحصها، يتطلب إذنًا صريحًا مسبقًا من المستخدم نفسه. لا تملك صلاحية الموافقة بدلًا عنه أو تعديل الوثائق لتبرير مخالفة. عند الحاجة لتغيير، اعرض المقترح وأثره وانتظر موافقته قبل تطبيق الجزء المتأثر؛ الصمت وطلب تنفيذ ميزة ليسا إذنًا بتغيير المعمارية. اتبع إجراء الموافقة في `docs/architecture.md`.

### UI implementation

قبل تعديل مكوّن أو CSS أو مراجعة تطابق واجهة، اقرأ `docs/ui-components.md`: هو المرجع الموحد لملكية التنسيق والأبعاد والحالات والطبقات والحركة. عدّل المظهر عند مالكه المشترك، وشغّل `npm run check:ui-styles`؛ لا تضف override في ميزة لتجاوز مكوّن مشترك. أثبت القياسات والمطابقة بالمتصفح باللغتين والمقاسات المطلوبة، ولا تعتبر اختبارات الوظائف وحدها تدقيقًا بصريًا.

Before implementing or changing any screen, read `docs/ui-contract.md`, `DESIGN.md`, and the relevant screen reference. `login-preview.html` is the user-approved login visual baseline. Follow its refined neutral borders, Lucide icons, autofill treatment, and bilingual behavior. Implement screen content against the backend contract in `docs/ui-contract.md`; distinguish approved scope from proposals. Verify the complete UI-to-API flow and both languages before closing a ticket. Report blocked visual verification honestly.

### UI primitives

بقرار المستخدم في 2026-11-04، Radix Primitives معيار عام للمكونات القديمة والحالية والمستقبلية. قبل إضافة تفاعل أو تعديل مكوّن واجهة، اقرأ `docs/ui-primitives.md` واستخدم primitive المناسبة من خلال `client/ui`، مع الحفاظ على التصميم المعتمد. تبقى عناصر HTML الأصلية حين لا يوجد بديل في Primitives؛ تحقق فعليًا من لوحة المفاتيح واللغتين ولا تعتبر المكتبة وحدها إثباتًا للوصول.

### Issue tracker

تُحفظ المهام محليًا. راجع `docs/agents/issue-tracker.md`.

### Triage labels

تُستخدم حالات التصنيف الافتراضية. راجع `docs/agents/triage-labels.md`.

### Domain docs

المشروع ذو مجال واحد. راجع `docs/agents/domain.md`.

### Frontend state migration

قبل متابعة انتقال حالة الواجهة، اقرأ `docs/frontend-state.md` و`.scratch/frontend-state-migration/map.md`؛ الفهرس يربط الحالة الحالية والتذاكر وأدلة التحقق، بينما سجلات الحوار والتسليمات المؤرخة تاريخية.

### Frontend engineering skills

بقرار المستخدم في2026-11-04، استخدم `vercel-react-best-practices` من `vercel-labs/agent-skills` عند كتابة أو مراجعة أو إعادة تنظيم React، واستخدم `codebase-design` من `mattpocock/skills` لتصميم مسؤوليات الموديولات وواجهاتها واعتمادياتها. النسختان المباشرتان مثبتتان في مجلد مهارات Codex. طبّق القواعد المناسبة لـReact/Vite ضمن القرارات المعتمدة للمشروع، واقرأ ملف SKILL.md والقواعد ذات الصلة قبل العمل.

### Frontend architecture

قبل تعديل تنظيم الواجهة أو اعتمادياتها، اقرأ `docs/frontend-architecture.md` والتزم بتنظيم app/features/shared وواجهات الميزات وفحصها.
