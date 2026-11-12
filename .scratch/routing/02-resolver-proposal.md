# مقترح محدد لتوافق محلل اعتماديات الواجهة

التاريخ: 2026-11-12. الحالة: مقترح ينتظر إذن المستخدم؛ لم يتغير إعداد الفحص المعتمد.

الحزمة المعتمدة `react-router@8.5.1` تعلن مداخلها العامة عبر `package.json.exports` وحدها دون `main`. تحلها Node وTypeScript وVite ويعمل المتصفح، بينما يضع `dependency-cruiser@18.7.2` القيمة `exportsFields: []` افتراضيًا للتوافق التاريخي مع enhanced-resolve 4. ينتج عن ذلك خطأ `no-unresolved` للمداخل العامة `react-router` و`react-router/dom`. مرجع المكتبة المثبتة: `node_modules/dependency-cruiser/src/main/resolve-options/normalize.mjs:29–35`، وقالبها الرسمي `src/cli/init-config/config-template.mjs:305–309`.

التعديل المقترح الوحيد في `.dependency-cruiser.frontend.cjs`، داخل `options.enhancedResolveOptions` وبجانب `extensions` الحالية:

```js
exportsFields: ['exports'],
conditionNames: ['import', 'default'],
```

يبقى `forbidden` كاملًا دون تعديل، بما فيه `no-unresolved` ومنع الدورات وحدود app/features/shared/ui وواجهات الميزات. لا إضافة إلى ignore أو استثناء لحزمة أو تعطيل فحص أو وصول إلى داخلية ميزة. لا تعديل لفحص الخادم أو آلية البيانات أو قاعدة التطوير.

استُخدم ملف مقترح مؤقت خارج إعداد المشروع لإثبات الأثر: اجتاز client الحقيقي (106 وحدات و343 اعتمادًا)، واستمر رفض أمثلة المخالفات السبعة نفسها مع الإعداد الحالي والمقترح، وبقي مدخل exports مجهول مرفوضًا في كليهما. المداخل العامة للموجّه وحدها انتقلت من الرفض الكاذب إلى الحل. هذا إثبات للمقترح، وليس نجاحًا للأمر المعتمد قبل تطبيقه بإذن.

الأدلة المصطنعة الخارجية في `C:/Users/ayman/.codex/visualizations/2026/11/11/01a1cc30-3670-7001-baeb-d1c07b6fcd6c/`: الملفات `02-resolver-proof.json` و`02-resolver-proof.mjs` و`02-resolver-proposal.cjs`. البديل دون تغيير الإعداد هو بقاء02 غير مجتازة لفحص الاعتماديات؛ لا خفض لإصدار الموجّه المعتمد أو استخدام لواردات داخلية غير عامة لإسكات الفحص.

يُطلب الإذن لأن AGENTS.md وdocs/architecture.md يحصران تغيير نهج الفحص وقواعده بالمستخدم نفسه. عند الموافقة يسجل القرار المحدد في المرجع قبل تطبيقه، ثم يعاد الأمر المعتمد وأمثلة الرفض دون تخفيف.
