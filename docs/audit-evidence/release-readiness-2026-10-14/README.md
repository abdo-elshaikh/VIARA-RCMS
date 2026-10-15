# أدلة مراجعة جاهزية إصدار VIARA

تخص هذه الأدلة المصدر `dc1d0ab9d40e8b2a4296160c077a7fafded10d35` وتغييراته المحلية بتاريخ 14 أكتوبر 2026. القرار وأولويات المعالجة في [تقرير المراجعة](../../RELEASE_READINESS_REVIEW_2026-10-14_AR.md)، ومعايير الإغلاق في [سجل CSV](../../RELEASE_READINESS_FINDINGS_2026-10-14_AR.csv).

## الاختبارات والتحقق

| الملف | ما يثبته |
|---|---|
| [backend-native-result.json](backend-native-result.json) | الحالة الفعلية لعملية Jest: exit1 مع نجاح1370 اختباراً وتجاوز حدود التغطية |
| [backend-native-jest.json](backend-native-jest.json) | نتائج مجموعات واختبارات الخلفية الكاملة |
| [backend-native-jest.log](backend-native-jest.log) | سجل تشغيل Node مباشرة؛ مسار إعادة التحقق في verify-native-jest.cjs |
| [clinical-ui-checks.json](clinical-ui-checks.json) | اختبارات وبناء الواجهتين وtypecheck وlint وفحص اللغة |
| [frontend-tests.json](frontend-tests.json) و[portal-tests.json](portal-tests.json) | النتائج التفصيلية لاختبارات الواجهتين |
| [security-pacs-tests.json](security-pacs-tests.json) | 28 مجموعة و227 اختباراً؛ جزء من إجمالي الخلفية |
| [frontend-dependency-audit.json](frontend-dependency-audit.json) و[portal-dependency-audit.json](portal-dependency-audit.json) | نتيجة تدقيق تبعيات الإنتاج المحفوظة لكل واجهة |
| [backend-dependency-audit-offline.json](backend-dependency-audit-offline.json) | نتيجة offline فقط؛ لا تثبت حداثة قاعدة الثغرات |

## المحاكاة والمصدر والتشغيل

| الملف | نوع الدليل وحدوده |
|---|---|
| [current-source-manifest.json](current-source-manifest.json) | SHA-256 لعدد1593 ملف مصدر واختبار وإعداد؛ لا يتضمن قيم أسرار التشغيل |
| [previous-source-comparison.json](previous-source-comparison.json) | تطابق27 ملفاً مع بصمات تدقيق تعدد الفروع السابق |
| [security-pacs-probes.json](security-pacs-probes.json) | محاكاة دور الفرع وسياسة RBAC وSSE وإشعارات الفروع وDICOMweb وتجديد العارض؛ دون شبكة أو DB حقيقية |
| [security-pacs-probes.cjs](security-pacs-probes.cjs) | برنامج إعادة المحاكاة المستقلة للأمان وPACS |
| [clinical-assignment-reprobe.json](clinical-assignment-reprobe.json) | إسناد سريري بهويات وعضويات اصطناعية؛ خدمة العضوية مـوك |
| [frontend-branch-reprobe.json](frontend-branch-reprobe.json) | اختلاف مصدر الفرع بين Redux وfetch واحتفاظ rehydrate بفرع غير مصرح |
| [performance-offline-probes.json](performance-offline-probes.json) | محاكاة الذروة وsoak ببيانات فارغة وفحص مصفوفة وبنية object غير مدعومة؛ worklist الحقيقي يعيد مصفوفة وليس items. أداة PACS تقيس metadata فقط. الأزمنة اصطناعية ولا تمثل أداء الخادم |
| [capture-current-evidence.cjs](capture-current-evidence.cjs) | التقاط البصمات ومقارنة الأدلة السابقة وإعادة محاكاة أداة الأداء دون تحميل .env أو الاتصال بخادم |
| [deployment-current-evidence.json](deployment-current-evidence.json) | docker inspect منقح وإعداد Orthanc ومنافذه وCompose بقيم اصطناعية ومطابقة SHA لأرشيف التسليم |
| [capture-deployment-evidence.cjs](capture-deployment-evidence.cjs) | فحص تشغيل للقراءة فقط وتحقق Compose لا يشغل الحاويات؛ صحح تطبيع مسار ZIP بعد التشغيل الأول |

**جرد ZIP في ملف لقطة النشر غير صالح:** راجع `archiveInventoryValid=false`. قارئ التشغيل الأول لم يزل مجلد الأرشيف الجذر؛ لذلك لا تُستخدم أعداد الترحيلات أو قائمة المفقود أو releaseInfo أو comparisons الصادرة عنه. قيم التشغيل ومطابقة SHA بالتدفق مستقلة عن ذلك وصالحة. لم يُعد تشغيل القارئ المصحح بسبب عطل أداة التنفيذ. سجل الحزمة المؤرخ ووثائق التسليم هما مصدر الحكم على عمر الحزمة في التقرير.

الأدلة الديناميكية السابقة على PostgreSQL في [database.json](../multibranch-deep-2026-10-14/database.json) تبقى موسومة كتاريخية. تطابق بصمات مصدرها لا يجعلها تشغيلات جديدة لهذه الجولة. ملفات `backend-jest.log` و`backend-jest-verified.log` توثق محاولتي التحقق الأوليين؛ الحالة الفعلية المعتمدة للعملية محفوظة في `backend-native-result.json`.

## إعادة الفحوص

تشغيل البرامج التالية من جذر المستودع يكتب ملفات أدلة فقط. برنامج Jest يشغّل الاختبارات المحلية؛ برنامج النشر يقرأ الحاويات الموجودة ويفحص Compose وZIP ولا يبدأ الخدمات. لا تُشغّل fixtures الخاصة بالترحيلات أو الاستعادة على قاعدة تشغيل.

```powershell
node docs/audit-evidence/release-readiness-2026-10-14/capture-current-evidence.cjs
node docs/audit-evidence/release-readiness-2026-10-14/security-pacs-probes.cjs
node docs/audit-evidence/release-readiness-2026-10-14/verify-native-jest.cjs
node docs/audit-evidence/release-readiness-2026-10-14/capture-deployment-evidence.cjs
```

أُوقف الفحص الشبكي لتبعيات الخلفية بعد رفض الموافقة التلقائية إرسال metadata إلى سجل خارجي. فُحص البديل offline دون اتصال. تعطل أيضاً تنفيذ فحص قراءة إضافي عند بلوغ حد استخدام خدمة الموافقات، وفشلت بعض محاولات تشغيل أوامر العزل. لم يُنفّذ نشر أو تغيير صلاحيات أو بيانات لإتمام هذه الأدلة.
