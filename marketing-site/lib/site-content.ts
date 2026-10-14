import { z } from 'zod';
export type Locale = 'ar' | 'en';
const short = z.string().trim().max(220);
const long = z.string().trim().max(3000);
export const localizedSchema = z.object({ ar: long, en: long });
const requiredLocalized = localizedSchema.refine(v => Boolean(v.ar.trim() && v.en.trim()), 'Arabic and English text are required');
export type Localized = z.infer<typeof localizedSchema>;
export const L = (ar: string, en: string): Localized => ({ ar, en });
export const txt = (value: Localized, locale: Locale) => value[locale] || value[locale === 'ar' ? 'en' : 'ar'];
const link = z.string().trim().max(600).refine(v => !v || /^https:\/\//i.test(v), 'Use a secure https:// URL');
const asset = z.string().trim().max(600).refine(v => /^https:\/\//i.test(v) || /^\/(assets|api\/media)\/[a-zA-Z0-9/_().-]+$/.test(v) && !v.includes('..'), 'Invalid image URL');
export const planIdSchema = z.enum(['أساس', 'نمو', 'مؤسسات', 'لم أحدد بعد']);
export const offerSchema = z.object({
  id: z.string().uuid(), title: localizedSchema, description: localizedSchema,
  badge: localizedSchema, endDate: z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v),
  active: z.boolean(), plan: planIdSchema,
}).refine(o => !o.active || Boolean(o.title.ar.trim() && o.title.en.trim() && o.description.ar.trim() && o.description.en.trim()), 'Active offers need titles and descriptions in both languages');
export const defaultImagery = {hero:'/assets/scenes/radiology-care.webp',care:'/assets/scenes/medical-team.webp'};
export const siteContentSchema = z.object({
  imagery: z.object({hero:asset,care:asset}).default(defaultImagery),
  brand: z.object({ name: z.string().trim().min(1).max(35), logo: asset, primary: z.string().regex(/^#[0-9a-fA-F]{6}$/), tagline: localizedSchema }),
  seo: z.object({ title: requiredLocalized, description: requiredLocalized }),
  hero: z.object({ badge: localizedSchema, title: requiredLocalized, accent: requiredLocalized, description: requiredLocalized, cta: requiredLocalized }),
  about: z.object({ title: requiredLocalized, body: requiredLocalized }),
  contact: z.object({ email: z.string().trim().max(200).refine(v => !v || z.string().email().safeParse(v).success), phone: z.string().trim().max(30).refine(v => !v || /^[+0-9 ()-]{7,30}$/.test(v) && v.replace(/\D/g,'').length>=7), whatsapp: z.string().trim().max(30).refine(v => !v || /^[+0-9 ()-]{7,30}$/.test(v) && v.replace(/\D/g,'').length>=7), address: localizedSchema, facebook: link, instagram: link, linkedin: link, youtube: link, x: link }),
  products: z.array(z.object({ id: z.enum(['RIS', 'PACS', 'CMS']), name: requiredLocalized, headline: requiredLocalized, description: requiredLocalized, features: z.array(requiredLocalized).min(1).max(12), note: localizedSchema, enabled: z.boolean() })).min(1).max(3).refine(a => new Set(a.map(p => p.id)).size === a.length && a.some(p => p.enabled), 'Keep at least one unique product active'),
  plans: z.array(z.object({ id: z.enum(['أساس', 'نمو', 'مؤسسات']), name: requiredLocalized, label: short, description: requiredLocalized, price: requiredLocalized, features: z.array(requiredLocalized).min(1).max(12), featured: z.boolean(), enabled: z.boolean() })).min(1).max(3).refine(a => new Set(a.map(p => p.id)).size === a.length && a.some(p => p.enabled), 'Keep at least one unique plan active'),
  offers: z.array(offerSchema).max(20),
  faqs: z.array(z.object({ id: z.string().min(1).max(100), question: requiredLocalized, answer: requiredLocalized })).max(20),
  sections: z.object({ reviews: z.boolean(), offers: z.boolean(), about: z.boolean() }),
});
export type SiteContent = z.infer<typeof siteContentSchema>;
export const cairoDay = (date:Date) => {
  const parts = new Intl.DateTimeFormat('en', {timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
export const isOfferActive = (offer:z.infer<typeof offerSchema>, now=new Date()) => offer.active && (!offer.endDate || offer.endDate >= cairoDay(now));
export const defaultContent: SiteContent = {
  imagery: defaultImagery,
  brand: { name: 'VIARA', logo: '/assets/viara-symbol.png', primary: '#007b61', tagline: L('طريقة أفضل للرعاية.', 'A better way to care.') },
  seo: { title: L('VIARA | أنظمة الأشعة والمراكز الطبية', 'VIARA | Radiology & Medical Center Solutions'), description: L('أنظمة VIARA لإدارة مراكز الأشعة والمراكز الطبية. استكشف الحلول والباقات واطلب عرضًا يناسب مركزك.', 'Explore VIARA solutions for radiology and medical centers. Discover systems, packages and a proposal tailored to your facility.') },
  hero: { badge: L('تقنية ترتقي بتجربة الرعاية', 'TECHNOLOGY THAT CARES'), title: L('رعاية أفضل تبدأ', 'Better care starts'), accent: L('بإدارة أذكى.', 'with smarter management.'), description: L('من أول موعد إلى آخر تقرير؛ اجمع تفاصيل مركزك في رحلة عمل أكثر وضوحًا وترابطًا مع حلول VIARA للأشعة والمراكز الطبية.', 'From the first appointment to the final report. Bring your facility’s daily workflow into focus with VIARA solutions for radiology and medical centers.'), cta: L('لنكتشف احتياجات مركزك', 'Let’s find your solution') },
  about: { title: L('التقنية وسيلة. الرعاية هي الغاية.', 'Technology is the means. Care is the purpose.'), body: L('نؤمن أن التقنية الجيدة تبدأ بفهم من يستخدمها. لذلك ننطلق من طريقة عمل مركزك، لنحدد معًا الأدوات التي تساعد فريقك على تنظيم التفاصيل والتركيز على الرعاية.', 'Good technology begins with understanding the people who use it. We start with the way your center works, then define the tools that help your team organize the details and focus on care.') },
  contact: { email: '', phone: '', whatsapp: '', address: L('', ''), facebook: '', instagram: '', linkedin: '', youtube: '', x: '' },
  products: [
    { id:'RIS',name:L('إدارة مراكز الأشعة','Radiology management'),headline:L('رحلة الأشعة، من أول موعد إلى آخر تقرير.','One radiology workflow. From booking to report.'),description:L('نظم استقبال المرضى والفحوصات والتقارير والحسابات في مسار عمل واضح، يتحدد نطاقه حول احتياجات مركزك.','Define a clear workflow for patient reception, examinations, reports and billing, shaped around your center’s needs.'),features:[L('الحجوزات وقوائم العمل حسب نوع الفحص','Appointments and examination worklists'),L('متابعة حالة الفحص والتقرير','Examination and report status tracking'),L('تنظيم الحسابات وجهات التعاقد','Billing and payer workflows'),L('تقارير تشغيلية حول أداء المركز','Operational reporting for your facility')],note:L('تُراجع الأجهزة والتكاملات المطلوبة خلال العرض الفني.','Devices and integrations are reviewed in the technical proposal.'),enabled:true},
    { id:'PACS',name:L('أرشفة الصور الطبية','Medical imaging archive'),headline:L('دراساتك الطبية، في سياق أوضح.','Medical studies. With a clearer context.'),description:L('حدد احتياجات أرشفة الصور الطبية وعرض الدراسات وربطها بسير عمل الأشعة، وفق حجم البيانات والبيئة التقنية.','Plan your imaging archive, study viewing and radiology workflow connections around your data volume and technical environment.'),features:[L('تنظيم الدراسات والصور حسب المريض','Patient-centered study organization'),L('مساحة تخزين وفق حجم العمل','Storage scope based on your workload'),L('بحث ومراجعة الدراسات السابقة','Search and review of previous studies'),L('صلاحيات الوصول للصور والدراسات','Access permissions for images and studies')],note:L('توافق DICOM والعارض والتخزين يحدد بعد المراجعة التقنية.','DICOM compatibility, viewer and storage are confirmed after technical review.'),enabled:true},
    { id:'CMS',name:L('إدارة المراكز الطبية','Medical center management'),headline:L('كل أقسام مركزك، ضمن رحلة واحدة.','Every department. One connected journey.'),description:L('ابدأ باحتياجات الاستقبال والعيادات، وحدد أدوات إدارة ملفات المرضى والمواعيد والحسابات لتنسيق العمل بين الأقسام.','Start with your reception and clinic needs, then define patient records, appointment and billing tools to coordinate your departments.'),features:[L('جدولة المواعيد وإدارة الاستقبال','Appointment scheduling and reception'),L('تنظيم ملفات المرضى والزيارات','Patient records and visit organization'),L('الفواتير والمدفوعات وجهات التعاقد','Invoices, payments and payer workflows'),L('متابعة أداء العيادات والفروع','Clinic and branch performance reporting')],note:L('تحدد الوحدات المطلوبة وفق تخصصات المركز ونطاق التعاقد.','Modules are agreed according to your specialties and contract scope.'),enabled:true},
  ],
  plans: [
    {id:'أساس',name:L('أساس','Essential'),label:'ESSENTIAL',description:L('بداية منظمة لمركزك','A clear foundation for your center'),price:L('عرض مخصص','Tailored quote'),features:[L('النظام الرئيسي حسب تخصص المركز','Core system for your specialty'),L('الحجوزات وملفات المرضى','Appointments and patient records'),L('الفواتير والتقارير الأساسية','Core billing and reporting scope'),L('خطة تهيئة وتدريب','Agreed setup and training plan')],featured:false,enabled:true},
    {id:'نمو',name:L('نمو','Growth'),label:'GROWTH',description:L('مساحة أكبر لتطور أعمالك','Room for your next stage'),price:L('عرض مخصص','Tailored quote'),features:[L('نطاق باقة أساس','Essential package scope'),L('وحدات إضافية حسب الاحتياج','Additional modules for your needs'),L('صلاحيات وتقارير أوسع','Expanded permissions and reporting'),L('خطة ربط الأنظمة المطلوبة','A plan for required integrations')],featured:true,enabled:true},
    {id:'مؤسسات',name:L('مؤسسات','Enterprise'),label:'ENTERPRISE',description:L('حل يتشكل حول مؤسستك','A scope shaped around your organization'),price:L('عرض مخصص','Tailored quote'),features:[L('نطاق مخصص للمؤسسة والفروع','Custom organization and branch scope'),L('دراسة نقل البيانات والتكامل','Data migration and integration review'),L('خطة تنفيذ تناسب البيئة التقنية','An implementation plan for your environment'),L('تدريب ودعم وفق التعاقد','Training and support agreed in your contract')],featured:false,enabled:true},
  ],
  offers: [], sections: { reviews:true, offers:true, about:true },
  faqs: [
    {id:'choose',question:L('كيف أعرف النظام المناسب لمركزي؟','How do I choose the right system?'),answer:L('استخدم مساعد اختيار الحل، ثم أخبرنا بطبيعة مركزك وأولوياته في طلب العرض، حتى يتحدد النظام والوحدات المناسبة.','Use the solution finder, then describe your center and priorities in your request. The proposal will define the system and modules that fit.')},
    {id:'price',question:L('كيف يتم تحديد السعر؟','How is pricing determined?'),answer:L('حسب الوحدات والمستخدمين والفروع والتخزين والتكاملات، ونطاق التهيئة والتدريب والدعم. تعتمد التفاصيل في عرض فني ومالي مخصص.','Pricing depends on modules, users, branches, storage, integrations, setup, training and support. Details are agreed in a tailored technical and commercial proposal.')},
    {id:'migration',question:L('هل يمكن نقل البيانات من نظام سابق؟','Can data be migrated from an existing system?'),answer:L('تدرس إمكانية النقل بعد مراجعة صيغة البيانات وجودتها وإمكانية تصديرها، ثم تحدد الخطة والتكلفة في العرض.','Migration feasibility is assessed after reviewing the data format, quality and export options. The plan and cost are then included in the proposal.')},
    {id:'screens',question:L('هل الواجهات المعروضة هي النظام الفعلي؟','Are the screens actual product screenshots?'),answer:L('الواجهات هنا نماذج توضيحية لشرح سير العمل. المزايا المتاحة والتوافق تراجع خلال العرض الفعلي قبل التعاقد.','The interfaces shown here are illustrative workflow concepts. Available features and compatibility are reviewed in an actual demonstration before contracting.')},
  ],
};
export type PublicReview = { id:string; name:string; role:string; organization:string; quote:string; rating:number; locale:string; createdAt:number };
