# دليل التعافي من الكوارث واستعادة النسخ الاحتياطية — VIARA-RCMS
**نظام إدارة مراكز الأشعة والعيادات المتكامل**

---

## 1. نظرة عامة والمعمارية الأمنية للنسخ الاحتياطي

يقوم نظام **VIARA-RCMS** بأتمتة النسخ الاحتياطي المشفر على مستويين متكاملين ومتزامنين (`Atomic Lockstep Backups`):

1. **قاعدة البيانات العلائقية (PostgreSQL):**
   - استخراج كامل لكافة الجداول والقيود والفهارس عبر `pg_dump` بصيغة Custom Format (`-Fc`).
   - تشفير متقدم بتقنية **AES-256-GCM** مع مفتاح مصادقة 128-بت وترميز أمني `VIARABKP2` لمنع التلاعب وتلف البيانات.
   - حفظ اسم الملف بنمط: `VIARA_pg_<TIMESTAMP>_<UUID>.dump.enc`.

2. **أرشيف صور الأشعة (Orthanc DICOM PACS Companion):**
   - استخراج متزامن لكافة ملفات وصور الـ DICOM الأصلية عبر واجهة Orthanc الموثوقة.
   - التحقق اللحظي من سلامة الأرشيف عبر `manifest.json` وبصمات التجزئة **SHA-256** لكل فحص وصورة.
   - تشفير متطابق بـ **AES-256-GCM** بنفس المفتاح الأمني.
   - حفظ الملف المصاحب بنمط: `VIARA_pg_<TIMESTAMP>_<UUID>.pacs.zip.enc`.

---

## 2. متطلبات ما قبل الاستعادة (Prerequisites)

| البند | الوصف والمتطلب |
|---|---|
| ملف الأرشيف | توفر ملف النسخة الاحتياطية المشفرة في مسار `/app/backups` أو مجلد الحزمة `backups/`. |
| مفتاح التشفير | تطابق قيمة `BACKUP_ENCRYPTION_KEY` (أو `ENCRYPTION_KEY`) المكونة من 64 خانة Hexadecimal في ملف `.env`. |
| مفاتيح البيانات الحساسة | مطابقة `ENCRYPTION_KEY` و`BLIND_INDEX_KEY` للمفاتيح التي كانت مفعلة وقت إنشاء النسخة لضمان فك تشفير PII والبحث بالاسم. |
| بيئة التشغيل | التأكد من عمل حاويات Docker الأساسية (`postgres`, `orthanc`, `backend`). |
| نافذة الصيانة | الاستعادة الكاملة لقاعدة البيانات تتطلب إيقاف حركة المستخدمين لمنع تعارض البيانات. |

---

## 3. خطوات الاستعادة المؤتمتة (الأمر الموحد)

توفر حزمة الإنتاج `viara-production-package` سكربتات تشغيل مباشرة تنفذ كافة مراحل فك التشفير، والتحقق، والاستعادة، والتنظيف تلقائياً.

### أ) على خوادم Linux (عبر Docker Compose):

```bash
# 1. استعراض النسخ الاحتياطية المتوفرة وتفاصيل أحجامها وتواريخها:
./scripts/restore.sh --list

# 2. فحص سلامة الأرشيف والتشفير دون المساس بقاعدة البيانات الحالية (Dry-Run):
./scripts/restore.sh VIARA_pg_20261005_uuid.dump.enc --verify-only

# 3. تنفيذ الاستعادة الفعلية لقاعدة البيانات وأرشيف الأشعة DICOM معاً:
./scripts/restore.sh VIARA_pg_20261005_uuid.dump.enc --confirm
```

### ب) على خوادم Windows Server (PowerShell / Command Prompt):

```bat
REM 1. استعراض النسخ المتوفرة:
scripts\restore.bat --list

REM 2. التحقق الجاف (Dry-Run):
scripts\restore.bat VIARA_pg_20261005_uuid.dump.enc --verify-only

REM 3. تنفيذ الاستعادة الكاملة:
scripts\restore.bat VIARA_pg_20261005_uuid.dump.enc --confirm
```

---

## 4. ما الذي يحدث خلف الكواليس أثناء الاستعادة؟

1. **التحقق من سلامة اسم الملف ومساره:** منع أي محاولات Path Traversal أو ملفات غير مصرح بها.
2. **التحقق من التشفير والمصادقة:** قراءة الهيدر `VIARABKP2` وفك التشفير في مسار مؤقت محمي، مع فحص Auth Tag عبر GCM (أي عبث بالملف يفشل العملية فوراً).
3. **التحقق من بنية الـ Dump:** تنفيذ `pg_restore --list` للتأكد من سلامة جداول النظام وسجلات المرضى.
4. **استعادة قاعدة البيانات:** استدعاء `pg_restore` مع خيارات `--clean --if-exists --no-owner --no-privileges -d <database>` لإعادة بناء الجداول بدون أخطاء صلاحيات.
5. **استعادة صور الأشعة (PACS):** في حال وجود الملف المصاحب `.pacs.zip.enc`:
   - فك تشفيره والتحقق من بصمات الـ SHA-256 للملفات مقابل الـ `manifest.json`.
   - بث ملفات DICOM إلى Orthanc دون تحميل كل صورة كاملة في ذاكرة التطبيق، ثم إعادة قراءة كل صورة مستعادة ومقارنة بصمتها SHA-256 مع النسخة.
   - فهرس Orthanc محفوظ في قاعدة PostgreSQL مستقلة (`orthanc`) بينما تبقى ملفات الصور الأصلية على وحدة التخزين المركبة؛ يجب استعادة قاعدة الفهرس والصور كوحدة واحدة والتحقق منهما معاً.
6. **التنظيف الآمن:** حذف كافة الملفات المؤقتة غير المشفرة تلقائياً في كتلة `finally` لضمان عدم بقاء أي بيانات مرضية (PHI) غير مشفرة على القرص.

---

## 5. التحقق اليدوي بعد الاستعادة (Post-Restore Verification)

للتأكد التام من اكتمال استعادة البيانات، يمكن لمهندس النظم تنفيذ الفحوصات التالية:

```bash
# 1. مطابقة عدد الصفوف في الجداول الحيوية:
docker compose exec postgres psql -U viara -d viara -c "
  SELECT 'patients' AS table, COUNT(*) FROM patients
  UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
  UNION ALL SELECT 'examinations', COUNT(*) FROM examinations
  UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
  UNION ALL SELECT 'payments', COUNT(*) FROM payments
  UNION ALL SELECT 'system_logs', COUNT(*) FROM system_logs;"

# 2. التأكد من اكتمال سلسلة الترحيلات البرمجية:
docker compose exec postgres psql -U viara -d viara -c "
  SELECT COUNT(*) AS total_migrations FROM schema_migrations;"

# 3. التحقق من سلامة سجل التدقيق الرقابي غير القابل للتعديل:
docker compose exec postgres psql -U viara -d viara -c "
  SELECT COUNT(*) FROM system_logs WHERE prev_hash IS NOT NULL AND is_valid = FALSE;"
```

---

## 6. إجراءات الاختبار الدوري (Quarterly Recovery Drill)

يوصى بشدة بإجراء تدريب استعادة ربع سنوي وفق المعايير الطبية الدولية:
1. تجهيز قاعدة بيانات اختبارية مؤقتة معزولة.
2. تشغيل أمر التحقق `--verify-only` والاستعادة إليها.
3. قياس وتسجيل زمن الاستعادة الفعلي (RTO - Recovery Time Objective) ونقطة الاستعادة (RPO - Recovery Point Objective).
4. التحقق من عرض تقارير الأشعة وصور DICOM في عارض OHIF والتأكد من تطابق بيانات المرضى.
