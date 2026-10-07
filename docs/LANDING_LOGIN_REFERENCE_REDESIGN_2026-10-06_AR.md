# إعادة تصميم الهبوط والدخول — 6 أكتوبر 2026

أعيدت صياغة الصفحتين وفق الصور المرجعية: خلفية طبية ممتدة، أخضر داكن، خط القاهرة المحلي، عناصر بيضاء بحواف مستديرة، وتراتب واضح للنص والإجراءات.

## النتيجة

- الهبوط: ترويسة عائمة، عنوان عربي من سطرين، ست خدمات، شريط يلخص قدرات النظام، ومعاينة فحوصات زجاجية تتضمن ثلاثة سجلات توضيحية. بقيت أقسام المميزات ومسار العمل والأسئلة الشائعة متاحة.
- الدخول: مشهد محطة أشعة بانورامي، بطاقة نموذج مستقلة على اليمين، شارة ترحيب، حقول واضحة، وإجراءات الدخول والاستعادة ومفتاح المرور. على الهاتف يظهر النموذج مباشرة، مع تمرير طبيعي للمحتوى.
- دعم العربية والإنجليزية والمظهرين الفاتح والداكن، وإعداد تقليل الحركة، وقائمة الهاتف مع إغلاق بزر Escape وإعادة التركيز.
- شريط المعلومات يصف قدرات موجودة مثل RIS + PACS وRBAC وDICOM؛ لا يتضمن أرقامًا تسويقية غير موثقة.

## الملفات

- `frontend/src/pages/Landing.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/styles/PublicReference.css`: مصدر التصميم المشترك.
- `frontend/src/styles/LandingReference.css` و`LoginReferenceDesign.css`: تضمين التصميم بعد تنسيقات كل مسار في بيئتي التطوير والإنتاج.
- تحديث مسارات الخلفيات القديمة في `LoginIllustrative.css` و`LoginReference.css` لتشير إلى صورة موجودة.
- `frontend/vite.config.js`: إبقاء React وReact DOM واعتماداتهما المشتركة ضمن حزمة واحدة؛ إزالة الدورة بين framework وvendor التي سببت خطأ `Cannot set properties of undefined (setting 'Children')` وشاشة فارغة في نسخة الإنتاج.

## التحقق

- نجاح 26 اختبارًا قائمًا في أربع مجموعات للهبوط والدخول ومعاينة حسابات التطوير وحالة الخدمات.
- نجاح ESLint للصفحتين وإعداد Vite، ونجاح بناء الإنتاج.
- معاينة 18 حالة تغطي عروض 320 و390 و820 و1440 و1536 و1720 بكسل، بما فيها شاشة مكتبية قصيرة بارتفاع 696 بكسل. لا تجاوز أفقي أو صور مفقودة أو أخطاء JavaScript في الحالات المفحوصة. النتائج محفوظة في [validation.json](reviews/reference-redesign-2026-10-06/validation.json).
- فحص المتصفح لقائمة الهاتف وإغلاقها من رابط باستخدام Escape، وتبديل اللغة والمظهر، والتحقق من الحقول الفارغة، وفتح نافذة استعادة كلمة المرور وإغلاقها.
- فحص مستقل لنسخة الإنتاج وظهور الصفحتين دون أخطاء JavaScript.
- بقي تنبيه حجم الحزمة العامة الذي يزيد على 500 كيلوبايت بعد التصغير؛ البناء ناجح.

المعاينات النهائية: [الهبوط](reviews/reference-redesign-2026-10-06/landing-production.png)، [الدخول](reviews/reference-redesign-2026-10-06/login-production.png)، [الهاتف — الهبوط](reviews/reference-redesign-2026-10-06/landing-ar-light-390-viewport.png)، [الهاتف — الدخول](reviews/reference-redesign-2026-10-06/login-ar-light-390.png).

## الخلفية المولدة

أنشئت بأداة `image_gen` المدمجة، ثم حفظت بصيغة WebP في [frontend/public/images/viara/login-reference-panorama.webp](../frontend/public/images/viara/login-reference-panorama.webp)، بحجم نحو 104 كيلوبايت. استُخدمت الصورة الطبية الموجودة `landing-radiology.webp` للهبوط.

النص النهائي المستخدم لتوليد الخلفية:

> Use case: photorealistic-natural. Asset type: panoramic website sign-in background, 16:9 landscape. Create a premium bright contemporary radiology clinic interior, soft cool daylight, pale mint and white palette, glass walls, an MRI scanner in the softly blurred center background. Three diagnostic monitors in the lower left foreground on a clean white desk, showing realistic chest X-ray and brain MRI images and a subtle dark clinical worklist. Small green plant beside monitors. Composition: upper left 55% must be quiet very pale blurred wall and glass with ample clean negative space for dark Arabic headline; monitors occupy bottom left quadrant, desk bottom edge. Entire right 38% bright quiet softly blurred glass interior as background behind an overlaid login card. Eye-level architectural photography, elegant clinical atmosphere. No people, no branding, no legible text, no UI cards, no buttons, no watermark. This is only the photographic background asset, not a screenshot or interface mockup.
