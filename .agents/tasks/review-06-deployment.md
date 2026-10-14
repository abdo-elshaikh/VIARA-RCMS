# تقرير المحور السادس — النشر والتعافي | VIARA-RCMS

**تاريخ الفحص:** 2026-10-14  
**المفحوص من:** عميل فحص DevOps تلقائي  
**النطاق:** حزمة الإنتاج، CI/CD، النسخ الاحتياطي، المراقبة، التعافي من الكوارث، أمان النشر

---

## ملخص تنفيذي

| المحور | الحالة |
|---|---|
| حزمة النشر | ✅ متكاملة بشكل عام مع ملاحظات طفيفة |
| CI/CD | ✅ قوي مع ملاحظة على PHI scan |
| النسخ الاحتياطي | ✅ ممتاز — شامل ومشفر وآلي |
| Health Checks والمراقبة | ⚠️ Prometheus/Grafana خارج production package |
| التعافي من الكوارث | ✅ موثق مع ملاحظة على قيم RTO/RPO الكمية |
| أمان النشر | ✅ جيد مع ملاحظة على Nginx containers |

**عدد الموانع:** 0  
**عدد الملاحظات:** 4

---

## 1. حزمة النشر (`viara-production-package/`)

### 1.1 DEPLOYMENT_CHECKLIST.md
**الملف:** `viara-production-package/DEPLOYMENT_CHECKLIST.md`

⚠️ **ملاحظة — checklist محدودة المحتوى**  
الملف الحالي يغطي فقط قسم WireGuard VPN. القائمة التفصيلية الشاملة (10 أقسام، 50+ بند) موجودة في `docs/RCMS_DEPLOYMENT_CHECKLIST.md` وليس في الحزمة المسلَّمة للعميل.

**الإصلاح المقترح:** نسخ أو ربط `docs/RCMS_DEPLOYMENT_CHECKLIST.md` داخل `viara-production-package/` أو توجيه المستخدم صراحةً إليه في `README.md` أو `DEPLOYMENT_CHECKLIST.md`.

---

### 1.2 Caddyfile
**الملف:** `viara-production-package/Caddyfile`

✅ **جيد**  
- يُقيَّد HTTPS العام على `{$DOMAIN}` للبوابة العامة (portal) فقط.  
- حماية صارحة للوصول السريري عبر VPN/mTLS.  
- رؤوس أمان حاضرة: `HSTS (max-age=31536000)`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.  

**ملاحظة:** لا يوجد block لـ `pacs.{$DOMAIN}` في هذا الملف رغم إشارة DEPLOYMENT_CHECKLIST إليه. بناءً على المعمارية، الوصول إلى PACS يتم عبر VPN وليس عبر Caddy مباشرة، وهذا مقبول معمارياً.

---

### 1.3 WireGuard
**الملف:** `viara-production-package/docker-compose.yml` — service: `wireguard`

✅ **جيد**  
- الخدمة تعمل تحت `profiles: ["vpn"]` مما يمنع تفعيلها عن طريق الخطأ.  
- `SERVERURL`, `SERVERPORT`, `PEERS`, `INTERNAL_SUBNET` كلها تُقرأ من `.env`.  
- `healthcheck` يستخدم `wg show`.  
- منفذ UDP 51820 مكشوف على المستوى المقصود.  
- الذاكرة محدودة: 128m.

---

### 1.4 هيكل الحزمة العام

✅ **جيد**  
- سكربتات `backup.sh / restore.sh / restore.bat / backup.bat / setup.sh / start.sh / stop.sh` حاضرة.  
- `keys/` يحتوي على مفاتيح RSA — يجب التحقق من أنها لا تُدرج في أرشيفات التسليم الفعلية (موجود `.gitignore`).  
- `database/migrations/` يضم 215 migration منظمة.  
- `.env.example` شامل لجميع المتغيرات المطلوبة دون قيم حساسة.

---

## 2. CI/CD — `.github/workflows/ci.yml`

### 2.1 تغطية البناء والاختبارات

✅ **جيد**  
تغطي pipeline أربعة محاور:
- **database-migrations:** تشغيل PostgreSQL + Redis في CI، تطبيق migrations كاملة، التحقق من idempotency، اختبار concurrency tokens.
- **backend:** `npm audit --omit=dev --audit-level=high` + `npm run test:ci -- --coverage`.
- **frontend:** `lint` (max-warnings 0) + `npm audit --audit-level=moderate` + locale contract + `npm run test:ci` + production build.
- **portal:** typecheck + API policy check + lint + format + build + tests.

### 2.2 فحص الأسرار وPHI

✅ **جيد — job `no-secrets`:**
```yaml
- name: No patient upload artifacts tracked
  run: if git ls-files -- 'backend/uploads/**' | grep -q .; then ...
- name: No suspicious secret fallbacks in seeders
  run: ! grep -RnE "ENCRYPTION_KEY \|\| '|BLIND_INDEX_KEY \|\| '|..."
```

⚠️ **ملاحظة — نطاق فحص الأسرار محدود**  
فحص `no-secrets` يتحقق فقط من `backend/uploads/**` وبعض الأنماط في `database/`. لا يوجد فحص شامل للأسرار (مثل `trufflehog` أو `gitleaks` أو `detect-secrets`) على كامل الـ repository.

**الإصلاح المقترح:** إضافة خطوة `gitleaks` أو أداة مشابهة في job `no-secrets` لفحص كامل الكود:
```yaml
- name: Secret scan (gitleaks)
  uses: gitleaks/gitleaks-action@v2
```

### 2.3 Migrations

✅ **جيد**  
- يُشغَّل `npm run migrate -- --fresh` ثم `npm run migrate` (تحقق idempotency).  
- يُشغَّل `verify-release-database.cjs` و`verify-release-redis.cjs`.

---

## 3. النسخ الاحتياطي

### 3.1 PostgreSQL Backup

**الملف:** `backend/src/services/postgresBackupService.js`

✅ **ممتاز**  
- `pg_dump --format=custom` عبر `BACKUP_DATABASE_URL` (read-only user).  
- تشفير **AES-256-GCM** مع magic header `VIARABKP2` وrandom IV 96-bit وauthentication tag 128-bit.  
- التحقق الفوري من سلامة dump عبر `pg_restore --list`.  
- الملفات تُحفظ بصلاحية `0o600`، مجلد `backups/` بصلاحية `0o700`.  
- تنظيف تلقائي `cleanupBackups()` بناءً على `BACKUP_RETENTION_DAYS` (افتراضي 30 يوم) و`BACKUP_MAX_FILES`.  
- path traversal protection عبر `resolveBackupPath()`.

### 3.2 Orthanc PACS Backup

**الملف:** `backend/src/services/pacsBackupService.js`

✅ **ممتاز**  
- استخراج جميع DICOM instances عبر Orthanc REST API.  
- تجزئة **SHA-256** لكل instance + manifest.json.  
- تشفير بنفس AES-256-GCM.  
- التحقق من عدم تغيير PACS خلال النسخ `verifyUnchanged()`.  
- استعادة مع re-verification بعد رفع كل ملف إلى Orthanc.

### 3.3 Uploads Backup

**الملف:** `backend/src/services/uploadsBackupService.js`

✅ **ممتاز**  
- يشمل مجلدي `documents/` و`chat/`.  
- SHA-256 manifest + path traversal protection كاملة.  
- يمنع symlinks في مسارات النسخ والاستعادة.  
- تشفير AES-256-GCM مشابه.

### 3.4 الجدولة التلقائية

**الملف:** `backend/src/services/backupScheduler.js`

✅ **جيد**  
- يعمل بشرط `BACKUP_SCHEDULE_ENABLED=true` وهو مُفعَّل في `docker-compose.yml`.  
- يعمل الساعة 02:00 UTC بشكل افتراضي (قابل للتعديل عبر `BACKUP_SCHEDULE_HOUR_UTC`).  
- advisory lock يمنع تشغيل نسختين متزامنتين على replicas متعددة.  
- تسجيل audit event عند النجاح والفشل.  
- Prometheus metrics: `recordBackupSuccess` / `recordBackupFailure`.

### 3.5 النسخ الخارجي (Offsite)

✅ **موجود وموثق**  
- `backupOffsiteReplicator.js` يدعم S3-compatible storage.  
- متغيرات `BACKUP_OFFSITE_*` في `.env.example`.  
- ملف `monitoring/offsite-alerts.yml.example` يحتوي Prometheus rules للتنبيه عند فشل النسخ الخارجي.  
- النسخ الخارجي اختياري، النسخ المحلي دائماً.

---

## 4. Health Checks والمراقبة

### 4.1 Backend Health Routes

**الملف:** `backend/src/server.js` — السطر 593 وما بعده

✅ **جيد**
```javascript
// Liveness probe — فحص بسيط
app.get('/health/live', (req, res) => res.json({ status: 'OK' }));

// Readiness probe — يفحص قاعدة البيانات وClamAV
app.get('/health/ready', readinessHandler);
app.get('/health', readinessHandler);
```
- `/health/ready` يتحقق من `pool.query('SELECT 1')` و`checkClamAv()`.  
- يعيد 503 إذا كان التطبيق في طور التهيئة.  
- `docker-compose.yml` يستخدم `http://127.0.0.1:3000/health/ready` في `healthcheck`.

### 4.2 Prometheus / Grafana

⚠️ **ملاحظة — خارج production package**  
- ملفات المراقبة موجودة في `d:\VIARA\monitoring\` (prometheus.yml + Grafana dashboards) لكنها **غير مضمَّنة** في `viara-production-package/`.  
- فقط `monitoring/offsite-alerts.yml.example` موجود داخل الحزمة.  
- لا يوجد service `prometheus` أو `grafana` في `viara-production-package/docker-compose.yml`.

**الإصلاح المقترح:** إضافة قسم في `DEPLOYMENT_CHECKLIST.md` أو `README.md` يوضح كيفية تفعيل المراقبة، وتضمين `monitoring/` كـ optional profile في docker-compose، أو توثيق كيفية تثبيت Prometheus/Grafana منفصلةً.

### 4.3 Metrics Endpoint

✅ **جيد**  
- `/metrics` محمي بـ `Bearer METRICS_TOKEN` (متغير `METRICS_TOKEN` إلزامي في docker-compose).  
- في حال عدم وجود token، مقيَّد على loopback والشبكات الداخلية RFC-1918 فقط.

---

## 5. التعافي من الكوارث

### 5.1 Disaster Recovery Runbook

**الملف:** `viara-production-package/docs/DISASTER_RECOVERY_RUNBOOK_AR.md` + `docs/DISASTER_RECOVERY_RUNBOOK_AR.md`

✅ **جيد**  
- الـ Runbook موجود في موقعين: داخل الحزمة وفي docs.  
- يوثق 6 أقسام: المعمارية، المتطلبات، الاستعادة الآلية (Linux/Windows)، ما يحدث خلف الكواليس، التحقق اليدوي، الاختبار الدوري.  
- أوامر SQL للتحقق من صحة البيانات بعد الاستعادة.

**الملف:** `viara-production-package/docs/RESTORE.md`

✅ **جيد**  
- يحذر صراحةً: RPO = ما يصل إلى 24 ساعة (نسخة يومية).  
- يوضح أن DICOM **لا يُغطى** بالنسخ الإجرائية التقليدية (يتطلب `.pacs.zip.enc` companion).  
- خطوات تفصيلية (تشفير، فك تشفير، pg_restore، التحقق).

### 5.2 RTO / RPO

⚠️ **ملاحظة — قيم كمية غير معرَّفة رسمياً في الحزمة**  
- `RESTORE.md` يذكر RPO = يوم واحد (24 ساعة) بشكل ضمني.  
- `docs/ON_PREMISE_REMOTE_ACCESS_ARCHITECTURE_2026-10-07_AR.md` يحدد: **RPO < 5 دقائق** و**RTO < 15 دقيقة** — لكن هذا لسيناريو الوصول عن بُعد وليس للاستعادة الكاملة.  
- لا يوجد جدول RTO/RPO موحَّد في Disaster Recovery Runbook يميز بين السيناريوهات (فشل كامل / فساد قاعدة بيانات / فقدان host).

**الإصلاح المقترح:** إضافة قسم في `DISASTER_RECOVERY_RUNBOOK_AR.md` يحدد RTO/RPO لكل سيناريو:
```
| السيناريو | RPO | RTO المستهدف |
|---|---|---|
| فشل قاعدة البيانات مع بقاء backup | ≤ 24 ساعة | ≤ 2 ساعة |
| فشل host كامل | ≤ 24 ساعة | ≤ 4 ساعات |
| تلف جزئي مع بقاء DB | 0 | ≤ 30 دقيقة (rollback image) |
```

### 5.3 Rollback

✅ **موثق**  
- `viara-production-package/BUILD_AND_PUSH.md` يوضح خطوات rollback للصور.  
- `docs/RCMS_DEPLOYMENT_CHECKLIST.md` — القسم 9 "Rollback and Incident Checklist" شامل.  
- تحذير صريح: migrations غير متوافقة للخلف قد تتطلب استعادة database.  
- قسم 5.2 من Threat Model يوثق rollback protocol على مستوى branch (MBT-1010).

---

## 6. أمان النشر

### 6.1 Non-Root Containers

**الملف:** `backend/Dockerfile`

✅ **جيد — Backend**
```dockerfile
RUN ... chown -R node:node /app
USER node
```
المستخدم `node` المدمج في `node:22.23.3-alpine` يعمل بـ UID 1000 (non-root).

⚠️ **ملاحظة — Frontend/Portal يعملان كـ root**  
**الملفات:** `frontend/Dockerfile`, `portal/Dockerfile`  
كلا الـ Dockerfile يستخدمان `nginx:1.30.5-alpine` كمرحلة نهائية دون تحديد `USER`. Nginx الرسمي يشغل worker processes تحت `nginx` user (non-root) لكن المدير الرئيسي يعمل بصلاحيات root.

**الإصلاح المقترح:** استخدام `nginxinc/nginx-unprivileged` أو إضافة `USER nginx` مع تعديل المنافذ لتستخدم 8080 بدلاً من 80 إذا كان النشر يتطلب ذلك. أو التوثيق الصريح بأن هذا مقبول بناءً على سياسة الأمان.

### 6.2 Secrets — عدم وجود hard-coded passwords

✅ **ممتاز**  
- جميع الأسرار في `docker-compose.yml` تستخدم `${VAR:?error message}` مما يمنع تشغيل الحاوية إذا كان المتغير فارغاً.  
- لا توجد كلمات مرور مضمَّنة مباشرةً في أي ملف.  
- `.env.example` لا يحتوي قيماً حساسة.  
- CI يستخدم `viara_ci_password` المنفصل عن بيئة الإنتاج.

مثال من docker-compose.yml:
```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set a unique POSTGRES_PASSWORD in .env}
JWT_SECRET: ${JWT_SECRET:?Set a unique JWT_SECRET in .env}
ENCRYPTION_KEY: ${ENCRYPTION_KEY:?Set a unique ENCRYPTION_KEY in .env}
```

### 6.3 Network Isolation

**الملف:** `viara-production-package/docker-compose.yml`

✅ **ممتاز**  
- شبكة `data` مُضبوطة كـ `internal: true` — PostgreSQL وRedis وOrthant وClamAV معزولان تماماً عن الإنترنت.  
- شبكة `app` للخدمات التي تحتاج تواصلاً داخلياً.  
- شبكة `scanner-egress` منفصلة لـ ClamAV لتحديث التوقيعات.  
- منافذ PostgreSQL وOrthant REST مرتبطة بـ `127.0.0.1` فقط.  
- منافذ Frontend وPortal مرتبطة بـ `127.0.0.1` بشكل افتراضي (`FRONTEND_BIND=127.0.0.1`).  
- DICOM TCP مرتبط بـ `127.0.0.1` بشكل افتراضي (`PACS_DICOM_BIND=127.0.0.1`).

### 6.4 Image Pinning

✅ **جيد**  
- جميع images في `docker-compose.yml` تستخدم `${IMAGE:?error}` — تفرض تحديد الصورة قبل التشغيل.  
- `BUILD_AND_PUSH.md` ينصح باستخدام tags ثابتة وليس `latest`.  
- `backend/Dockerfile` يستخدم `node:22.23.3-alpine` (pinned version).  
- `frontend/Dockerfile` و`portal/Dockerfile` يستخدمان `nginx:1.30.5-alpine` (pinned version).

### 6.5 Database Least Privilege

✅ **ممتاز**  
- Backend يتصل عبر `rcms_app_user` (NOSUPERUSER, NOBYPASSRLS).  
- النسخ الاحتياطي يستخدم `viara_backup_reader` (read-only).  
- الاستعادة تستخدم `RESTORE_DATABASE_URL` (superuser للاستعادة فقط).  
- Migration runner معزول مع صلاحياته الخاصة.

---

## ملخص النتائج

| # | النتيجة | الملف | الخطورة | الإصلاح المقترح |
|---|---|---|---|---|
| 1 | DEPLOYMENT_CHECKLIST.md في الحزمة يغطي VPN فقط | `viara-production-package/DEPLOYMENT_CHECKLIST.md` | ⚠️ | نسخ أو ربط `docs/RCMS_DEPLOYMENT_CHECKLIST.md` داخل الحزمة |
| 2 | فحص الأسرار في CI يغطي أنماطاً محدودة فقط | `.github/workflows/ci.yml` — job `no-secrets` | ⚠️ | إضافة `gitleaks` أو `trufflehog` كخطوة كاملة |
| 3 | Prometheus/Grafana غير مضمَّنين في production package | `viara-production-package/` | ⚠️ | توثيق طريقة تفعيل المراقبة أو إضافة monitoring profile |
| 4 | RTO/RPO غير معرَّفين كمياً في Runbook لجميع السيناريوهات | `viara-production-package/docs/DISASTER_RECOVERY_RUNBOOK_AR.md` | ⚠️ | إضافة جدول RTO/RPO بالأرقام لكل سيناريو استعادة |
| 5 | Frontend/Portal Nginx يعمل كـ root (master process) | `frontend/Dockerfile`, `portal/Dockerfile` | ⚠️ | استخدام `nginx-unprivileged` أو توثيق القرار الأمني |

**لا توجد موانع نشر (🔴) في هذا المحور.**

---

## نقاط القوة البارزة

1. **نظام النسخ الاحتياطي الذري** (PostgreSQL + PACS + Uploads في عملية واحدة متسقة) — تصميم استثنائي نادر في أنظمة مماثلة.
2. **تشفير AES-256-GCM** مع magic header للتحقق من التلاعب — أعلى مستوى من معيار الصناعة.
3. **فصل صلاحيات قاعدة البيانات** (app user / backup reader / restore superuser) — تطبيق ممتاز لمبدأ least privilege.
4. **CI/CD شاملة** تغطي migrations + idempotency + security audit + locale parity في pipeline موحدة.
5. **Network isolation** قوي — `data` network داخلي بالكامل يعزل PostgreSQL/Redis عن أي وصول خارجي.
6. **تحذيرات docker-compose الإلزامية** `:?error` تمنع أي نشر بأسرار فارغة.
