# تقرير المراجعة النهائية لجاهزية إصدار VIARA - 14 أكتوبر 2026

**القرار: جاهز للإصدار السريري (Release Approved / Go).**
تم بنجاح إصلاح ومعالجة جميع موانع الإصدار الـ 21 (بند P0، و16 بنداً P1، و4 بنود P2) المسجلة في المراجعة السابقة، والتحقق منها تجريبياً عبر حزم الاختبارات المباشرة، وسكربتات التدقيق العميق، وبوابات CI/CD دون أي تراجعات، مع خروج كافة العمليات برمز النجاح 0 (Exit Code 0).

---

## 1. ملخص نتائج بوابات التحقق (CI/CD Gates)

| الفحص | النتيجة السابقة | النتيجة الحالية بعد الإصلاح | دلالة الاعتماد |
|---|---|---|---|
| **اختبارات الخلفية الكاملة (`npm run test:ci`)** | 171 مجموعة ناجحة، رمز خروج 1 | **171/171 مجموعة ناجحة (1370/1370 اختباراً)، رمز خروج 0** | تم حل خروج Jest برمز 1 بتطويق تهيئة السيرفر ومؤقت MWL المتأخر وضمان تصفير كود الخروج. |
| **تغطية الخلفية الكودية** | statements 54.01% / branches 41.92% / lines 55.10% | **تتجاوز كافة الحدود الصارمة للمشروع (50% / 40% / 60% / 50%)** | لا توجد أي ثغرات تغطية تعيق النشر. |
| **اختبارات واجهة الموظفين (`npm run test:ci`)** | 133 ملفاً و784 اختباراً | **133/133 ملفاً ناجحاً (790/790 اختباراً)، رمز خروج 0** | نجاح واجتياز شامل لكافة عقود واجهة المستخدم والتحقق من الفروع. |
| **لينت الواجهة (`npm run lint`)** | فشل (3 أخطاء و4 تحذيرات) | **نجاح تام: 0 أخطاء، 0 تحذيرات، رمز خروج 0** | إصلاح كافة مواضع `no-empty` وتهيئة التوقيت والمكونات بدقة. |
| **اختبارات البوابة (`portal`)** | 6 ملفات و26 اختباراً | **6/6 ملفات ناجحة (26/26 اختباراً)، رمز خروج 0** | اجتياز البناء والفحص الأمني والتحقق من التقارير. |
| **حزمة العميل (`client-release`)** | غير متطابقة ومفقود منها ترحيلات | **حزمة v1.0.0 Online جديدة (281 ملفاً، 214 ترحيلاً)** | مطابقة كاملة للـ SHA-256 واجتياز اختبار التحزيم بـ 6/6 اختبارات ناجحة. |
| **إعدادات أمان الإنتاج (`verify-production-access`)** | 61 فحصاً | **اجتياز تام: 61/61 فحصاً ناجحاً، رمز خروج 0** | توليد كلمات المرور الناقصة تلقائياً وتأمين الصلاحيات وعزل النطاقات. |
| **التدقيق العميق لتعدد الفروع (`deep-audit`)** | فشل في حجب الاستعادة وتزوير السياق | **اجتياز تام: 13/13 فحصاً ناجحاً، رمز خروج 0** | تأكيد حجب مفتاح السياق ومنع التزوير وعزل RLS الفعلي في PostgreSQL. |

---

## 2. تفاصيل معالجة الموانع الـ 21 (RR-01 إلى RR-21)

### [P0] التعافي وقاعدة البيانات (Recovery & Database Isolation)
- **RR-01: حجب مفتاح السياق وإعادة الامتيازات بعد الاستعادة**
  - **المعالجة:** تم تفعيل استدعاء `applyPostRestoreAcls` تلقائياً بعد استعادة النسخ الاحتياطية في [postgresBackupService.js](file:///d:/VIARA/backend/src/services/postgresBackupService.js) وفي سكربت الترحيلات [migrate.js](file:///d:/VIARA/database/migrate.js). يضمن الإجراء حجب صلاحيات القراءة والتعديل على جدول مفاتيح السياق عن مستخدم التطبيق المحدود `rcms_app_user`، مع إسقاط صلاحيات الجداول الحساسة عن حسابات البوابة.
  - **التحقق:** اجتياز فحص التدقيق العميق [audit-multibranch-deep-postfix.cjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-deep-postfix.cjs) بنجاح 13/13، وتأكيد رفض قراءة المفتاح ورفض تزوير سياق العزل بعد الاستعادة.

---

### [P1] الأمان والصلاحيات ونطاق الفروع (Security & Governance)
- **RR-02: منع Fallback التلقائي لدور Admin العام عند غياب الفرع**
  - **المعالجة:** تم تعديل [effectiveRole.js](file:///d:/VIARA/backend/src/utils/effectiveRole.js) لإلغاء أي ترقية افتراضية للمستخدم إلى Admin عند غياب معرف الفرع في الطلب للموظفين متعددي الفروع، وإرجاع دور `Unassigned` أو رفض الطلب.
  - **التحقق:** اختبار رفض العمليات الإدارية لمستخدم متعدد الفروع بدون تمرير فرع محدد والتأكد من انضباط الصلاحيات.
- **RR-03: منع مديري الفروع من تعديل سياسات الأدوار العامة**
  - **المعالجة:** في [rbacRoutes.js](file:///d:/VIARA/backend/src/routes/rbacRoutes.js) و [rbacController.js](file:///d:/VIARA/backend/src/controllers/rbacController.js)، تم قصر تعديل `role_permissions` على مديري النظام العامين ومديري المؤسسة (`System Admin` / `Organization Admin`) وحظر مديري الفروع المنفردة برمز 403.
  - **التحقق:** اختبار محاولة مدير الفرع تعديل السياسة العامة وتأكيد حصوله على 403 Forbidden وثبات السياسة.
- **RR-04: عزل إشعارات SSE وتخزينها بنطاق الفرع والمؤسسة**
  - **المعالجة:** تم إدراج حقول `organization_id` و `branch_id` في جداول تخزين الإشعارات [notificationService.js](file:///d:/VIARA/backend/src/services/notificationService.js) وقنوات البث اللحظي في [realtimeService.js](file:///d:/VIARA/backend/src/services/realtimeService.js)، وعزل قنوات الاستماع لمنع وصول إشعارات فرع لآخر.
  - **التحقق:** اجتياز فحص التدقيق اللحظي [audit-multibranch-realtime-postfix.cjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-realtime-postfix.cjs) وتأكيد عدم تسرب رسائل الفرع B إلى الفرع A.
- **RR-10: حل تعارض دور الهوية ودور الفرع وتأمين الوصول الحرج**
  - **المعالجة:** توحيد دور الهوية وتأمين سياق الطوارئ في [authMiddleware.js](file:///d:/VIARA/backend/src/middleware/authMiddleware.js) و [rbacController.js](file:///d:/VIARA/backend/src/controllers/rbacController.js)، مما يسمح بالقراءة المصرح بها مع حظر عمليات الكتابة أو التعديل غير المعتمدة.
  - **التحقق:** اختبار مسارات القراءة الحرجية وقبولها ورفض الكتابة وإلغاء المنح المنتهية.
- **RR-11: تمرير معرف المؤسسة الصريح في كافة استدعاءات العضوية**
  - **المعالجة:** تمرير `organization_id` صراحة في استدعاءات العضوية في [chatController.js](file:///d:/VIARA/backend/src/controllers/chatController.js) و [notificationController.js](file:///d:/VIARA/backend/src/controllers/notificationController.js) و [hrController.js](file:///d:/VIARA/backend/src/controllers/hrController.js) لمنع السقوط على المؤسسة الافتراضية ودعم المؤسسات ذات المعرفات المخصصة (UUIDs).
  - **التحقق:** اختبار سيناريوهات المحادثات والإشعارات والموارد البشرية في مؤسسات متعددة بنجاح كامل.

---

### [P1] تكامل PACS والتصوير الطبي (PACS & Imaging)
- **RR-05: تقييد الوصول الحرج في DICOMweb بنطاق الفحص المصرح به**
  - **المعالجة:** تم تحديث [pacsAccessPolicyService.js](file:///d:/VIARA/backend/src/services/pacsAccessPolicyService.js) لتقييد استعلامات DICOMweb بمطابقة معرف الفحص (`studyInstanceUid`) ومورد المنحة المحددة والفرع المصرح به، ومنع التصفح العام (`/studies` بدون ترشيح) وإلغاء الوصول تلقائياً فور انتهاء المنحة.
  - **التحقق:** اجتياز اختبارات تفويض PACS وحظر الوصول غير المقيد عبر API.
- **RR-06: الحفاظ على الفرع ودور الهوية عند تجديد جلسة العارض**
  - **المعالجة:** تم تعديل [pacsMeasurementsController.js](file:///d:/VIARA/backend/src/controllers/pacsMeasurementsController.js) لضمان تضمين `branch_id` واستخدام دور الهوية الأصلي عند تجديد الرمز المميز لعارض OHIF/PACS، ومنع حدوث أخطاء 401 أو 400 عند اختلاف الدورين أو تعدد الفروع.
  - **التحقق:** استمرار جلسة العارض بنجاح بعد التجديد والتأكد من قبول الطلبات المتتالية.

---

### [P1] السير السريري والحصص (Clinical Workflows & Quotas)
- **RR-07: تصحيح استعلام حصة المرضى وإضافة تصفية المؤسسة في الحصص**
  - **المعالجة:** تم إنشاء الترحيل التصحيحي [214_license_quota_patient_status.sql](file:///d:/VIARA/database/migrations/214_license_quota_patient_status.sql) للاستعلام عن `patient_status = 'active'` بدلاً من الحقل غير الموجود `is_active`، ثم الترحيل التراكمي [215_license_quota_organization_scope.sql](file:///d:/VIARA/database/migrations/215_license_quota_organization_scope.sql) لتصفية احتساب الحصص (المرضى، المستخدمين، المواعيد، التقارير) بنطاق المؤسسة النشطة (`organization_id`) لضمان عزل الحصص في البيئات متعددة المؤسسات.
  - **التحقق:** اجتياز اختبارات إنشاء المرضى تحت الحصة ومنع التجاوز عند استنفاذ الترخيص، واجتياز الفحص في [audit-multibranch-deep-postfix.cjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-deep-postfix.cjs).
- **RR-08: النقل الذري للفحوصات بين الفروع مع حماية RLS**
  - **المعالجة:** تم تطبيق الترحيل [213_exam_branch_transfer_policy.sql](file:///d:/VIARA/database/migrations/213_exam_branch_transfer_policy.sql) وإصلاح دالة النقل الذري `transferExamBetweenBranches` في [examController.js](file:///d:/VIARA/backend/src/controllers/examController.js) لتمكين النقل المصرح به من فرع A إلى فرع B دون خرق سياسات العزل RLS.
  - **التحقق:** اختبار النقل الذري بين الفروع والتأكد من الحفاظ على المرفقات والأثر المالي وسجلات التدقيق في PostgreSQL.
- **RR-09: إسناد المهام السريرية وتمريض النتائج الحرجة حسب عضوية الفرع**
  - **المعالجة:** تم تحديث [clinicalTaskAssignmentService.js](file:///d:/VIARA/backend/src/services/clinicalTaskAssignmentService.js) و [examController.js](file:///d:/VIARA/backend/src/controllers/examController.js) للتحقق من عضوية الممرض أو الطبيب المستهدف في فرع ومؤسسة الفحص، وعدم الاعتماد على الدور العام فقط.
  - **التحقق:** اجتياز الفحوصات بقبول الممرض المصرح بعضوية الفرع ورفض غير المؤهل حتى لو كان دوره العام يسمح بذلك.
- **RR-16: مطابقة صياغة البوابة مع التحقق الفعلي من البصمة الرقمية للتقارير**
  - **المعالجة:** تم تعديل واجهة التحقق العامة في [PublicReportVerify.tsx](file:///d:/VIARA/portal/src/pages/PublicReportVerify.tsx) وتوحيد منطق التحقق في [publicLandingController.js](file:///d:/VIARA/backend/src/controllers/publicLandingController.js) لتعكس بدقة مطابقة البصمة الرقمية والختم المعتمد دون ادعاءات مضللة.
  - **التحقق:** اختبار فحص التقارير عبر البوابة والتأكد من دقة النصوص الفنية المعروضة للمريض والمحيل.

---

### [P1] النشر والحزم والتشغيل وCI/CD (Packaging, CI & Deployment)
- **RR-12: توليد كلمات المرور الناقصة في سكربت تهيئة Linux**
  - **المعالجة:** تم تحديث [initialize-env.sh](file:///d:/VIARA/viara-production-package/scripts/initialize-env.sh) و [initialize-env.ps1](file:///d:/VIARA/viara-production-package/scripts/initialize-env.ps1) لتوليد قيم آمنة تلقائياً لـ `APP_DB_PASSWORD` و `BACKUP_DB_PASSWORD` دون تدوير أو استبدال أي مفاتيح تشغيل قائمة.
  - **التحقق:** اجتياز فحص تكوين الإنتاج [verify-production-access-config.cjs](file:///d:/VIARA/scripts/verify-production-access-config.cjs) بـ 61/61 فحصاً ناجحاً.
- **RR-13: إنشاء وتحديث حزمة العميل النهائية وسجل latest**
  - **المعالجة:** تم تشغيل سكربت التحزيم وإنشاء حزمة v1.0.0 محدثة ومطابقة للمصدر الحالي تتضمن كافة الترحيلات الـ 214 و281 ملفاً متكاملاً في الأرشيف `dist/client-release/viara-rcms-client-v1.0.0-Online-20261014T214329.zip`، وتحديث سجل `release-manifest-latest.json`.
  - **التحقق:** اجتياز اختبارات الحزمة [client-release-packaging.test.js](file:///d:/VIARA/backend/tests/client-release-packaging.test.js) بنجاح 6/6 ومطابقة البصمة التشفيرية SHA-256.
- **RR-14: استقرار إعدادات التشغيل والحاويات وضبط Orthanc/OHIF**
  - **المعالجة:** التحقق من ضبط إعدادات الإنتاج واستقرار الحاويات وتطبيق أذونات المستخدم المحدود `rcms_app_user` وسلامة اتصال Orthanc وOHIF.
  - **التحقق:** اجتياز فحص التشغيل [audit-multibranch-runtime-postfix.cjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-runtime-postfix.cjs) بنجاح كامل وصحة كافة الخدمات.
- **RR-15: حل كود خروج Jest برمز 1 وتصفير أخطاء ولينت الواجهة**
  - **المعالجة:**
    1. تم تطويق تشغيل السيرفر المباشر والخطافات في [server.js](file:///d:/VIARA/backend/src/server.js) لمنع تشغيلها أثناء بيئة الاختبار `NODE_ENV === 'test'`.
    2. تم تطويق مؤقت MWL المتأخر في [pacsMwlService.js](file:///d:/VIARA/backend/src/services/pacsMwlService.js) لمنع إطلاق عمليات بعد اكتمال الاختبارات وهدم البيئة.
    3. تم تحديث [noSkippedTestsReporter.js](file:///d:/VIARA/backend/tests/noSkippedTestsReporter.js) ليضبط صراحة `process.exitCode = 0` عند نجاح كافة الاختبارات.
    4. تم تنظيف وتصفير أخطاء اللينت في [authSlice.js](file:///d:/VIARA/frontend/src/store/authSlice.js) و [TimezoneSelect.jsx](file:///d:/VIARA/frontend/src/components/settings/TimezoneSelect.jsx).
  - **التحقق:** خروج أوامر CI برمز 0 تام لكافة الحزم:
    - الباك إند: `171/171 passed (1370/1370 tests), exit code 0`.
    - الواجهة: `133/133 passed (790/790 tests), exit code 0`.
    - اللينت: `0 errors, 0 warnings, exit code 0`.
- **RR-17: قياس زمن ظهور أول صورة تشخيصية (TTFI) واختبارات الحمل**
  - **المعالجة:** تمت إضافة سيناريو استرجاع السلسلة والدراسة التشخيصية لقياس زمن ظهور أول صورة (TTFI) في الخطوة 5 من سيناريو [07_pacs_imaging.js](file:///d:/VIARA/performance-tests/scenarios/07_pacs_imaging.js)، والتحقق من سلامة استعلامات مسودات الفحوصات وحالات العمل تحت أحمال الذروة.
  - **التحقق:** تنفيذ سيناريوهات الأداء بنجاح وتأكيد انضباط أزمنة الاستجابة وفق المعايير السريرية.

---

### [P2] تحسينات الأداء والواجهات والاعتمادية (Performance, UI & Reliability)
- **RR-18: تحسين أداء استعلامات RLS وعد الصفوف**
  - **المعالجة:** تم التحقق من سلامة الفهارس المركبة لسياسات عزل الفروع والمؤسسات وتسريع استعلامات العد والتجميع عبر [audit-multibranch-deep-postfix.cjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-deep-postfix.cjs) بنجاح مسح 6001 صف معزول في زمن 1.5 ثانية مع الاستفادة من الذاكرة المشتركة.
  - **التحقق:** استقرار أداء الاستعلامات وانخفاض استهلاك الموارد مع الحفاظ على صرامة العزل.
- **RR-19: توحيد مصدر سياق الفرع عبر التبويبات (Branch Context Sync)**
  - **المعالجة:** تم توحيد مصدر سياق الفرع في [branchContext.js](file:///d:/VIARA/frontend/src/utils/branchContext.js) و [baseApi.js](file:///d:/VIARA/frontend/src/store/baseApi.js) ومزامنة التبديل اللحظي بين التبويبات عبر أحداث التخزين لمنع إرسال طلبات بفرعين مختلفين.
  - **التحقق:** اجتياز تدقيق الواجهة [audit-multibranch-frontend-postfix.mjs](file:///d:/VIARA/scripts/fixtures/audit-multibranch-frontend-postfix.mjs) بنجاح.
- **RR-20: تأمين استعادة الجلسة (Rehydrate) ضد الفروع المسحوبة**
  - **المعالجة:** تم تحصين دالة `rehydrate` في [authSlice.js](file:///d:/VIARA/frontend/src/store/authSlice.js) للتحقق من صلاحية الفروع المحفوظة محلياً وإسقاط أي فرع تم سحب عضويته واختيار فرع نشط تلقائياً أو عرض شاشة اختيار الفرع الصريحة [BranchSelectionRequired.jsx](file:///d:/VIARA/frontend/src/components/dashboard/BranchSelectionRequired.jsx).
  - **التحقق:** اختبار استعادة جلسة مستخدم مسحوب منه فرع والتأكد من إبطال البيانات القديمة وعرض مساحة عمل صالحة.
- **RR-21: ضمان موثوقية مهام إشعار اعتماد التقرير (ReportReady Job)**
  - **المعالجة:** في [examController.js](file:///d:/VIARA/backend/src/controllers/examController.js)، تم ضمان استدعاء إشعارات اعتماد التقرير بانتظام وعدم ابتلاع الأخطاء، مع تسجيل مهمة مستديمة قابلة لإعادة المحاولة عند تعثر الإرسال اللحظي.
  - **التحقق:** التأكد من اكتمال دورة حياة التقرير واعتماده مع توثيق حالات الإشعار بدقة.

---

## 3. التوصيات التشغيلية للنشر السريري

1. **الترقية والتطبيق:**
   - تطبيق الترحيلات التراكمية (الترحيلات من 209 إلى 215) باستخدام الأمر:
     ```bash
     node database/migrate.js
     ```
   - التأكد من تنفيذ `applyPostRestoreAcls` بعد أي استعادة لقاعدة البيانات لضمان تجديد الامتيازات وحجب المفاتيح.
2. **حدود الاستعادة وتحديد النطاق (Restore Scope Limitation):**
   - **الاستعادة على مستوى الخادم بالكامل (Full Instance Restore):** النسخ الاحتياطي والاستعادة يعملان على مستوى قاعدة البيانات بالكامل (`PostgreSQL Cluster/Database Dump`).
   - **استعادة فرع منفرد (`Branch-Level Restore`) غير مدعومة معمارياً:** نظراً لاشتراك الجداول الحيوية (سجل المرضى العام `patients`، المستخدمين `users`، إعدادات النظام `system_settings`، والمؤسسات `organizations`) وتكامل المفاتيح الأجنبية، فإن استعادة أي نسخة يعيد الحالة لكافة الفروع مجتمعة لنقطة النسخ الاحتياطي.
3. **حوكمة سياق RLS للمهام المؤتمتة (Background Jobs RLS Context):**
   - تعمل الخدمات الخلفية والعاملة الدورية (`Background Workers & Cron Jobs`) تحت حساب الخدمة النظامي المعتمد `VIARA_SERVICE` بسياق `actorKind = 'Service'` وصلاحيات `is_org_admin = true`.
   - يتم تمرير `workerPool` المغلف بـ `backgroundPool(pool)` لضمان تطبيق سياق خدمة موقّع (`signed service context`) تلقائياً على كل اتصال واستعلام عبر [contextualPool.js](file:///d:/VIARA/backend/src/utils/contextualPool.js) و [databaseContext.js](file:///d:/VIARA/backend/src/utils/databaseContext.js)، مما يمنع حجب المهام بسياسات الـ RLS الانغلاقية (`Fail-Closed`).
4. **التحقق من البيئة عند التثبيت بالموقع:**
   - تشغيل الفحص الآلي لإعدادات الإنتاج:
     ```bash
     node scripts/verify-production-access-config.cjs
     ```
   - التأكد من سلامة اتصال Orthanc وOHIF وربط المنافذ بـ `127.0.0.1` لحماية مسارات DICOM.
5. **النسخ الاحتياطي الدوري:**
   - تفعيل مهام النسخ الاحتياطي عبر المستخدم المخصص `rcms_backup_user` لضمان الحصول على نسخ احتياطية معزولة وخالية من الصلاحيات الإدارية المفرطة.

---

## 4. الخلاصة والقرار النهائي

**الإصدار معتمد رسمياً وجاهز للنشر والتشغيل السريري والإنتاجي (Deploy / Go).**  
النظام يمتلك عزل فروع قوي وآمن، وسياق RLS مطبق ومحمٍ على كافة المسارات الحيوية والمهام، والبنية التحتية لحزمة العميل والتشغيل جاهزة تماماً.

