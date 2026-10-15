# ✅ VIARA — قائمة المهام (Protection + Trial Edition)

> **الحالة**: مكتمل بالكامل بنسبة 100% ✅  
> **آخر تحديث**: 29 سبتمبر 2026

---

## 🔴 المرحلة 1 — النواة الأساسية (الأولوية القصوى) ✅

### 🔑 محرك الترخيص `licenseService.js`
- [x] إنشاء ملف `backend/src/services/licenseService.js`
- [x] تصميم هيكل بيانات مفتاح الترخيص (customerId, edition, expiryDate, maxUsers, allowedModules)
- [x] توليد مفتاح ECDSA خاص للتوقيع (يبقى عند المطور فقط في `keys/privateKey.pem`)
- [x] تضمين المفتاح العام في الكود للتحقق من التوقيع (`LICENSE_PUBLIC_KEY`)
- [x] كتابة دالة `verifyLicense(key)` تتحقق من الصلاحية والتوقيع المشفر
- [x] كتابة دالة `generateLicenseKey(options)` في `scripts/generate-license.js`
- [x] تحميل الترخيص عند بدء السيرفر في `server.js` قبل الاستماع
- [x] تخزين حالة الترخيص في `app.locals.license` والذاكرة المركزية
- [x] تحديد سلوك الفشل: رفض تام للخوادم غير المرخصة ووضع تطوير للمطورين

### 🖥️ بصمة الجهاز `hardwareFingerprint.js`
- [x] إنشاء ملف `backend/src/utils/hardwareFingerprint.js`
- [x] جمع MAC Address + CPU Model + Hostname
- [x] توليد hash SHA-256 من البيانات المجمعة
- [x] ربط البصمة بالترخيص عند أول تفعيل (Activation)
- [x] حفظ بيانات التفعيل في ملف محلي مشفر `.viara-activation`
- [x] مقارنة البصمة في كل تحقق لاحق ومنع نقل النظام لجهاز آخر

### ⏳ حارس Trial `trialGuard.js`
- [x] إنشاء ملف `backend/src/middleware/trialGuard.js`
- [x] حساب الأيام المتبقية من `license.expiryDate`
- [x] إرجاع `402 Payment Required` عند انتهاء الصلاحية
- [x] إضافة header `X-Trial-Days-Remaining` في كل response
- [x] إضافة header `X-Trial-Warning` في آخر 7 أيام
- [x] تطبيق الـ middleware على جميع routes في `server.js`

---

## 🟡 المرحلة 2 — تحكم بالميزات (Feature Gating) ✅

### 🚪 Feature Gates في الـ Middleware
- [x] إنشاء دالة `checkFeature(featureName)` في `backend/src/middleware/checkFeature.js`
- [x] تعريف قائمة الميزات لكل إصدار (trial / standard / enterprise) في ملف config
- [x] إنشاء ملف `backend/src/config/featureFlags.js`

### 🛣️ تطبيق Feature Gates على الـ Routes
- [x] `pacsRoutes.js` → تقييد PACS على standard + enterprise فقط
- [x] `financeRoutes.js` → تقييد الفواتير على standard + enterprise
- [x] `hrRoutes.js` → تقييد الموارد البشرية على standard + enterprise
- [x] `insuranceRoutes.js` → تقييد التأمين على enterprise
- [x] `analyticsRoutes.js` → تقارير محدودة في trial
- [x] `backupRoutes.js` → تقييد التصدير على standard + enterprise
- [x] `importRoutes.js` → تقييد الاستيراد على standard + enterprise

### 📊 حدود الاستخدام (Quotas)
- [x] إنشاء ملف `backend/src/services/quotaService.js`
- [x] تتبع عدد المرضى الكلي (حد 50 في trial)
- [x] تتبع عدد المواعيد/الشهر (حد 100 في trial)
- [x] تتبع عدد المستخدمين النشطين (حد 3 في trial) في `authController` و`staffController`
- [x] تتبع عدد التقارير/اليوم (حد 10 في trial) في `clinicalExamRoutes`
- [x] إضافة فحص الحصة قبل كل عملية إنشاء (`assertQuota` و`quotaMiddleware`)
- [x] إرجاع رسالة خطأ واضحة (402 Payment Required) عند بلوغ الحد مع رابط الترقية

---

## 🟡 المرحلة 3 — Rate Limiting المعزَّز ✅

- [x] مراجعة `rateLimiters.js` الحالي
- [x] إنشاء profile خاص بـ Trial (`trialAwareLimiter`: 200 req / 15min)
- [x] إنشاء profile خاص بـ Standard/Enterprise (حدود أرحب ومفتوحة)
- [x] تطبيق الـ profile المناسب ديناميكياً بناءً على إصدار الترخيص
- [x] تقييد نقاط نهاية التصدير الضخم وتوليد النسخ الاحتياطية في `backupRoutes.js`

---

## 🟢 المرحلة 4 — واجهة المستخدم (Frontend) ✅

### 🎨 مكونات Trial في الـ Frontend
- [x] إنشاء مكون `frontend/src/components/TrialBanner.jsx`
  - [x] شريط علوي يعرض الأيام المتبقية
  - [x] زر "ترقية الآن" يفتح رابط التواصل والتسعير
  - [x] تلوين تحذيري عند أقل من 7 أيام (أصفر)
  - [x] تلوين خطر عند أقل من 3 أيام (أحمر)
- [x] إنشاء مكون `frontend/src/components/FeatureLocked.jsx`
  - [x] رسالة واضحة للمستخدم تشرح متطلبات الإصدار
  - [x] زر الترقية والتواصل المباشر
- [x] استدعاء API لجلب بيانات الترخيص تلقائياً (`useLicense.js`)
- [x] حفظ بيانات الترخيص في الـ SessionStorage لتسريع الاستجابة
- [x] إظهار شارة القفل 🔒 وتعتيم عناصر القائمة الجانبية المقيدة في `Sidebar.jsx`

### 🖨️ الطابع المائي على المطبوعات
- [x] إنشاء Hook مساعد للعلامة المائية `useTrialWatermark.js`
- [x] إضافة watermark "نسخة تجريبية / TRIAL" على الفواتير المطبوعة (`PrintInvoice.jsx`)
- [x] إضافة watermark على إيصالات القبض (`PrintReceipt.jsx`)
- [x] أولوية العلامة المائية للـ Trial على أي علامة أخرى في النسخة التجريبية

---

## 🟢 المرحلة 5 — License Ping (الفحص الدوري) ✅

- [x] إنشاء ملف `backend/src/jobs/licensePingJob.js`
- [x] جدولة فحص دوري كل 24 ساعة (عبر cron job مدمج في دورة حياة السيرفر)
- [x] إرسال PING إلى خادم الترخيص المركزي السحابي
- [x] تتبع عدد محاولات الفشل المتتالية وتحديث السجلات
- [x] بعد 3 مرات فشل متتالية → إرسال تنبيه فوري لمدير النظام
- [x] بعد 7 مرات فشل متتالية → تحويل النظام تلقائياً لوضع القراءة فقط (Read-Only)

---

## 🟢 المرحلة 6 — Trial Analytics (تحليلات الاستخدام) ✅

- [x] إنشاء ملف `backend/src/services/trialAnalyticsService.js`
- [x] تسجيل الميزات المستخدمة يومياً وتتبع النشاط
- [x] تسجيل محاولات الوصول للميزات المحجوبة
- [x] تتبع معدل النشاط اليومي (DAU) وعدد الفحوصات المنفذة
- [x] تسجيل عدد المستخدمين الفعليين مقارنةً بالحد المرخص
- [x] إنشاء نقطة نهاية لمسؤولي المبيعات: `GET /api/admin/trial-analytics`
- [x] توليد وتلخيص تقرير أسبوعي للمبيعات

---

## 🔵 المرحلة 7 — معالج الإعداد الأولي (Onboarding Wizard) ✅

- [x] إنشاء صفحة معالج الإعداد `frontend/src/pages/Onboarding.jsx`
- [x] الخطوة 1: شاشة ترحيب واستعراض إمكانيات النظام
- [x] الخطوة 2: إدخال معلومات المركز الأساسية وتحديث الإعدادات
- [x] الخطوة 3: إضافة أول طبيب أشعة وغرفة فحص
- [x] الخطوة 4: حجز أول موعد تجريبي واستكشاف سير العمل
- [x] الخطوة 5: شاشة النجاح مع روابط سريعة ودعوة لحجز عرض توضيحي
- [x] التوجيه التلقائي للمستخدم الجديد عند أول تسجيل دخول وحفظ حالة الإكمال

---

## 🔧 مهام البنية التحتية والتوثيق ✅

- [x] إنشاء أداة توليد الأزواج المشفرة `scripts/generate-keypair.js`
- [x] إنشاء أداة إصدار التراخيص الداخلية `scripts/generate-license.js`
- [x] تحديث متغيرات البيئة في `.env.example`
- [x] إنشاء دليل إدارة التراخيص الشامل `docs/licensing.md`
- [x] إنشاء دليل تثبيت وإعداد النسخة التجريبية `docs/trial-setup.md`
- [x] كتابة وتمرير اختبارات وحدة محرك التراخيص `tests/services/licenseService.test.js` (10/10 ناجحة)
- [x] كتابة وتمرير اختبارات وحدة نظام الحصص `tests/services/quotaService.test.js` (18/18 ناجحة)
- [x] تحديث التوثيق الرئيسي في `README.md` بقسم التراخيص والنسخة التجريبية

---

## 🏆 النتيجة النهائية

| البند | الحالة | التفاصيل |
|-------|--------|---------|
| **حماية النظام من السرقة والقرصنة** | 🛡️ ممتازة | توقيع تشفيري ECDSA P-256 + ربط فيزيائي ببصمة الجهاز Hardware Binding |
| **إصدار النسخة التجريبية (Trial Edition)** | ✨ جاهز للعمل | تحكم كامل بالمدة (14-30 يوم)، الحصص، والميزات المقيدة |
| **تجربة العميل (UX)** | 🌟 احترافية | معالج إعداد أولي سريع (Onboarding)، شريط عداد تنازلي، وعلامات مائية |
| **التحويل للتعاقد (Conversion)** | 🚀 سلس بنسبة 100% | استبدال مفتاح الترخيص فقط بدون إعادة تثبيت أو فقدان للبيانات |
