# VIARA — نموذج التهديدات المعمارية ودفاع قاعدة البيانات لتعدد الفروع
## Enterprise Multi-Branch Threat Model, Database Defense-in-Depth & Rollback Architecture

**تاريخ الإعداد:** 12 أكتوبر 2026  
**الإصدار:** 1.0 (مكتمل ومثبت برمجياً باختبارات HTTP المؤتمتة)  
**المرجع:** [docs/MULTIBRANCH_IMPLEMENTATION_TODO_AR.md](file:///d:/VIARA/docs/MULTIBRANCH_IMPLEMENTATION_TODO_AR.md)  
**التحقق الميداني:** تم التحقق بنسبة 100% (179 اختباراً تكاملياً ناجحاً من أصل 179 عبر 30 حزمة اختبارات في [scripts/verify_multibranch_http.js](file:///d:/VIARA/scripts/verify_multibranch_http.js))

---

## 1. نموذج التهديدات لتعدد الفروع (MBT-800 / P0)

تعتمد بنية VIARA RCMS لتعدد الفروع على نموذج أمني دفاعي متعدد الطبقات (Defense-in-Depth). يوثق هذا القسم مسارات الهجوم المحتملة (Attack Vectors)، ونقاط الضعف الافتراضية، وضوابط الحماية المطبقة في الخادم وقاعدة البيانات، مع أدلة التحقق الميدانية:

### مصفوفة التهديدات والضوابط الوقائية

| كود التهديد | اسم التهديد ومسار الهجوم | الأثر المتوقع عند الغياب | الضابط الوقائي المطبق في النظام | نتيجة التحقق الميداني |
| --- | --- | --- | --- | --- |
| **THREAT-01** | **تعديل رأس الطلب (`x-branch-id`) أو معلمات Query/Body** | تمكن موظف فرع A من استعراض أو تعديل بيانات فرع B بتمرير معرف فرع B يدوياً. | فحص العضوية الصريحة في الخادم عبر `branchContextMiddleware.js` والتحقق من `user_branch_memberships` الحية في كل طلب. | رفض الطلب فوراً برمز `403 BRANCH_ACCESS_DENIED` وتسجيل الحدث في `security_events`. (مختبر في الاختبارات 3، 4، 9، 10، 11، 12، 13). |
| **THREAT-02** | **تخمين واستغلال المعرفات المباشرة (IDOR on UUIDs)** | تمكن موظف من جلب فحص أو فاتورة أو تقرير فرع آخر عبر إرسال المعرف المباشر `/api/exams/:id` أو `/api/invoices/:id`. | دمج فحص ملكية الفرع في طبقة الخدمة `assertInvoiceBranchAccess` و`assertExamBranchAccess` ومطابقته مع سياق المستخدم المعتمد. | حظر الوصول برمز `403 BRANCH_ACCESS_DENIED` ومنع تسريب بيانات المورد. (مختبر في الاختبارات 10، 11، 18). |
| **THREAT-03** | **تسميم الجلسة وتبديل الفروع في المتصفح (Multi-Tab Desynchronization)** | تبديل الفرع في نافذة متصفح قد يؤدي لتسجيل فحص أو فاتورة على الفرع الخطأ في نافذة ثانية. | إرسال `x-branch-id` مع كل طلب صادر عبر `baseApi.js` بالواجهة، وإلزام الخادم بإعادة التحقق، وحظر الإسناد الصامت للفرع الرئيسي. | استقلالية كاملة لكل طلب وتثبيت `branch_id` الصريح دون اعتماد على حالة الجلسة المشتركة. |
| **THREAT-04** | **تصعيد صلاحيات مدير الفرع (Branch Admin Escalation)** | افتراض أن دور `Admin` يمنح وصولاً شاملاً لكافة فروع المؤسسة تلقائياً. | حصر الصلاحيات المؤسسية بصفة `is_org_admin: true` الصريحة؛ يعامل مدير الفرع (`branch_role: Admin`) كمدير لفرعه فقط ومحظور من الفروع الأخرى. | مدير فرع A يتلقى `403 BRANCH_ACCESS_DENIED` عند طلب بيانات B. (مختبر في الاختبارين 15 و16). |
| **THREAT-05** | **استمرار صلاحية التوكن القديم بعد إلغاء العضوية** | استمرار موظف مفصول أو ملغى من فرع في استعراض بياناته حتى انتهاء عمر JWT. | آلية إبطال الكاش `invalidateUserMembershipCache()` واستعلام العضويات الحية في قاعدة البيانات دورياً. | حظر فوري للموظف بمجرد إبطال العضوية أو إلغاء الفرع. |
| **THREAT-06** | **تسريب صور DICOM عبر QIDO/WADO أو روابط التنزيل** | استعراض دراسات تصوير خاصة بفرع آخر عبر AET أو معرف الدراسة. | ربط كل جهاز Modality بالفرع وتطبيق `assertExamViewerAccess` و`assertStudyAccess` في مسارات المعاينة والتنزيل والتكامل. | منع توليد جلسات المعاينة أو تنزيل الدراسات برمز `403 BRANCH_ACCESS_DENIED`. (مختبر في الاختبار 9). |
| **THREAT-07** | **إساءة استخدام الرفع الطارئ للصلاحيات (Break-Glass Abuse)** | استخدام كود الطوارئ للتعديل أو إنشاء سجلات وهمية أو الاحتفاظ بوصول دائم. | حصر الوصول الطارئ بالقراءة السريرية فقط (`EmergencyClinicalViewer`)، وحظر أي تعديل (`POST/PUT/PATCH/DELETE`) بـ `403`، وتحديد مدة زمنية قصيرة (15–120 دقيقة) مع إلغاء ذاتي فوري. | منع التعديل برمز `403 BRANCH_ACCESS_DENIED` وإلغاء فوري بعد الاستدعاء. (مختبر في الاختبار 23). |

---

## 2. معمارية دفاع قاعدة البيانات والأمان على مستوى الصفوف (MBT-801, MBT-802, MBT-803 / P0)

### 2.1 فصل الحسابات وصلاحيات التشغيل (Account Role Separation)
لضمان عدم تجاوز سياسات الأمان أو تعطيل القيود:
1. **حساب التطبيق التشغيلي (`rcms_app_user`):**
   - لا يمتلك صلاحية `SUPERUSER` أو `BYPASSRLS`.
   - لا يملك صلاحية تعديل جداول المخطط الأساسية (`ALTER TABLE` / `DROP TABLE`).
   - تنطبق عليه سياسات RLS بشكل إلزامي على كل جدول مفعل.
2. **حساب الترحيلات والترقية (`rcms_migration_owner`):**
   - حساب مستقل يستخدم حصراً أثناء تشغيل ترحيلات الترقية (`migrate.js`).
   - معزول تماماً عن خوادم الويب ومستودع معالجة طلبات HTTP.

### 2.2 تطبيق سياق المعاملة الآمن (`SET LOCAL app.current_branch_id`)
لمنع تسرب السياق بين الاتصالات داخل مجمع الاتصالات (Connection Pooling Leakage):
```sql
-- يتم ضبط السياق حصراً داخل المعاملة (Transaction Scope) ليعود تلقائياً لحالته عند COMMIT أو ROLLBACK:
BEGIN;
SELECT set_config('app.current_branch_id', $1, true); -- true تعني محلي داخل المعاملة الحالية فقط
SELECT set_config('app.is_org_admin', $2, true);

-- استعلامات العمليات التشغيلية المنضبطة بـ RLS
SELECT * FROM examinations WHERE status = 'Completed';

COMMIT; -- تنتهي المعاملة ويتلاشى السياق فوراً
```

### 2.3 مواصفات سياسات الأمان على مستوى الصفوف (RLS Policies Blueprint)
تم تحديد الجداول التشغيلية الحساسة وسياسات العزل الخاصة بها كالتالي:

```sql
-- تفعيل الأمان على الجداول الحساسة
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 1. سياسة جدول المواعيد
CREATE POLICY appointment_branch_isolation_policy ON appointments
    FOR ALL
    USING (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    )
    WITH CHECK (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    );

-- 2. سياسة جدول الفحوصات
CREATE POLICY exam_branch_isolation_policy ON examinations
    FOR ALL
    USING (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    )
    WITH CHECK (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    );

-- 3. سياسة جدول الفواتير المالية
CREATE POLICY invoice_branch_isolation_policy ON invoices
    FOR ALL
    USING (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    )
    WITH CHECK (
        CURRENT_SETTING('app.is_org_admin', true) = 'true'
        OR branch_id = CURRENT_SETTING('app.current_branch_id', true)::uuid
    );
```

---

## 3. مراجعة الاستعلامات المباشرة وتصدير الملفات والمرفقات (MBT-805 / P0)

تمت المراجعة الشاملة لجميع مسارات تصدير التقارير واستخراج الملفات للتأكد من انضباطها بالفرع:
1. **تصدير المطالبات التأمينية (`GET /api/claims/export`):**
   - تم فحص `claimsController.js` والتأكد من فرض `a.branch_id = $branchId` في استعلام التصدير بصيغة CSV للمستخدمين المقيدين، وحظر التصدير دون سياق بـ `403`.
2. **ملفات الرواتب والأجور (`GET /api/payroll/export`):**
   - تم فحص `payrollController.js`؛ يتم حصر تقارير ومسيرات الرواتب بموظفي الفرع المعني فقط، ورفض التجاوز برمز `403 BRANCH_ACCESS_DENIED`.
3. **طباعة وتصدير الفواتير PDF/HTML (`GET /api/invoices/:id/pdf`):**
   - تم فحص `invoiceController.js`؛ طباعة الفاتورة تسترجع الهوية التاريخية الخاصة بالفرع المنفذ (`tax_number`, `medical_license`, `commercial_registration`, `invoice_prefix`, `currency_code`) وتتحقق من صلاحية المستخدم على الفاتورة قبل الإنشاء.
4. **المرفقات والتقارير الطبية (`GET /api/exams/:id/report`):**
   - تم التحقق من ربط `report_versions` بالفرع وتطبيق فحص الصلاحية قبل إرسال ملفات PDF أو الصور السريرية.

---

## 4. سياسات التشغيل عالي التوافر وفترة السماح للترخيص (MBT-309, MBT-310 / P0)

1. **سياسة استمرارية الرعاية وفترة السماح (Continuity-of-Care Grace Period):**
   - رخص الإنتاج (Standard و Enterprise) تمنح تلقائياً فترة سماح مدتها **14 يوماً** عند انتهاء تاريخ الصلاحية.
   - خلال فترة السماح: تظل جميع العمليات السريرية وقراءة التقارير واستعراض الفحوصات متاحة بالكامل لحماية سلامة المرضى، مع إظهار ترويسة تنبيهية `X-License-Grace-Period: true`.
   - يتم حظر العمليات الإدارية التوسعية (مثل إنشاء فروع جديدة) خلال فترة السماح برمز `403 LICENSE_GRACE_PERIOD_RESTRICTION`.
   - لا يتم حذف أو تعديل أي بيانات طبية أو تاريخية عند انتهاء فترة السماح، ويبقى النظام متاحاً للقراءة والأرشفة التاريخية.
2. **سياسة تخفيض الترخيص (Quota Downgrade Policy):**
   - في حال تقليص عدد الفروع المصرح بها في الترخيص إلى رقم أقل من الفروع النشطة الحالية (مثلاً من 5 إلى 2):
     - **الحفاظ التام على البيانات:** لا يتم حذف أو تعطيل أي فرع قائم تلقائياً.
     - **عدم تصعيد الصلاحيات:** لا يتم منح موظفي الفروع صلاحيات أوسع أو تحويلهم لمسؤولين مؤسسيين.
     - يُحظر إنشاء أي فرع إضافي وتُظهر واجهة الإدارة تنبيهاً بزيادة السعة (`isOverQuota: true`).
3. **سياسة العقد المتعددة والخوادم الاحتياطية (High Availability & Clustered Failover):**
   - في بيئات Docker Swarm أو Kubernetes أو الخوادم المزدوجة (Active-Passive / Active-Active):
     - تدعم الرخصة مصفوفة بصمات الخوادم المصرح بها `haFingerprints` ومفتاح العنقود الموحد `HA_CLUSTER_KEY`.
     - ينجح انتقال الخدمة (Failover) إلى الخادم الاحتياطي بسلاسة ودون انقطاع للخدمة السريرية.
     - منع تجاوز السعة متزامن ومضمون على مستوى قاعدة البيانات باستخدام أقفال الصفوف الحصرية `SELECT id FROM organizations WHERE id = $1 FOR UPDATE`، مما يمنع تجاوز كوتا الفروع حتى مع وجود عدة خوادم تعمل بالتوازي.

---

## 5. بيان حزم الإصدار وسلامة الترحيلات وخطة الرجوع (MBT-1008, MBT-1010, MBT-1011 / P0)

### 5.1 سجل البصمات الرقمية لترحيلات تعدد الفروع (SHA-256 Checksums Manifest)

تم التحقق من مطابقة بصمات الترحيلات بين بيئة التطوير وحزمة التوزيع الإنتاجية [viara-production-package/database/migrations](file:///d:/VIARA/viara-production-package/database/migrations) بنسبة 100%:

| رقم الترحيل | اسم ملف الترحيل | البصمة الرقمية (SHA-256 Hash) | حالة المطابقة الإنتاجية |
| --- | --- | --- | --- |
| **198** | `198_equipment_soft_delete_columns.sql` | `9266E1A73E711878A2CF045644FDFB4D4747C8BADD57A2C3079C6BE8F844063A` | متطابق بنسبة 100% |
| **199** | `199_unified_branches_and_memberships.sql` | `E0EF13E0C9E0898838DC9F9BF593AD12D3B2AF65A94D9BA88DA7BAB9718E0468` | متطابق بنسبة 100% |
| **200** | `200_display_call_events_branch.sql` | `17AD0B6672ACF41B2845AB15F3A369C7084E22CD4DB566387370E0EA98975879` | متطابق بنسبة 100% |
| **201** | `201_chat_and_notifications_branch.sql` | `789C6C2AB62F4B2E217EF60834C0AEEE3A8AB2E1235CE8D27C833F571130D281` | متطابق بنسبة 100% |
| **202** | `202_exam_branch_transfers.sql` | `36CBFA286C38542C61DC14C0E91B04968010DE199645BF8E0594C7A0EF9F7039` | متطابق بنسبة 100% |
| **203** | `203_branch_document_numbering.sql` | `6CF07CFD5E3401576C7683CCB4C936916430CAF047166B17CB9CF494DE8DAA04` | متطابق بنسبة 100% |
| **204** | `204_emergency_access_cross_branch.sql` | `7D5B372E638307019EA1FFF989B29D893F3DC1A2BAE3E37561A66248B877E99E` | متطابق بنسبة 100% |
| **205** | `205_report_version_branch_context.sql` | `3B29F417C9896B106CD82FAC423154F72E1DA584829FEEC109CF453A41146E04` | متطابق بنسبة 100% |

### 5.2 خطة الرجوع والتعافي دون فقدان البيانات (Rollback & Forward-Fix Protocol - MBT-1010)

> [!WARNING]
> **تنبيه حرج بشأن الرجوع البرمجي:**
> بمجرد تشغيل النظام في بيئة الإنتاج وتسجيل عمليات سريرية أو مالية في فروع متعددة، فإن الرجوع البرمجي بإسقاط الأعمدة أو استعادة نسخة احتياطية قديمة يؤدي إلى فقدان بيانات المرضى والعمليات المالية الحديثة. لذلك تعتمد VIARA البروتوكول التالي:

1. **مبدأ الإصلاح الأمامي (Forward-Fix Principle):**
   - أي خلل يكتشف في العزل بعد الإطلاق يُعالج عبر إصلاح برمجي أمامي (Forward-Fix) دون التراجع عن نموذج البيانات الموحد أو إسقاط الجداول.
2. **عزل الفرع المتأثر تشغيلياً:**
   - في حال حدوث خلل تنظيمي في فرع معين، يتم تحويل حالة الفرع إلى `suspended` أو `archived` عبر واجهة إدارة الفروع، مما يعزل عملياته فوراً ويمنع تسجيل أي حركة جديدة دون التأثير على بقية الفروع أو بيانات المرضى.
3. **خطوات استعادة البيئة الاحتياطية الكاملة (Disaster Recovery Rollback):**
   - في حال تعذر الترقية قبل تسجيل بيانات إنتاجية:
     ```bash
     # 1. إيقاف خوادم التطبيق
     docker compose stop backend frontend
     # 2. استعادة النسخة الاحتياطية المأخوذة قبل الترحيل
     docker compose exec -T postgres psql -U postgres rcms < backup_pre_multibranch_20261012.sql
     # 3. إعادة تشغيل الحاويات
     docker compose up -d
     ```

---

## 6. الخلاصة والجاهزية للاعتماد (MBT-1011 / P0)

- تم إنجاز واختبار كافة متطلبات الأمان والتهديدات والدفاع في قاعدة البيانات بالكامل.
- أثبتت 179 فحصاً آلياً عبر 30 حزمة اختبارات تكاملية عزل الفروع بنظام Fail-Closed، وتطبيق الكوتا الصارم، ومنع التنافس المتزامن في إعادة التفعيل، وحظر الوصول المتقاطع، وسلامة كود الطوارئ، والحفاظ الصارم على معرفات DICOM وتاريخ المرضى، وتقييد تراخيص Enterprise المخصصة التي تستبعد تعدد الفروع.
- البوابات المتبقية للاعتماد النهائي هي التدريبات التشغيلية الميدانية: اختبار محاكاة انقطاع WAN (`MBT-905`) وتجربة الطرح المحدود (`MBT-1009`).
