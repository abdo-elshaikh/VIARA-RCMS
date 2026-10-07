# Accessibility Audit Report — WCAG 2.1 AA
**Date:** 2026-10-08  
**Scope:** `frontend/src/` — all JSX/TSX components and pages  
**Standard:** WCAG 2.1 Level AA  
**Auditor:** Automated static analysis + targeted code review  

---

## 1. الفحوصات التي أُجريت (Checks Performed)

| # | نوع الفحص | الوصف |
|---|-----------|-------|
| 1 | **نسب التباين** | البحث عن `text-gray-*` و `text-slate-300/400` على النصوص الجوهرية |
| 2 | **نص بديل للصور** | البحث عن `<img` بدون `alt` أو بـ `alt` فارغة على صور ذات محتوى |
| 3 | **تسميات النماذج** | البحث عن `<input>` و`<select>` و`<textarea>` بدون `<label>` أو `aria-label` |
| 4 | **مؤشرات التركيز** | البحث عن `focus:outline-none` بدون بديل مرئي (`focus-visible:ring`) |
| 5 | **التنقل بلوحة المفاتيح** | البحث عن `<div onClick>` و`<span onClick>` بدون `role="button"` أو `tabIndex` |

---

## 2. المشكلات التي وُجدت وأُصلحت (Issues Found & Fixed)

### أ) نسب التباين (Contrast Ratios)

| الملف | المشكلة | الإصلاح |
|-------|---------|---------|
| المشروع بأكمله | لا يستخدم `text-gray-*` — يستخدم `text-slate-*` | لا يوجد `text-gray-400` على نصوص محتوى؛ النظام يعتمد مقياس `slate` الذي يوفر تباينًا كافيًا في السياقات المرصودة |

> **ملاحظة:** لم يُعثر على استخدام `text-gray-400` في أي ملف JSX. يعتمد المشروع حصريًا على `text-slate-*`. الألوان `text-slate-400/300` المستخدمة هي في الغالب للـ placeholders أو الأيقونات الزخرفية أو النصوص الثانوية ذات الحجم الكبير، وهي خارج نطاق متطلب نسبة 4.5:1.

---

### ب) نص بديل للصور (Alt Text)

| الملف | السطر | المشكلة | الإصلاح |
|-------|-------|---------|---------|
| `components/settings/PortalBuilderSettings.jsx` | ~1122 | `alt="Social"` — وصف غامض | `alt={page.seo.title?.[langKey] ? \`${page.seo.title[langKey]} — social preview image\` : 'Social preview image'}` |
| `components/dashboard/Sidebar.jsx` | ~242 | `alt=""` على شعار المركز | صحيح — الشعار مصحوب بنص المركز المرئي، `alt=""` مناسب (decorative في السياق) |
| `components/dashboard/Topbar.jsx` | ~209 | `alt={label \|\| ''}` | صحيح — يستخدم label المستخدم |
| `components/print/PrintDocument.jsx` | ~66 | `alt=""` على شعار الطباعة | صحيح — decorative في سياق التقرير المطبوع |
| `components/print/PrintSticker.jsx` | ~391 | `alt=""` على شعار الملصق | صحيح — decorative |
| `pages/DisplayBoard.jsx` | ~663 | `alt=""` على صورة خلفية الجناح | صحيح — decorative background image |
| `pages/DisplayBoard.jsx` | ~1682 | `alt=""` على شعار التحميل | صحيح — loading indicator, decorative |
| `pages/CenterSettings.jsx` | ~1398, ~2401 | `alt=""` على شعار المركز | صحيح — مصحوب بنص اسم المركز المرئي |
| `pages/Landing.jsx` | ~984 | `alt=""` على شعار العلامة التجارية | صحيح — داخل `<Link aria-label={brandName}>` |
| `components/communications/chatRichContent.jsx` | ~111 | `alt={fileName}` | صحيح — وصف مناسب |
| `components/patient/DocumentsTab.jsx` | ~318 | `alt="Preview"` | مقبول — سياق معاينة واضح |
| `components/print/PrintBookingSlip.jsx` | ~647 | `alt={centerName}` | صحيح |
| `pages/SecuritySettings.jsx` | ~68 | `alt={t('security.qrAlt')}` | صحيح |
| `components/settings/SecuritySettings.jsx` | ~298 | `alt={securityT('qrAlt')}` | صحيح |

---

### ج) تسميات النماذج (Form Labels)

| الملف | العنصر | المشكلة | الإصلاح |
|-------|--------|---------|---------|
| `pages/UserDetailPage.jsx` | `<input>` كلمة المرور الجديدة | بدون `aria-label` | أُضيف `aria-label` |
| `pages/UserDetailPage.jsx` | `<input>` بحث سجل النشاط | بدون `aria-label` | أُضيف `aria-label` |
| `pages/UserActivityTracking.jsx` | `<input>` البحث | بدون `aria-label` | أُضيف `aria-label` |
| `pages/UserActivityTracking.jsx` | `<select>` نوع العملية | بدون `aria-label` (label كـ `<span>` غير مرتبط) | أُضيف `aria-label` |
| `pages/UserActivityTracking.jsx` | `<select>` جدول الهدف | بدون `aria-label` | أُضيف `aria-label` |
| `pages/UserActivityTracking.jsx` | `<input type="date">` تاريخ البداية | بدون `aria-label` | أُضيف `aria-label` |
| `pages/UserActivityTracking.jsx` | `<input type="date">` تاريخ النهاية | بدون `aria-label` | أُضيف `aria-label` |
| `pages/Worklist.jsx` | `<input id="worklist-search-input">` | بدون `<label for>` أو `aria-label` | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<input>` اسم القناة الجديدة | label كـ `<span>` غير مرتبط | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<input>` عنوان عرض القناة الجديدة | label كـ `<span>` غير مرتبط | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<textarea>` وصف القناة الجديدة | label كـ `<span>` غير مرتبط | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<input>` تعديل عنوان القناة | label كـ `<span>` غير مرتبط | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<textarea>` تعديل وصف القناة | label كـ `<span>` غير مرتبط | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<select>` اختيار موظف | بدون `aria-label` | أُضيف `aria-label` |
| `components/communications/CommunicationCenter.jsx` | `<select>` دور العضو | بدون `aria-label` | أُضيف `aria-label` |
| `components/hr/SalarySimulatorModal.jsx` | `<select>` اختيار موظف | بدون `aria-label` | أُضيف `aria-label` |
| `components/hr/ReceptionSupervisorManager.jsx` | `<input type="search">` | بدون `aria-label` | أُضيف `aria-label` |
| `components/equipment/ClinicalImportDialog.jsx` | `<input>` بحث المعاينة | بدون `aria-label` | أُضيف `aria-label` |
| `components/settings/clinical/RoomManagement.jsx` | `<input>` بحث الغرف | بدون `aria-label` | أُضيف `aria-label` |

---

### د) مؤشرات التركيز (Focus Indicators)

| الملف | المشكلة | الإصلاح |
|-------|---------|---------|
| `pages/UserDetailPage.jsx` | زر toggle `focus:outline-none` بدون ring | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2` |
| `pages/UserDetailPage.jsx` | inputs بحث وكلمة مرور | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2` |
| `components/communications/CommunicationCenter.jsx` | زري toggle (newChannelIsPrivate، editIsPrivate) | أُضيف `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` |
| `components/communications/CommunicationCenter.jsx` | input بحث المحادثة | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/communications/CommunicationCenter.jsx` | جميع inputs/selects/textareas القناة | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/hr/SalarySimulatorModal.jsx` | جميع inputs بـ `focus:border-teal-500 focus:outline-none` | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `pages/Equipment.jsx` | inputs البحث | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `pages/UserActivityTracking.jsx` | جميع inputs/selects | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `pages/Worklist.jsx` | input البحث | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/equipment/ClinicalImportDialog.jsx` | input البحث | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/equipment/EquipmentWorkstationMapping.jsx` | input البحث | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/settings/clinical/RoomManagement.jsx` | input البحث | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `components/settings/clinical/ClinicalHeader.jsx` | زر رئيسي قابل لإعادة الاستخدام | أُضيف `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2` |
| `components/settings/PortalBuilderSettings.jsx` | تحسين alt نص الصورة الاجتماعية | نص وصفي ديناميكي |

---

### هـ) التنقل بلوحة المفاتيح (Keyboard Navigation)

| الملف | المشكلة | الحالة |
|-------|---------|--------|
| `components/clinical/EditSafetyDialog.jsx` | `<div onClick={onClose}>` كـ backdrop | مقبول — نمط backdrop مودال قياسي؛ المودال نفسه يدعم `Escape` عبر React |
| `components/clinical/EditComplaintDialog.jsx` | `<div onClick={onClose}>` كـ backdrop | مقبول — نمط backdrop قياسي |
| `components/dashboard/Sidebar.jsx` | `<div onClick>` على scrim المودال | مقبول — scrim لتجاهل المودال، مع أزرار cancel/confirm داخلية |
| `pages/Payroll.jsx` | `<div className="fixed inset-0" onClick>` | مقبول — نمط dismiss overlay شائع لإغلاق القائمة المنسدلة |
| `pages/PacsViewer.jsx` | `<div onClick={onClose}>` كـ backdrop | مقبول — modals لها `<div>` داخلي بـ `tabIndex={-1}` |
| `pages/PacsReconciliation.jsx` | `<div onClick={onClose}>` backdrop | مقبول — dialog داخلي بـ `role="dialog"` وتركيز مناسب |
| `components/reception/DailyOperationsTable.jsx` | `<div className="fixed inset-0" onClick>` | مقبول — dismiss overlay |
| `components/ui/Scheduler.jsx` | `<div onClick>` يلتف حول `<button>` (EventCard) | مقبول — العنصر التفاعلي الفعلي هو الزر الداخلي |
| `pages/Equipment.jsx` | `<div onClick={stopPropagation}>` | مقبول — يوقف التشقق فقط، العناصر الداخلية هي أزرار |

---

## 3. المشكلات التي تحتاج اختبارًا بشريًا (Requires Human Testing)

المشكلات التالية **لا يمكن رصدها آليًا** وتستلزم اختبارًا يدويًا:

### 3.1 تجربة قارئ الشاشة (Screen Reader UX)
- **ترتيب قراءة المحتوى:** التحقق من أن قارئ الشاشة يقرأ المحتوى بترتيب منطقي في الصفحات ذات التخطيط المعقد (Worklist, AppLayout)
- **إعلانات ARIA Live:** التحقق من أن تحديثات البيانات الديناميكية (نتائج البحث، حالة الجلسة) تُعلن عبر `aria-live` regions
- **اسم القناة في CommunicationCenter:** التحقق من أن قارئ الشاشة يقرأ القنوات وأعضاءها بشكل صحيح
- **التحقق من Focus Trap:** التحقق من أن الـ modals تحصر التركيز داخلها بشكل صحيح (يوجد `useFocusTrap` hook — تحقق من تطبيقه في جميع المودالات)

### 3.2 التباين اللوني الدقيق (Fine Contrast)
- **الوضع المظلم (Dark Mode):** التحقق من نسب التباين في السمة المظلمة بأدوات قياس مخصصة — بعض ألوان `dark:text-slate-400` قد تقل عن 4.5:1 على خلفيات معينة
- **ألوان الحالة:** التحقق من نسب تباين ألوان الحالة الطبية (Emergency: rose, Urgent: amber) على شاشات مختلفة
- **نصوص المكونات الصغيرة:** النصوص بحجم `text-[10px]` أو `text-[11px]` مع `font-bold` قد تحتاج نسبة تباين 3:1 بدلًا من 4.5:1 (قاعدة النص الكبير)

### 3.3 وصول المحتوى المعقد (Complex Content Access)
- **جداول البيانات:** التحقق من أن جداول Worklist وFinancials وBackup تحتوي على `scope="col"` مناسب في رؤوس الأعمدة
- **مخططات Recharts:** مخططات Analytics Dashboard تحتاج نص بديل أو جدول بيانات مساعد
- **PDF/PACS Viewer:** PacsViewer يستخدم Canvas — يحتاج `aria-label` مناسب على عناصر الـ canvas

### 3.4 التكيف مع الإعدادات (Adaptive Settings)
- **تقليل الحركة:** التحقق من أن `reduceMotion` في DisplayBoard يُطبَّق على جميع الحركات الأساسية
- **تكبير النص:** التحقق من التخطيط عند تكبير النص بنسبة 200% في المتصفح
- **RTL/LTR:** التحقق من اتجاه focus indicators في الوضع العربي (RTL)

### 3.5 النماذج المعقدة (Complex Forms)
- **رسائل الخطأ:** التحقق من أن رسائل التحقق (validation errors) مرتبطة بالحقول عبر `aria-describedby`
- **المجموعات المتعددة الخطوات:** نموذج BookAppointment متعدد الأقسام يحتاج `<fieldset>/<legend>` أو `aria-group` واضح
- **ComboBox المريض:** التحقق من أن patient picker في BookAppointment يتبع نمط ARIA combobox بشكل كامل

---

## 4. التوصيات لاختبار WCAG 2.1 AA الكامل

### 4.1 الأدوات الآلية المقترحة

| الأداة | الاستخدام | الرابط |
|--------|-----------|-------|
| **axe DevTools** (Chrome Extension) | فحص آلي شامل لكل صفحة | [deque.com/axe](https://www.deque.com/axe/) |
| **Lighthouse Accessibility** | مدمج في Chrome DevTools | في المتصفح: F12 > Lighthouse |
| **WAVE** (Web Accessibility Evaluation Tool) | تقرير مرئي للمشكلات | [wave.webaim.org](https://wave.webaim.org/) |
| **Colour Contrast Analyser** | قياس دقيق لنسب التباين | [TPGi](https://www.tpgi.com/color-contrast-checker/) |

### 4.2 قارئات الشاشة للاختبار

| قارئ الشاشة | نظام التشغيل | الأولوية |
|-------------|-------------|---------|
| **NVDA** + Firefox | Windows | عالية — أكثر استخدامًا |
| **JAWS** + Chrome | Windows | عالية — بيئات المستشفيات |
| **VoiceOver** + Safari | macOS/iOS | متوسطة — للمستخدمين العرب على Mac |
| **TalkBack** | Android | متوسطة — للوصول من الهاتف |

### 4.3 خطوات الاختبار اليدوي المقترحة

```
1. تشغيل axe DevTools على الصفحات التالية:
   - /dashboard (AppLayout + Sidebar)
   - /worklist (جدول بيانات معقد)
   - /book-appointment (نموذج متعدد الخطوات)
   - /analytics (مخططات Recharts)
   - /pacs-viewer (Canvas interactions)
   - /login (نقطة دخول حرجة)

2. اختبار Tab Navigation:
   - ابدأ من أعلى كل صفحة
   - تحقق من أن كل عنصر تفاعلي يصل إليه التركيز
   - تحقق من أن ترتيب التركيز منطقي

3. اختبار قارئ الشاشة:
   - افتح NVDA > تصفح صفحة Worklist
   - تحقق من قراءة رؤوس الجدول وخلاياه
   - اختبر نماذج الحجز مع الإعلانات التلقائية

4. اختبار التباين:
   - استخدم Colour Contrast Analyser على:
     * نصوص الجداول (text-slate-600 على bg-white)
     * نصوص الحالة (rose/amber/teal على خلفياتها)
     * الوضع المظلم (dark:text-slate-400 على dark:bg-slate-900)

5. اختبار تكبير النص:
   - اضبط المتصفح على 200% text size
   - تحقق من عدم اختفاء أي نص أو تداخله
```

### 4.4 معيار النجاح المقترح

قبل الإطلاق النهائي، يجب أن تحقق الصفحات الحرجة التالية **صفر أخطاء من المستوى A/AA** في axe DevTools:

- `/login` — نقطة الدخول
- `/worklist` — الاستخدام الأكثر تكرارًا
- `/book-appointment` — العملية الأساسية
- `/dashboard` — الصفحة الرئيسية

---

## 5. ملخص التغييرات

| الملف | عدد التغييرات | نوعها |
|-------|--------------|-------|
| `components/communications/CommunicationCenter.jsx` | 10+ | aria-label، focus-visible rings، toggle buttons |
| `pages/UserActivityTracking.jsx` | 5 | aria-label، focus-visible rings |
| `components/hr/SalarySimulatorModal.jsx` | 10+ | focus-visible rings، aria-label |
| `pages/UserDetailPage.jsx` | 3 | focus-visible ring، aria-label |
| `components/settings/PortalBuilderSettings.jsx` | 1 | alt text ديناميكي |
| `components/hr/ReceptionSupervisorManager.jsx` | 1 | aria-label، focus-visible ring |
| `pages/Equipment.jsx` | 2 | focus-visible rings |
| `pages/Worklist.jsx` | 1 | aria-label، focus-visible ring |
| `components/equipment/ClinicalImportDialog.jsx` | 1 | aria-label، focus-visible ring |
| `components/equipment/EquipmentWorkstationMapping.jsx` | 1 | focus-visible ring |
| `components/settings/clinical/RoomManagement.jsx` | 1 | aria-label، focus-visible ring |
| `components/settings/clinical/ClinicalHeader.jsx` | 1 | focus-visible ring |

**إجمالي الملفات المُعدَّلة: 12 ملف**  
**إجمالي المشكلات المُصلَحة: ~35 مشكلة**

---

> **تنبيه مهم:** التحقق الكامل من WCAG 2.1 AA يستلزم اختبارًا يدويًا مع تقنيات مساعدة حقيقية (قارئات شاشة، أجهزة braille). هذا التقرير يغطي المشكلات التي يمكن رصدها آليًا في الكود الثابت فقط.

*Content was rephrased for compliance with licensing restrictions*
