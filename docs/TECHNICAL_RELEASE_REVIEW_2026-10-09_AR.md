# تقرير مراجعة فنية للإصدارة — VIARA-RCMS v1.0.0
**التاريخ:** 2026-10-09 (مبني على المراجعة المستقلّة للحالة HEAD `4b98a6d07748de13dcfa081db54a0fa964b5e527`)
**البيئة:** `spectacled-foundation`، دليف وندوز، Node.js + PostgreSQL + Docker
**الصاحب/المشروع:** abdo-elshaikh/VIARA-RCMS
**اللغة الأصلية للوثائق السابقة:** العربية (تطابق الأسلوب في `docs/*_AR.md`)

## 1. ملخص تنفيذي

تم إجراء مراجعة فنية مركّزة ومستقلّة لجاهزية الإصدار النهائي لنظام إدارة مراكز الأشعة **VIARA-RCMS v1.0.0** — شاملة الوظائف، الأداء، الأمن، تجربة المستخدم، وسير عمل المجال الإشعاعي. النتيجة: **لا يُنصح بالإصدار الآن (NO GO)**.

النظام يُظهر بنية صلبة وناضجة (تدفق عمل إشعاعي مفصل، تحقق من الصلاحيات، توقيع رقمي، SLA إشعاري، حظر محررين، فحص صلاحيات المرحلة). ومع ذلك، توجد ثلاثة ملفات متناقضة بشأن الاستعداد للإصدار تُظهر خطرًا حقيقيًا على اتخاذ القرار:

- تقريران من 2026-10-07 يزعمان جاهزية **98–100%** مع "0 مشاكل مفتوحة".
- تقرير مراجعة ما قبل الإصدار من **2026-10-09** (مبني على `4b98a6d`) يعلن **NO GO** مع 5 مك العُقد P0/P1 (R01–R05) وإضافيات (R06–R13، G01–G04).

التحقق المستقل في هذه المراجعة أظهر أن **بعض الإصلاحات مُطبقة في الشجرة العاملة (uncommitted)** ولم تعد صالحة، لكن العديد لا تزال مفتوحة، وبعضها مُصاغ بشكل غير كامل. كما يوجد **خطر فقدان بيانات حقيقي** (النسخ الاحتياطي لا يشمل المرفقات) و **ثغرة أمنية معروفة** (`braces@3.0.3`).

**القرار:** تأجيل الإصدار. إغلاق العناصر الحرجة المفتوحة (R06، استكمال R07، R11، R12)، ثم دمج واختبار جميع الإصلاحات غير المُلتزمة، وتشغيل CI على الأخضر، وتوثيق توحيديّة التوثيق قبل الموافقة على الإصدار.

## 2. المنهجية

1. **مراجعة وثائقية:** مقارنة التقارير `docs/*_2026-10-07_AR.md` و `scratch\pre-release-audit-text.txt` / `VIARA_PreRelease_Audit_2026-10-09_AR.docx`.
2. **تدقيق شفرة حقيقي:** مراجعة العينة المصدرية (backend `src/services/*`، `src/controllers/*`، `src/routes/*`، `src/config/*`، `src/middleware/*`، `src/jobs/*`) والاختبارات (`backend/tests/*`، `performance-tests/`) والأركية (`docker-compose.yml`، `.github/workflows/ci.yml`، `viara-production-package/.env`).
3. **تشغيل تحت إطار الاختبار:** تشغيل Jest على الاختبارات المنعزلة للتحقق من صلاحية الإصلاحات (دون قاعدة بيانات حية).
4. **مراجعة نطاق المجال:** توظيف تدفق عمل الأشعة (معايير ACR للنتائج الحرجة، دورة حياة التقرير، إدارة مخاطر الإبلاغ).

## 3. جدول الحالة (نتائج المراجعة)

| الرمز | البند | الشدة | وفقًا لتقرير 2026‑10‑09 | الحالة الحالية (4b98a6d + شجرة عمل) | الأدلة |
|-------|-------|-------|---------|------|--------|
| R01 | فقدان معامَّة استعلام GET `/api/case-reports/:id` تحت Express 5 (قراءة مفقودة) | P0 | مفتوح | **مُصلّح/مصدّق** | `case-report-qr-lookup.test.js` 2/2 نجحت ✓؛ `requestQuery.js` `getRequestQuery`; `validateRequest.js` استخدام `Object.defineProperty` |
| R02 | مسارات هبوط عامة غير موصولة (`/case-status/verify`، `/case-status/status`، `/appointment-requests`) | P1 | مفتوح | **مُصلّح (uncommitted)** | `publicLandingRoutes.js` (جديد)؛ `server.js` `app.use('/api/public', publicLandingRoutes(pool))` |
| R03 | `authorizePublicFinalReport` ممرّر كدالة بلا استدعاء → تحميل التقرير يتعلّق | P1 | مفتوح | **مُصلّح (uncommitted)** | `publicLandingRoutes.js` يستدعي المصنع بشكل صحيح |
| R04 | `GET /api/exams/:id` بدون تحقّق صلاحيات دقيق | P1 | مفتوح | **مُصلّح (uncommitted)** | `hasPermission(pool,'VIEW_EXAMS'|'VIEW_REPORTS')` أُضيف إلى `clinicalExamRoutes.js` |
| R05 | تسجيل دخول الموظفين غير مقيّد للحمل الموزَّع | P1 | مفتوح | **مُصلّح (uncommitted)** | `authAccountLimiter` موصول بمسار `/api/auth/login` في `server.js` |
| R06 | النسخ الاحتياطي المجدوّل يستبعد المرفقات (`uploads/` — المستندات، صور الدردشة، ملفات التسلُّم) | P1 | مفتوح | **مفتوح — مخاطرة فقدان بيانات** | `postgresBackupService.js` `createPostgresBackup`: `scope = 'database-and-pacs'` أو `'database-only'`; لا إشارة لـ uploads/documents/chat |
| R07 | فشل النسخ الاحتياطي الخارجي غير معكوس في المقاييس | P2 | مفتوح | **مصدريّة غير مكتملة** | `metrics.js` أضافت `recordOffsiteReplicationSuccess/Failure` لكن `backupScheduler.js` و `backupOffsiteReplicator.replicateBackup` لا يستدعيانها |
| R08 | اختبارات الواجهة الخلفية تعتمد على `.env`/وقت المطوّر | P1 | مفتوح | **مُصلّح (uncommitted)** | `demo-provision.test.js` عازل البيئة؛ `notification-job-service.test.js` 34/34 نجحت ✓ |
| R09 | مفتاح ترجمة `chat.memberRole` مفقود | P3 | مفتوح | **مُصلّح (uncommitted)** | `frontend/src/i18n/locales/{ar,en}/system.json` |
| R10 | فجوة CI على الفرع الافتراضي | P2 | مفتوح | **مُصلّح (uncommitted)** | `ci.yml` يشتغل على `[main, spectacled-foundation, release/**]` |
| R11 | اختبار الأحمال يعامل رموز دفع `400` كـ"نجاح" (يخفي رفض الدفع) | P2 | مفتوح | **مفتوح** | `performance-tests/scenarios/04_billing_payment.js:64-66,81`: `ok = res.ok \|\| status===400 \|\| status===409` |
| R12 | تبعية بناء ضعيفة `braces@3.0.3` (ReDoS، الإصدار الآمن 3.0.4+) | P2 | مفتوح | **مفتوح** | `frontend/package-lock.json:2393` يثبت `braces-3.0.3.tgz`؛ أيضًا في `portal/` |
| R13 | مسارات v1 تتخطّى `checkFeature` للنسخ/الاستيراد/الـPACS | P2 | مفتوح | **مُصلّح (uncommitted)** | `v1/index.js` يستخدم `checkFeature('backup'|'import'|'pacs')` |
| S-01a | تنظيف `password_reset_tokens` غير موجود في الكود | خطأ وثائقي | زُعم غيابه | **موجود — ليس ثغرة** | `backend/src/jobs/dataRetentionJob.js` `cleanupPasswordResetTokens` (COMMITTED) |
| S-01b | فحص فصل المفاتيح (key separation) غير موجود في الكود | خطأ وثائقي | زُعم غيابه | **موجود — ليس ثغرة** | `backend/src/config/validateEnv.js` ~L179-185 (COMMITTED) |
| S-02 | `.env` حزمة الإنتاج غير آمنة (http localhost، DICOM `0.0.0.0`، كلمة مرور مسؤول ضعيفة) | HIGH | مفتوح | **مُصلّح — باقٍ تفاصيل باقية** | `CLIENT_URL=https://…` (HTTPS)✓؛ `PACS_DICOM_BIND=127.0.0.1`✓؛ `TEST_USER_PASSWORD=` (فارغ)✛ (ملاحظة: `METRICS_TOKEN` نص فارغ/مؤشر مرسّل مع النظام) |
| S-03 | ربط مصدر `docker-compose` (`./backend/src:/app/src`) يكشف الكود | MED | مفتوح | **مُصلّح** | `docker-compose.yml:159` ← مُعلّق؛ إفتراضي DICOM `127.0.0.1:4242` |
| G01 | أرشيفات الإصدار غير مُوثّق / غير مُختبرة | HIGH | مفتوح | **مفتوح (لكن أدوات بُنيت)** | `scripts/verify-*.cjs` (جديد غير منقول) — يلزم تشغيلها كباب وصول للإصدار |
| G02 | لا قياسات أداء/سعة حقيقية | HIGH | مفتوح | **مفتوح** | `performance-tests/` موجود (السيناريوهات 04، 08، 09) — لم تُنفّذ ضد بيئة استهداف |
| G03 | لا اختبار ترقية/استرداد بيانات عميل | HIGH | مفتوح | **مفتوح** | — |
| G04 | لا اختبار تجربة مستخدم/متصفح حقيقي | MED | مفتوح | **مفتوح** | — |

✛ `npm audit` في الصندوق أرجعت `found 0 vulnerabilities` — غير موثوق لأن قاعدة البيانات المحلية للـآلاف غير محدَّثة/بلا شبكة؛ الدليل الموثوق هو إصدار `braces@3.0.3` المثبت في الـlock.

## 4. تحليل النتائج

### 4.1 التناقض بين التقارير
- تقريرا 2026-10-07 (`FINAL_PRE_RELEASE_AUDIT...` و `PRODUCTION_READINESS_ASSESSMENT...`) يصفّان النظام بـ **98–100% جاهز**.
- تقرير 2026-10-09 (`scratch\pre-release-audit-text.txt` + `VIARA_PreRelease_Audit_2026-10-09_AR.docx`) يعلن **NO GO** بعد تشغيل حقيقي على `4b98a6d`.
- **الخلاصة:** التقنية الصحيحة هي التي بنيت على تشغيل فعلي (10-09). تقارير 10-07 أظهرت تقديرًا مبالغًا، ومن بين أخطائها ادّعت أن **S-01a و S-01b** غير موجودين في الكود — لكن التحقق أثبت أنهما **موجودان** في الكود الملتزم (إنصاف وظيفة التنظيف وفحص فصل المفاتيح). بمعنى آخر، تقرير `PRODUCTION_READINESS` 2026-10-07 كان **غير دقيق** (خطأ سلبي)، ممّا يعمّق الخطر الذي يُطوّق صلاحيته للإصدارات المستقبلية.
- تبعًا لذلك: **يُنصح بتوحيد وثائق الجاهزية في ملف واحد مُوثّق/مُعاد توقيعه** قبل أي إصدار.

### 4.2 صلاحية الإصلاحات المطبقة
- تحقّق شفري من الإصلاحات على أرض الواقع:
  - `case-report-qr-lookup.test.js` → **2/2 نجح** (يدعم R01).
  - `notification-job-service.test.js` → **34/34 نجح** (يدعم تعميق R08).
- معظم الإصلاحات **لم تُدمج بعد** (ملفات `untracked`/`modified` غير ملتزثة). هذا يعني: لا يمكن الاعتماد عليها في إصدار، ولا يمكن أن تمر عبر CI، وهي عرضة للضياع.

### 4.3 الثغرات / المشكلات / الفجوات

#### أ. أمنية (Security)
- **S-02b مكتمّل جزئياً:** `PACS_DICOM_BIND` ← `127.0.0.1`، لكنه لا يزال يُعرّف في `.env` بدلاً من افتراضي آمن في الصورة/الـcompose. توجب أن يكون الافتراضي آمناً في الصلب.
- **S-02 (مستمر):** `METRICS_TOKEN=replace_with_a_random_32_character_or_longer_secret` — قيمة نصية معروفة مُرسّلة مع الحزمة. فإنّه لا يُلتقى شرط `METRICS_TOKEN < 32` ولا `startsWith('REPLACE_ME')`, لذا يمرّ الفحص، لكن الرمز نفسه هو مفتاح افتراضي. يجب أن يُجفّف أو يتوقف عند التشغيل إذا لم يُستبدل.
- **R12:** `braces@3.0.3` معرضة لهجوم ReDoS. الإصدار الأمني 3.0.4+. الحلّ الأفضل: **إزالتها** من `package.json` (ليست ضرورية للإنتاج — تُستَخدم كأداة بناء).

#### ب. فقدان بيانات / تشغيل (Operational)
- **R06 (حاسم):** النسخ الاحتياطي لا يشمل المرفقات (`uploads/`). ملفات المرضيين (المستندات، صور الدردشة، نسخ PDF من التسليم) **ستُفقد في أي استرداد**. الموجبات المدمجة: `createPostgresBackup` ← `scope` ثابت على `database-and-pacs`/`database-only`.
- **R07 (غير مكتمل):** مقاييس النسخ الاحتياطي الخارجي معرّفة لكن **غير مستدعاة**. فشل النسخ الخارجي لن يُسجّل، ممّا يعطي إحساسًا كاذبًا بالنجاح.

#### ج. الأداء/الإختبار
- **R11:** اختبار الأحمال يعامل `400 Bad Request` (رفض دفع/مبلغ غير كافٍ) كـ"نجاح". هذا **يخفي أخطاءً حقيقية** في مسار الدفع تحت الوطأة. يجب أن يكون `ok: res.ok` فقط، أو يفرق بين "نتائج أعمال سليمة" (409 مكرر بواسطة المفتاح الواحد) و"فشل عملية" (400).
- **R10 مُصلّح** لكن لا يزال على الشجرة غير الملتزثة؛ CI يجب أن يكون أخضر قبل الدمج.

### 4.4 مراجعة سير العمل حسب مجال الأشعة (Radiology Workflow Domain Review)

تدفق العمل المطبق (من `examController.js`، `appointmentController.js`، `displayBoardController.js`، `notificationJobService.js`):

```
Scheduled → Arrived → Payment Pending → Prep Pending → Ready for Exam
   → In Exam → Images Ready → Reporting → Finalized → [Delivered] → Cancelled
محطات: Reception → Nurse → Modality(technician) → Radiologist → Delivery
```

ميزات مطابقة مجالية إيجابية:
- **تحقق من انتقال حالة التقرير** (`getReportTransitionError`، `examController.js:686`) يمنع التحركات غير القانونية (209).
- **باب الحصول على التصريح بالتصريح** — يلزم `findings` + `impression` قبل `Finalized` (`examController.js:677-682`).
- **غلق التقرير بعد النهائي** — `report_locked = TRUE` + `report_locked_at` + توقيع رقمي SHA-256 (`examController.js:700-733`).
- **نسخ إصدارات** (`version_number`) تدعم التعديل الآمن.
- **نافذة إقرار نتيجة حرجة = 15 دقيقة** + توصيل مُجبر (`priority:'Critical'`، `force_delivery:true`، `required:true`، `notificationJobService.js:1242-1257`).
- **مطابقة محطة-دور** — كشف الفحوصات "عالقة" (`current_station='Nurse' AND nurse_id IS NULL` …) تدعم سلامة PACS MWL (`appointmentController.js:163-189`).
- **منع الإلغاء بعد Finalized/Delivered** (`appointmentController.js:1675`).
- **SLA إشعاري**: STAT 30′ / Routine 60′ وفق `dashboardService.js` + `queueController.js:683` `OVERDUE_MINUTES`.

**الفجوتان في بروتوكول النتيجة الحرجة (تدقيق نطاق المجال):**
1. **تصعيد أحادي المستوى فقط:** الدفع يذهب من `Doctor` (level 0) إلى `Admin` (level 1) مرة واحدة — ثم `escalated_at` تُعيّن ولا يُعاد التصعيد (`notificationJobService.js:1316` WHERE `escalated_at IS NULL`). لا يوجد تصعيد تراكمي (Supervisor → Department Head → Clinical Director) بفواصل زمنية متزايدة كما يشتري ACR على التواصل المتكرر للنتائج الحرجة. هذا **خطر تجاوز وقت الاستجابة**.
2. **خطأ تكافؤي (bug في التكافؤ):** إذاُحاطت النتيجة الحرجّة لموظف `Admin` مباشرة (العمود `else: examController.js:884-896`، بلا `referring_doctor_id`)، فإنّ استعلام التصعيد `WHERE referring_doctor_id IS NOT NULL` (`notificationJobService.js:1292`) **لن يلتقطها** أبدًا → **لا تُعاد تصعيدًا** وقد تُنسى. هذا خطر عملي على منظومة الإنقاذ.

**باقي التدفق الإشعاعي:** سليم نسبياً، ولكنه لا يزال يفتقر إلى: (أ) توويح برموز النتائج بـ LOINC/SNOMED في `examController.js` (لم يُتوجد)، و(ب) سجلّ تدفق كامل إشعاري موثّق.

## 5. تقييم المخاطر (Risk Assessment)

| المستوى | العنصر | المخاطر | التوصية قبل الإصدار |
|---------|--------|----------|---------------------|
| **P0 — لا تُصدر** | R06 (نسخ احتياطي بدون مرفقات) | فقدان بيانات مرضية/قانونية على أي استعادة | إلزامي: إضافة `uploads/` إلى `createPostgresBackup`، أو نسخ منفصل موحد + فحص SHA |
| **P0 — لا تُصدر** | عدم التماسك بين التوثيق (تقارير 10-07 متناقضة) | اتخاذ قرار إصدار خطأ | إلزامي: دمج توثيق الجاهزية في ملف واحد مُعتمد |
| **P1** | R07 غير مكتمل (مقاييس النسخ الخارجي غير موصولة) | فشل نسخ خفي → بيانات ليست في مكانها | إلزامي: ربط `recordOffsiteReplicationSuccess/Failure` بمسار `replicateBackup` |
| **P1** | إصلاحات R01–R05,R08–R10,R13 على الشجرة وغير الملتزثة | لا يمرون CI، عرضة للضياع، لا نسخة مُهدّفة | إلزامي: دمج + اختبار أخضر |
| **P2** | R11 (اختبار الأحمال يقبل دفعًا فاشلاً كنجاح) | تغطية غير صحيحة لمسار الدفع | إلزامي: إصلاح منطق `ok` في `04_billing_payment.js` |
| **P2** | R12 (`braces@3.0.3`) | ReDoS ممكن عبر تطبيق أداة بناء | إلزامي: إزالة/ترقية من `package.json` |
| **MED** | فجوات سير عمل نتائج حرجة (تقديم أحادي المستوى، خطأ تكافؤي) | تأخير إنقاذ حالة حرجة | مرغوب: ترميز التصعيد المتدرج + تصحيح شرط `referring_doctor_id IS NOT NULL` |
| **MED** | G02/G03/G04 (أداء/ترقية/استرداد/UX غير مُختبر ببيئة حقيقية) | أداء/قابلية استعادة غير مضمونة | ينصح: تشغيل أرشات الأداء وحزمة النسخ الاحتياطي `verify-*.cjs` |

## 6. التوصيات (مُوجّهة — لكلّ موافقة الإصدار)

1. **إغلاق R06 أولاً.** إما دمج `uploads/` في النسخة الاحتياطية (أرشيف مشفر مرفق به SHA، مع مفتاح `BACKUP_ENCRYPTION_KEY` منفصل)، أو بناء نسخة منفصلة للمرفقات مع فحص التكامل. لا تُصدر دون اختبار استعادة حقيقية.
2. **إكمال R07.** أضف استدعاء `recordOffsiteReplicationSuccess()` عند `replicationResult.replicated === true` و `recordOffsiteReplicationFailure({error})` عند الفشل، داخل `backupScheduler.js:runScheduledBackup`.
3. **إصلاح R11.** غيّر منطق `ok` ليقبل فقط `res.ok` أو `409` (التكرار بمفتاح واحد)، ويفرق الـ`400` (فشل عملية حقيقي = خطأ في الاختبار الأحمال).
4. **إصلاح R12.** احذف `braces` من `frontend/package.json`/`portal/package.json` (ليست ضرورية في الإنتاج) أو ارفعها للإصدار الأمني. أعد تشغيل `npm audit`.
5. **دمج وتوحيد كل الإصلاحات غير الملتزثة** (R01–R05,R08–R10,R13,S-02,S-03) في فرع/ـcommit واحد، وتأكد أن CI أخضر على الكل من `main` و `spectacled-foundation`.
6. **توحيد توثيق الجاهزية.** احذف أو وسّط التقريرين غير المتفقّين من 10-07، واستبدلهما بملف واحد `RELEASE_READINESS_2026-10-09_AR.md` مُعاد توقيعه من فرق الهندسة والتمم الأمني، يشمل جدول الحالة (القسم 3).
7. **سير عمل الأشعة — تقديم الحرج:**
   - استبدِل التصعيد الأحادي المستوى بآلية تدرّجية (`escalation_level` 0→1→2→3 مع فترات 15′/30′/60′).
   - صلّح الخطيئة المنهجية: استبد `WHERE referring_doctor_id IS NOT NULL` بـ `acknowledgement_due_at <= NOW() AND escalated_at IS NULL` (بدون فرض صاحب عمود) لكي يُعاد تصعيد النتائج الموجهة للمشرفين أيضًا.
8. **G01/G02/G03/G04 (مطلوب للثقة بالإصدار):** نفّذ `scripts/verify-delivery-bundle.cjs` + `verify-start-here.cjs` على الأرشيف؛ شغّل السيناريوهات في `performance-tests/` ضد بيئة استهداف؛ وثّق نتائج الاسترداد (G03) والاختبار العرضي (G04).

## 7. ملحق — أدلة التحقّق (Validation Evidence)

- `case-report-qr-lookup.test.js` → **2 passed** (يدعم R01).
- `notification-job-service.test.js` → **34 passed** (يدعم R08).
- R06: قراءة `postgresBackupService.js:218-262` — لا إشارة لـ `uploads/`.
- R07: قراءة `backupOffsiteReplicator.js:203-226` (تسترجع `{replicated}`) + `backupScheduler.js` (لا يستدعي مقاييس الخارجي) + grep `recordOffsiteReplication*` → مطلوبة فقط في `metrics.js`.
- R11: قراءة `performance-tests/scenarios/04_billing_payment.js:52-83`.
- R12: `frontend/package-lock.json:2391-2393` → `braces` @ `https://registry.npmjs.org/braces/-/braces-3.0.3.tgz`.
- S-01a/S-01b: `backend/src/jobs/dataRetentionJob.js`، `backend/src/config/validateEnv.js` (committed) — موجودان.
- S-02/S-03: `viara-production-package/.env`، `docker-compose.yml:159`، `:258`.

## 8. الملفات ذات الصلة

- **الريبو ككرة:** `spectacled-foundation`، HEAD `4b98a6d07748de13dcfa081db54a0fa964b5e527` (`origin:abdo-elshaikh/VIARA-RCMS`)
- **خلفية (Backend):**
  - `backend/src/server.js` — توصيل `/api/public` L670؛ مسار تسجيل الدخول + `authAccountLimiter` ~L636
  - `backend/src/controllers/examController.js` — `lookupCaseReport` (R01)، `getReportTransitionError` (L686)، منطق التوقيع الرقمي/الغلق (L699-744)، خلق `critical_result_acknowledgements` (L873-896)، `acknowledgeCriticalResult` (L1001)
  - `backend/src/controllers/publicLandingController.js` — `authorizePublicFinalReport` (مصنع، L110)
  - `backend/src/routes/publicLandingRoutes.js` (جديد) — توصيل المسارات العامة (R02/R03)
  - `backend/src/routes/clinicalExamRoutes.js` — `hasPermission('VIEW_EXAMS'|'VIEW_REPORTS')` (R04)
  - `backend/src/utils/requestQuery.js` (جديد) — `getRequestQuery` (R01)
  - `backend/src/middleware/validateRequest.js` — تصحيح Express 5 `defineProperty` (R01)
  - `backend/src/middleware/rateLimiters.js` — `authAccountLimiter` (L204)
  - `backend/src/routes/v1/index.js` — `checkFeature` (R13)
  - `backend/src/config/validateEnv.js` — فحص فصل المفاتيح (S-01b، L179-185)
  - `backend/src/jobs/dataRetentionJob.js` — `cleanupPasswordResetTokens` (S-01a، L125-131)
  - `backend/src/services/postgresBackupService.js` — `createPostgresBackup` (R06؛ L218-262)، `getDicomStorageStatus`
  - `backend/src/services/backupScheduler.js` — `runScheduledBackup`، `replicateBackup` (R07؛ لا يستدعي مقاييس الخارجي)
  - `backend/src/services/backupOffsiteReplicator.js` — `replicateBackup` (L203-226؛ يسترجع `{replicated}`)
  - `backend/src/config/metrics.js` — `recordBackupSuccess/Failure`، `recordOffsiteReplicationSuccess/Failure` (مضافة لكن غير مستدعاة)
  - `backend/src/services/notificationJobService.js` — `processCriticalResultEscalations` (L1276-1327)، `reconcileCriticalResultNotifications` (L1227)
  - `backend/src/controllers/appointmentController.js` — `queue_stage` / `current_station`، إلغاء بعد Finalized/Delivered (L1675)
  - `backend/src/controllers/displayBoardController.js` — SLA/WAIT mins (L190-200)
  - `backend/src/services/dashboardService.js` — SLA STAT/Routine 30/60/120′
- **اختبارات (Tests):**
  - `backend/tests/case-report-qr-lookup.test.js` (R01 ✓ 2/2)
  - `backend/tests/notification-job-service.test.js` (R08 ✓ 34/34)
  - `backend/tests/demo-provision.test.js` (R08)
  - `performance-tests/scenarios/04_billing_payment.js` (R11)
  - `performance-tests/scenarios/08_concurrency_stress.js`، `09_concurrency_collision.js`
- **واجهة أمامية (Frontend/Portal):**
  - `frontend/src/pages/CaseReports.jsx` (م)، `frontend/src/utils/reportLookup.js` (جديد)
  - `frontend/src/i18n/locales/{ar,en}/system.json` (R09 `chat.memberRole`)
  - `frontend/package.json:60` + `frontend/package-lock.json:2391-2393` (R12 `braces ^3.0.3` → 3.0.3)
  - `portal/package.json` + `portal/package-lock.json` (نفس تبعية braces)
- **التشغيل/النشر (Deploy):**
  - `docker-compose.yml:159` (S-03 — تجميع المصدر معلّق)، `:258` (DICOM 127.0.0.1)
  - `.github/workflows/ci.yml` (R10 — فروع main/spectacled-foundation/release/**)
  - `backend/.env`، `.env` (مفاتيح منفصلة)
  - `viara-production-package/.env` (S-02)
- **الوثائق:**
  - `docs/FINAL_PRE_RELEASE_AUDIT_AND_READINESS_REPORT_2026-10-07_AR.md` (100% ready)
  - `docs/PRODUCTION_READINESS_ASSESSMENT_2026-10-07_AR.md` (98 ready — غير دقيق re S-01a/b)
  - `scratch\pre-release-audit-text.txt` + `scratch\VIARA_PreRelease_Audit_2026-10-09_AR.docx` (10-09 NO GO)
  - `scripts/package-client-release.js`، `scripts/verify-client-release-containers.cjs`، `scripts/verify-delivery-bundle.cjs`، `scripts/verify-start-here.cjs` (جديدة — G01)
