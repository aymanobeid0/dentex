# مقترح محدد لتوافق محلل اعتماديات الواجهة

التاريخ:2026-11-12. الحالة: مقترح ينتظر إذن المستخدم؛ لم يتغير إعداد الفحص المعتمد.

الحزمة المعتمدةreact-router8.5.1 تعلن مداخلها العامة عبرpackage.json.exports وحدها دونmain. Node وTypeScript وVite يحلونها ويعمل المتصفح، بينماdependency-cruiser18.7.2 يضعexportsFields:[] افتراضيًا للتوافق التاريخي معenhanced-resolve4، فيعطيno-unresolved كاذبًا للمداخل العامةreact-router وreact-router/dom. مرجع المكتبة المثبتة:`node_modules/dependency-cruiser/src/main/resolve-options/normalize.mjs:29–35`، وقالبها الرسمي`src/cli/init-config/config-template.mjs:305–309`.

التعديل المقترح الوحيد في`.dependency-cruiser.frontend.cjs`، داخلoptions.enhancedResolveOptions وبجانبextensions الحالية:

```js
exportsFields: ['exports'],
conditionNames: ['import', 'default'],
```

يبقىforbidden كاملًا دون تعديل، بما فيهno-unresolved ومنع الدورات وحدودapp/features/shared/ui وواجهات الميزات. لاignore أواستثناءحزمةأوتعطيلفحص أووصوللداخليةميّزة. لا تعديللفحصالخادمأوآليةالبياناتأوقاعدةالتطوير.

استخدم ملف مقترح مؤقت خارج إعداد المشروع لإثبات الأثر: اجتازclient الحقيقي106وحدات/343اعتمادًا، واستمر رفضأمثلةالمخالفاتالسبعة نفسها معالإعدادالحالي والمقترح، وبقيمدخلexports مجهولمرفوضًا فيكليهما؛ المداخل العامة للموجّه وحدهاانتقلتمنالرفضالكاذبإلىالحل. هذا إثبات للمقترح، لا نجاح للأمر المعتمد قبل تطبيقه بإذن.

الأدلة المصطنعة الخارجية في`C:/Users/ayman/.codex/visualizations/2026/11/11/01a1cc30-3670-7001-baeb-d1c07b6fcd6c/`:02-resolver-proof.json و02-resolver-proof.mjs و02-resolver-proposal.cjs. البديل دون تغيير الإعداد هو بقاء02 غير مجتازة لفحص الاعتماديات؛ لا خفض إصدارالموجّهالمعتمدأووارداتداخليةغيرعامةلإسكاتالفحص.

يُطلب الإذن لأنAGENTS.md وdocs/architecture.md يحصران تغيير نهج الفحص وقواعده بالمستخدم نفسه. عند الموافقة يسجل القرار المحدد في المرجع قبل تطبيقه، ثم يعاد الأمر المعتمد وأمثلة الرفض دون تخفيف.
