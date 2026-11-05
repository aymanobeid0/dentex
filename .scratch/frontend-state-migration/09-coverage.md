# تغطية قصص انتقال الحالة44 — 2026-11-05

هذا الربط مقابل [المواصفة المعتمدة](../frontend-state/spec.md)، لا يضيف نطاقًا. الاختبارات عند الشاشة وHTTP، ونتائجها النهائية وأدلة المتصفح وحدودها في [تحقق09](09-verification.md). الجداول تصف السلوك المثبت؛ فحص المستخدم قبلPR يبقى منفصلًا عن تحقق الوكيل.

| القصة | السلوك | الدليل الأساسي |
| --- | --- | --- |
| 1 | تحميل قائمة المرضى فور فتحها | [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [patient-search-ui](../../tests/client/patient-search-ui.test.tsx) |
| 2 | انتظار300ms بعد آخر كتابة | [patient-live-search](../../tests/client/patient-live-search.test.tsx) |
| 3 | Enter والبحث الفوري بلا طلب مؤجل مكرر | [patient-live-search](../../tests/client/patient-live-search.test.tsx) |
| 4 | مسح البحث فوريًا | [patient-live-search](../../tests/client/patient-live-search.test.tsx) |
| 5 | تجاهل الرد وJSON القديمين | [patient-live-search](../../tests/client/patient-live-search.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx) |
| 6 | انتظار اكتمال تركيب النصIME | [patient-live-search](../../tests/client/patient-live-search.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx) |
| 7 | بقاء تركيز البحث أثناء التحديث | [patient-live-search](../../tests/client/patient-live-search.test.tsx)، أدلة متصفح02/03 |
| 8 | العودة من الملف ببحث فارغ وصفحة أولى | [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، دورة متصفح09 |
| 9 | ربط البحث بصفحاته وعدم خلط القوائم | [patient-search-ui](../../tests/client/patient-search-ui.test.tsx)، [patients HTTP](../../tests/patients.test.ts) |
| 10 | تحديث المعروض دوريًا | [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [role-conflicts](../../tests/client/role-conflicts.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx)، متصفح09 |
| 11 | إعادة التحقق عند العودة والاتصال | [session-ui](../../tests/client/session-ui.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [clinics-navigation](../../tests/client/clinics-navigation.test.tsx) |
| 12 | وقفpolling عند الإخفاء أو مغادرة الشاشة | [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx)، متصفح09 |
| 13 | قراءة المحمل فقط عند الانقطاع | [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [employee-conflicts](../../tests/client/employee-conflicts.test.tsx) |
| 14 | تنبيه الانقطاع أو قدم البيانات | [session-ui](../../tests/client/session-ui.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx) |
| 15 | تمييز الفراغ عن فشل القراءة أو رفضها | [patient-search-ui](../../tests/client/patient-search-ui.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx) |
| 16 | retry محدود للمؤقت دون الأخطاء الدائمة | [session-ui](../../tests/client/session-ui.test.tsx)، [patient-query-ui](../../tests/client/patient-query-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx) |
| 17 | حفظ المسودة عند تحديث الأصل والهوية | [role-conflicts](../../tests/client/role-conflicts.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، [patient-registration](../../tests/client/patient-registration.test.tsx) |
| 18 | تنبيه تغير أصل الموظف | [employee-conflicts](../../tests/client/employee-conflicts.test.tsx)، [عقد04](04-contract.md) |
| 19 | رفض تحرير موظف بإصدار قديم | [employees HTTP](../../tests/employees.test.ts)، متصفح04 |
| 20 | وحدة إصدار بيانات الموظف وإسناد أدواره | [employees HTTP](../../tests/employees.test.ts)، [عقد04](04-contract.md) |
| 21 | حماية مجموعة منح الدور | [role-permissions HTTP](../../tests/role-permissions.test.ts)، [role-conflicts](../../tests/client/role-conflicts.test.tsx) |
| 22 | بقاء مسودة التعارض ومراجعة صريحة | [employee-conflicts](../../tests/client/employee-conflicts.test.tsx)، [role-conflicts](../../tests/client/role-conflicts.test.tsx)، متصفح04/05 |
| 23 | فحص ذري عند لحظة الكتابة | [employees HTTP](../../tests/employees.test.ts)، [role-permissions HTTP](../../tests/role-permissions.test.ts) بكتابتين من الإصدار نفسه |
| 24 | البقاء أو التجاهل عند المغادرة | [patient-registration](../../tests/client/patient-registration.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، [clinics-navigation](../../tests/client/clinics-navigation.test.tsx)، متصفح08/09 |
| 25 | beforeunload ضمن حدود المتصفح | [patient-registration](../../tests/client/patient-registration.test.tsx)، [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، [account-password](../../tests/client/account-password.test.tsx) |
| 26 | انتهاءdirty بعد النجاح أو التجاهل | [patient-registration](../../tests/client/patient-registration.test.tsx)، [employee-conflicts](../../tests/client/employee-conflicts.test.tsx)، [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، [account-password](../../tests/client/account-password.test.tsx) |
| 27 | تأكيد الخادم قبل النجاح | [patient-registration](../../tests/client/patient-registration.test.tsx)، [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، [state-integration](../../tests/client/state-integration.test.tsx) |
| 28 | تحديث القائمة وفتح ملف المريض بعد تسجيله | [patient-registration](../../tests/client/patient-registration.test.tsx)، دورة متصفح09 |
| 29 | تحديث الموظفين والأدوار بعد الحفظ | [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، [role-ui](../../tests/client/role-ui.test.tsx)، متصفح04–06 |
| 30 | نتيجة رد الحفظ المفقود غير مؤكدة | [patient-registration](../../tests/client/patient-registration.test.tsx)، [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، متصفح03–08 |
| 31 | لا إعادة كتابة تلقائية أو مؤجلة | [session-ui](../../tests/client/session-ui.test.tsx)، [state-integration](../../tests/client/state-integration.test.tsx)، اختبارات فقد الرد في بقية الميزات |
| 32 | المدير النشط والتفويض والعزل | [account-lifecycle HTTP](../../tests/account-lifecycle.test.ts)، [employees HTTP](../../tests/employees.test.ts)، [role-permissions HTTP](../../tests/role-permissions.test.ts)، [clinic-administrators HTTP](../../tests/clinic-administrators.test.ts) |
| 33 | عزل بيانات المستخدم والعيادة | [session-ui](../../tests/client/session-ui.test.tsx)، [clinic-login HTTP](../../tests/clinic-login.test.ts)، [patients HTTP](../../tests/patients.test.ts) |
| 34 | مسح الجلسة وإلغاء الردود القديمة | [session-ui](../../tests/client/session-ui.test.tsx)، [clinics-navigation](../../tests/client/clinics-navigation.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، متصفح09 |
| 35 | لا تخزين دائم للمجال أو الأسرار | حصر09 ومراجعة المصدر؛ [session-ui](../../tests/client/session-ui.test.tsx)، [clinics-navigation](../../tests/client/clinics-navigation.test.tsx)، متصفح09 يفحص مفاتيحlocalStorage |
| 36 | حفظ اللغة فقط | [session-ui](../../tests/client/session-ui.test.tsx)، [translations](../../tests/client/translations.test.ts)، متصفح09 |
| 37 | AR/FR وRTL/LTR | [ui-primitives](../../tests/client/ui-primitives.test.tsx)، [login-ui](../../tests/client/login-ui.test.tsx)، [account-password](../../tests/client/account-password.test.tsx)، المتصفح باللغتين |
| 38 | التركيز ولوحة المفاتيح وRadix | [ui-primitives](../../tests/client/ui-primitives.test.tsx)، متصفح04–09 وقيود قارئ الشاشة أدناه |
| 39 | دورة العيادات ومديريها | [clinics-query-ui](../../tests/client/clinics-query-ui.test.tsx)، [clinic HTTP](../../tests/clinic.test.ts)، [clinic-administrators HTTP](../../tests/clinic-administrators.test.ts)، متصفح07/09 |
| 40 | دورة الموظف وأدواره وحالته | [employees HTTP](../../tests/employees.test.ts)، [employee-conflicts](../../tests/client/employee-conflicts.test.tsx)، [employee-lifecycle-ui](../../tests/client/employee-lifecycle-ui.test.tsx)، متصفح04/06/09 |
| 41 | تغيير كلمة المرور وإبطال الجلسات | [account-lifecycle HTTP](../../tests/account-lifecycle.test.ts)، [account-password](../../tests/client/account-password.test.tsx)، متصفح08 |
| 42 | ملكيةQuery والحالة المحلية وحدود الميزات | [الحصر](09-inventory.md)، [قرار الحالة](../../docs/frontend-state.md)، فحصا المعمارية والمراجعتان |
| 43 | تنفيذ متتابع وفحص محلي قبلPR | حفظ08 مستقلًا02d8c73، ثم09؛check:dev ودليل التسليم، وفحص المستخدم ما زال مطلوبًا قبلPR |
| 44 | حفظ قاعدة التطوير والحسابات | جميعfixtures علىdentex_test الجديدة؛check:dev يفحصdev للقراءة فقط؛ تنظيف الحاوية والعملية المملوكتين فقط |

لا تعني التغطية ضمانًا للاتصال أو منع التكرار أو الإغلاق القسري. لا قارئ شاشة فعلي أو هاتف مادي، ولا تخزين دائم/offline write أوSSE/WebSocket أو ميزات مجال جديدة. حالات التزامن مثبتة فيHTTP الحقيقي، والواجهة تختبر عرضها؛ jsdom وحده لا يثبت ذرية الخادم. نتائج وأوقات فحوص المتصفح التاريخية لا تُنسب إلى تشغيل09؛ أدلة09 تميز ما أُعيد فعلًا.
