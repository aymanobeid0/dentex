# تحقق مصدر المكتبة قبل التثبيت — 2026-11-11

تحقق المنسق للقراءة فقط من [سجل React Router الرسمي](https://reactrouter.com/changelog) و[تثبيت نمط البيانات](https://reactrouter.com/start/data/installation) و[useBlocker](https://reactrouter.com/api/hooks/useBlocker). الإصدار المعتمد8.5.1 ظاهر في السجل؛ النمط يستخدم createBrowserRouter منreact-router وRouterProvider منreact-router/dom. يثبت الموجّه خارج شجرةReact دون حالة موجّه موازية. proceed يكمل المحاولة المحظورة نفسها وreset يلغيها؛ تحذير إعادة التحميل منفصل.

أعاد `npm view react-router@8.5.1 version engines peerDependencies dist.integrity --json` من السجل الرسمي:

- version:8.5.1؛ Node>=22.22.0.
- React وReactDOM>=19.2.7؛ أنواعReact وReactDOM>=19.2.0.
- integrity:`sha512-5u1eQ46QjuXjNfEnLwzrnou1Bm5dquO3xjVYkkMYCudtkicD2AQHtx+fvXzPATtPJx8TW6DR1x1TDRqsfHyZBw==`.

هذه قراءة لمتطلبات الإصدار، وليست إثبات توافق التطبيق أو الصورة. يثبت منفذ02 الإصدار في الحزمة والقفل ويتحقق من النسخ الفعلية ومتطلباتengines، ثم يثبت03 بناء الإنتاج ونسخةNode في الصورة. لا ترقية لحزم غير لازمة، ولا استنتاج توافق من نطاقاتpackage.json وحدها.
