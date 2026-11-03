# Staging على Dokploy — نشر يدوي

النطاق المعتمد: `https://dentex.itlabservice.com`. طلب المستخدم أن ينتهي CI أولًا، ثم يضغط هو Deploy من داخل Dokploy. لا يوجد webhook للنشر أو بناء صور أو نشر تلقائي داخل CI.

## الملفات

- `Dockerfile`: مراحل اعتماديات وتوليد Prisma وبناء التطبيق، وصورة migrations منفصلة، وصورة runtime باعتماديات الإنتاج فقط وبمستخدم node.
- `.dockerignore`: سياق بناء محدود بمدخلات التطبيق؛ لا .env أو .git أو node_modules أو odontogram أو الوثائق والصور المرجعية.
- `compose.staging.yaml`: تطبيق وPostgreSQL منفصلة عن التطوير، مع volume دائم باسم يحدد مشروع Compose نطاقه. لا منفذ منشور للتطبيق أو قاعدة البيانات؛ الاتصال العام عبر Traefik وHTTPS فقط.
- `.env.staging.example`: أسماء المتغيرات المطلوبة، دون أسرار حقيقية.

الاستضافة تبقى التطبيق الموحد المعتمد نفسه؛ التعديل البرمجي الوحيد هو السماح بـHOST في نقطة التشغيل. الافتراضي المحلي 127.0.0.1 محفوظ، والصورة تستخدم 0.0.0.0 داخل الحاوية حتى يصل إليها الوكيل العكسي.

## إعداد Dokploy مرة واحدة

1. أنشئ مشروعًا أو Environment باسم staging، ثم خدمة **Docker Compose** مرتبطة بالمستودع `aymanobeid0/dentex` وبالفرع الذي سيحمل التغييرات المعتمدة (main حاليًا). اختر ملف `compose.staging.yaml` من جذر المستودع. استخدم Compose لا Stack؛ الإعداد يعتمد على build وشروط اكتمال الترحيلات.
2. **عطل Auto Deploy** للمصدر، ولا تنشئ webhook للنشر. لا تضغط Deploy حتى تنجح نتيجة Verify للـcommit نفسه على GitHub؛ النشر اليدوي لا يفرض هذا الشرط تلقائيًا.
3. في Environment أضف STAGING_DB_PASSWORD وSTAGING_JWT_SECRET بقيم عشوائية مستقلة، 32 بايت لكل قيمة بصيغة hex (64 محرفًا). لا تستخدم كلمات مرور التطوير. صيغة hex تتجنب مشاكل محارف كلمات المرور داخل DATABASE_URL. متغير STAGING_TRUST_PROXY اختياري كما هو موضح أدناه.
4. في Domains اختر service **app** ومنفذ الحاوية **3000** ومسار **/**، والنطاق **dentex.itlabservice.com**، وفعّل HTTPS مع Let's Encrypt وإعادة توجيه HTTP إلى HTTPS. لا تضف نطاقًا لخدمة database أو migrate.
5. وجّه سجل A للنطاق إلى عنوان VPS. إذا وجد سجل AAAA فتأكد أنه يصل للخادم نفسه، وافتح منافذ 80 و443 للوكيل العكسي. تأكد من DNS ومن إصدار الشهادة قبل اختبار الدخول لأن Cookie محمية بـSecure.
6. استخدم Isolated Deployments في Dokploy. راجع Preview Compose: يجب أن يصل app إلى شبكة خاصة مشتركة مع database وmigrate، وأن يصل Traefik إلى شبكة app. Dokploy يضيف شبكة التوجيه والـlabels عند ربط النطاق؛ لا تنشئ منافذ مضيف عامة كبديل.

يمكن توليد كل سر في طرفية موثوقة بـ`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`، ثم لصقه مباشرة في إعداد Dokploy؛ لا ترسله للمحادثة أو تلتزم به في Git. يحتفظ Dokploy بقيم Environment في ملفه الخاص ويحقن Compose المتغيرات المحددة صراحة في الحاويات.

## النشر والتحديث

بعد نجاح CI، اضغط Deploy يدويًا. يبدأ database ويجتاز pg_isready؛ ثم ينفذ migrate أمر Prisma migrate deploy؛ ويبدأ app بعد نجاحه. فشل الترحيلات يمنع تشغيل الإصدار الجديد. لا db push أو reset أو seeding تلقائي، ولا ينسخ هذا الإعداد بيانات التطوير إلى staging.

عند كل تحديث اسحب الـcommit الذي نجح فحصه ثم انشره يدويًا. احتفظ بـvolume قاعدة البيانات؛ تجنب حذف volume أو تغيير اسم مشروع Compose لأنه يحدد مساحة تخزين staging. الترحيلات المطبقة مسجلة في القاعدة؛ migrate deploy لا يعيد تطبيقها. تغيير ملفات الترحيلات يغير صورة migrate ويجعلها تنفذ قبل app في التحديث التالي.

شاشة الدخول متاحة بعد جاهزية app؛ لا يوجد تسجيل عام. أنشئ مدير برنامج staging مرة واحدة باستخدام السكربت الموجود `npm run admin:production` داخل صورة app. مرر متغيرات PLATFORM_ADMIN_USERNAME وPLATFORM_ADMIN_EMAIL وPLATFORM_ADMIN_PASSWORD إلى عملية الأمر فقط عبر جلسة طرفية موثوقة؛ لا تضع كلمة المرور كنص في وسيطات الأمر أو Dockerfile. لا تعِد تشغيل السكربت على الحساب نفسه إلا إذا قصدت تحديثه وإبطال رموزه. بعد ذلك أنشئ عيادات وموظفين وهميين من الواجهة لاختبار التدفقات.

## الوكيل العكسي والمراقبة

الافتراضي STAGING_TRUST_PROXY فارغ، أي لا يثق Express بأي peer. للدقة في حد محاولات الدخول خلف Traefik، حدد عنوان Traefik الفعلي أو CIDR مخصصًا للوكيل فقط بعد معاينة شبكة النشر؛ لا true أو hop count أو جميع الشبكات الخاصة. تأكد أن الوكيل يستبدل X-Forwarded-For وأن الوصول إلى app محصور بشبكة النشر. عند تغير عنوان الوكيل حدّث هذا المتغير. لا يغير Dockerfile قواعد الثقة الحالية.

Healthcheck للصورة يفحص استجابة HTTP للواجهة، ولا يدعي فحص اتصال القاعدة أثناء كل طلب. قاعدة البيانات لها فحصها المنفصل عند بدء التشغيل. راجع logs لخدمات database وmigrate وapp من Dokploy إذا تعذر الدخول أو ظهور البيانات.

## سرعة CI والبناء

CI يثبت الحزم مرة واحدة مع cache npm، ويولد Prisma ويهيئ قاعدة الاختبار، ثم يشغل البناء وفحص المعمارية بالتوازي، وبعدهما الاختبارات الكاملة ومانع التخطي. تُلغى تشغيلات commits الأقدم على الفرع نفسه. لم تُحذف فحوص أو اختبارات، ولا تشغيل لاختبارات قاعدة البيانات أثناء docker build على VPS.

Docker يفصل package-lock عن الكود للاستفادة من cache الاعتماديات، ويستخدم cache تنزيلات npm، ويولد Prisma في طبقة تعتمد على المخطط فقط، ثم يبني التطبيق. صورة migrations لا تعتمد على تغييرات الواجهة؛ وصورة runtime تستبعد أدوات البناء والاختبار وPrisma CLI. أول بناء بارد يحتاج تنزيل الصورة والحزم؛ التحسين الأساسي للتحديثات اللاحقة. اترك Build Cache مفعّلًا في Dokploy ولا تستخدم --no-cache للتحديث العادي. زمن GitHub الفعلي وVPS يعتمد على مواردهما والشبكة؛ القياسات المحلية ليست وعدًا بزمن مطابق.

## مصادر التشغيل

- [Dokploy Compose](https://docs.dokploy.com/docs/core/docker-compose) و[Domains](https://docs.dokploy.com/docs/core/docker-compose/domains) و[Isolated Deployments](https://docs.dokploy.com/docs/core/docker-compose/utilities).
- [ترتيب بدء خدمات Compose](https://docs.docker.com/compose/how-tos/startup-order/) و[Docker build cache](https://docs.docker.com/build/cache/optimize/).

تفاصيل التحقق المنفذ محليًا وحدود عدم النشر على VPS تُسجل في `.scratch/staging/spec.md` وملف التسليم في جذر المشروع. لا يعني وجود هذه الملفات تشغيل staging على السيرفر.
