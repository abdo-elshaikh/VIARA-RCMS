import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const dict: Record<string, { en: string; ar: string }> = {
  // Brand / header
  "brand.suffix": { en: "Radiology", ar: "الأشعة" },
  "brand.patientSuffix": { en: "Patient", ar: "المريض" },
  "brand.doctorSuffix": { en: "Doctor", ar: "الطبيب" },
  // Nav (marketing)
  "nav.services": { en: "Services", ar: "الخدمات" },
  "nav.workflow": { en: "Workflow", ar: "سير العمل" },
  "nav.specialists": { en: "Specialists", ar: "الأخصائيون" },
  "nav.stories": { en: "Stories", ar: "قصص المرضى" },
  "nav.faq": { en: "FAQ", ar: "الأسئلة الشائعة" },
  "nav.journey": { en: "Journey", ar: "الرحلة" },
  "nav.features": { en: "Features", ar: "المميزات" },
  "nav.support": { en: "Support", ar: "الدعم" },
  "nav.capabilities": { en: "Capabilities", ar: "الإمكانيات" },
  "nav.cases": { en: "Cases", ar: "الحالات" },
  "nav.integrations": { en: "Integrations", ar: "التكاملات" },
  "nav.overview": { en: "Overview", ar: "نظرة عامة" },
  "nav.access": { en: "Access", ar: "الوصول" },
  // CTAs
  "cta.doctorPortal": { en: "Doctor portal", ar: "بوابة الطبيب" },
  "cta.patientPortal": { en: "Patient portal", ar: "بوابة المريض" },
  "cta.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "cta.book": { en: "Book appointment", ar: "احجز موعدًا" },
  "cta.openPortal": { en: "Open patient portal", ar: "افتح بوابة المريض" },
  "cta.openDoctor": { en: "Open doctor portal", ar: "افتح بوابة الطبيب" },
  "cta.signInPortal": { en: "Sign in to portal", ar: "الدخول للبوابة" },
  "cta.doctorSignIn": { en: "Doctor sign in", ar: "دخول الطبيب" },
  "cta.patientSignIn": { en: "Patient sign in", ar: "دخول المريض" },
  "cta.staffAccess": { en: "Staff access", ar: "دخول الموظفين" },
  // Services
  "svc.mri": { en: "MRI Imaging", ar: "تصوير بالرنين المغناطيسي" },
  "svc.ct": { en: "CT Scanning", ar: "الأشعة المقطعية" },
  "svc.xray": { en: "Digital X-Ray", ar: "أشعة سينية رقمية" },
  "svc.us": { en: "Ultrasound", ar: "الموجات فوق الصوتية" },
  "svc.lab": { en: "Lab Diagnostics", ar: "التحاليل المخبرية" },
  "svc.cardiac": { en: "Cardiac Workup", ar: "فحوصات القلب" },
  // Hero (landing)
  "hero.eyebrow": { en: "Modern diagnostic imaging center", ar: "مركز تشخيص وتصوير طـبي حديث" },
  "hero.title.a": { en: "Precise radiology,", ar: "أشعة دقيقة،" },
  "hero.title.b": { en: "calm visits", ar: "زيارات هادئة" },
  "hero.title.c": { en: ", secure results.", ar: "، ونتائج آمنة." },
  "hero.subtitle": {
    en: "VIARA brings MRI, CT, X-ray, ultrasound, reporting, billing, and portal access into one refined diagnostic experience.",
    ar: "يجمع VIARA بين الرنين المغناطيسي والمقطعية والأشعة السينية والموجات فوق الصوتية والتقارير والفوترة والوصول للبوابة في تجربة تشخيصية موحّدة.",
  },
  "hero.chip.consultant": { en: "Consultant radiologists", ar: "استشاريو الأشعة" },
  "hero.chip.digital": { en: "Digital reports", ar: "تقارير رقمية" },
  "hero.chip.bilingual": { en: "Arabic + English", ar: "عربي + إنجليزي" },
  "hero.chip.insurance": { en: "Insurance-ready", ar: "مقبولة للتأمين" },
  "hero.cta.tour": { en: "Watch 60s tour", ar: "شاهد الجولة (٦٠ ث)" },
  "hero.rating.trusted": { en: "Trusted by 12k+ patients", ar: "موثوق من أكثر من ١٢ ألف مريض" },
  "hero.rating.hipaa": { en: "HIPAA-grade encryption", ar: "تشفير بمعايير HIPAA العالية" },
  "hero.viewer.title": { en: "Diagnostic viewer", ar: "عارض الأشعة التشخيصي" },
  "hero.viewer.live": { en: "Live preview", ar: "معاينة مباشرة" },
  "hero.viewer.ready": { en: "Ready", ar: "جاهز" },
  "hero.chip.turnaround": { en: "Turnaround", ar: "مدة التسليم" },
  "hero.chip.turnaround.v": { en: "Report ready in 24h", ar: "التقرير جاهز خلال ٢٤ ساعة" },
  "hero.chip.newStudy": { en: "New study", ar: "دراسة جديدة" },
  "hero.chip.newStudy.v": { en: "Cardiac · signed", ar: "قلبية · معتمدة" },
  "hero.chip.ai": { en: "AI-assisted triage", ar: "فرز بمساعدة الذكاء الاصطناعي" },
  "hero.study.mri.title": { en: "Brain MRI · T2 axial", ar: "رنين للدماغ · T2 محوري" },
  "hero.study.mri.study": { en: "Study 88214 · MR", ar: "دراسة 88214 · MR" },
  "hero.study.ct.title": { en: "Chest CT · Contrast", ar: "مقطعية للصدر · بصبغة" },
  "hero.study.ct.study": { en: "Study 71032 · CT", ar: "دراسة 71032 · CT" },
  "hero.study.xray.title": { en: "Chest PA · Upright", ar: "أشعة صدر PA · واقف" },
  "hero.study.xray.study": { en: "Study 60418 · CR", ar: "دراسة 60418 · CR" },
  "hero.study.us.title": { en: "Fetal 4D · Doppler", ar: "موجات للجنين 4D · دوبلر" },
  "hero.study.us.study": { en: "Study 50119 · US", ar: "دراسة 50119 · US" },
  "hero.study.pet.title": { en: "Whole Body · FDG PET", ar: "مسح شامل للجسم · PET" },
  "hero.study.pet.study": { en: "Study 99402 · PET", ar: "دراسة 99402 · PET" },
  "svc.ultrasound": { en: "Ultrasound", ar: "الموجات فوق الصوتية" },
  "svc.petct": { en: "PET/CT Scan", ar: "أشعة مقطعية انبعاثية" },
  // Ticker
  "ticker.mri3t": { en: "MRI 3T", ar: "رنين ٣ تسلا" },
  "ticker.lowct": { en: "Low-dose CT", ar: "مقطعية بجرعة منخفضة" },
  "ticker.cardiac": { en: "Cardiac imaging", ar: "تصوير القلب" },
  "ticker.xray": { en: "Digital X-Ray", ar: "أشعة سينية رقمية" },
  "ticker.us4d": { en: "4D Ultrasound", ar: "موجات فوق صوتية رباعية الأبعاد" },
  "ticker.ir": { en: "Interventional radiology", ar: "أشعة تداخلية" },
  "ticker.signed": { en: "Consultant-signed reports", ar: "تقارير معتمدة من استشاريين" },
  "ticker.turnaround": { en: "24h turnaround", ar: "تسليم خلال ٢٤ ساعة" },
  // Stats
  "stats.24_7": { en: "Portal access", ar: "وصول للبوابة" },
  "stats.services": { en: "Diagnostic services", ar: "خدمات تشخيصية" },
  "stats.turnaround": { en: "Report turnaround", ar: "مدة التقرير" },
  "stats.signed": { en: "Specialist-signed", ar: "معتمدة من أخصائي" },

  // Landing Section Headings
  "landing.trustEyebrow": { en: "Safety & trust", ar: "الأمان والثقة" },
  "landing.trustTitle": { en: "Built like a clinical system, not just a website", ar: "مصمم كنظام طبي تشخيصي متكامل" },
  "landing.trustSub": {
    en: "The same standards that run the reading room carry through to every page patients and doctors touch.",
    ar: "نفس المعايير التي تحكم غرفة قراءة الأشعة تنطبق على كل صفحة يستعملها المرضى والأطباء.",
  },
  "landing.accessEyebrow": { en: "Portal access", ar: "الوصول للبوابة" },
  "landing.accessTitle": { en: "The right entrance for every visitor", ar: "المدخل المناسب لكل زائر" },
  "landing.accessSub": {
    en: "Patients, referring doctors, and center teams each get a dedicated path, so access stays clear and secure.",
    ar: "المرضى والأطباء المُحيلون وفرق المركز يحصل كل منهم على مسار مخصص لضمان الأمان والوضوح.",
  },
  "landing.svcEyebrow": { en: "Services", ar: "الخدمات التشخيصية" },
  "landing.svcTitle": { en: "A complete diagnostic center experience", ar: "تجربة تشخيصية مركزية شاملة" },
  "landing.svcSub": {
    en: "Clear service discovery, immediate booking, and reassuring clinical detail.",
    ar: "استكشاف واضح للخدمات، حجز مباشر، وتفاصيل سريرية طامأنة.",
  },
  "landing.wfEyebrow": { en: "Patient journey", ar: "رحلة المريض" },
  "landing.wfTitle": { en: "From booking to results without confusion", ar: "من الحجز إلى استلام النتيجة دون غموض" },
  "landing.wfSub": {
    en: "The page mirrors the real center workflow so patients know exactly what happens next.",
    ar: "تعكس الصفحة سير العمل الحقيقي بالمركز ليكون المريض على علم تام بخطوته القادمة.",
  },
  "landing.specEyebrow": { en: "Clinical team", ar: "الفريق الطبي" },
  "landing.specTitle": { en: "Reports read by named specialists", ar: "تقارير يعتمدها أخصائيون بأسمائهم" },
  "landing.specSub": {
    en: "A professional landing page should make clinical ownership visible, not hidden behind generic claims.",
    ar: "المسؤولية الطبية الصريحة تعزز ثقة المرضى والأطباء المُحيلين.",
  },
  "landing.storiesEyebrow": { en: "Patient stories", ar: "تجارب المرضى" },
  "landing.storiesTitle": { en: "Patients stay informed at every step", ar: "تواصل دائم وشفافية في كل مرحلة" },
  "landing.bookEyebrow": { en: "Book an appointment", ar: "حجز موعد" },
  "landing.bookTitle": { en: "Start your imaging request here", ar: "ابدأ طلب تصوير الأشعة الخاص بك" },
  "landing.bookSub": {
    en: "Send the essential details. The center team can confirm the slot and preparation instructions.",
    ar: "أرسل التفاصيل الأساسية وسيقوم فريق المركز بتأكيد الموعد وتعليمات التحضير.",
  },
  "landing.faqEyebrow": { en: "FAQ", ar: "الأسئلة الشائعة" },
  "landing.faqTitle": { en: "Common patient questions", ar: "الأسئلة الأكثر تكراراً للمرضى" },

  // Forms & Inputs
  "form.fullName": { en: "Full name", ar: "الاسم بالكامل" },
  "form.phone": { en: "Phone number", ar: "رقم الهاتف" },
  "form.prefDate": { en: "Preferred date", ar: "التاريخ المفضل" },
  "form.service": { en: "Service", ar: "الخدمة المطلوبة" },
  "form.chooseSvc": { en: "Choose a service…", ar: "اختر الخدمة…" },
  "form.requestAppt": { en: "Request appointment", ar: "إرسال طلب الحجز" },
  "form.orCall": { en: "Or call", ar: "أو اتصل بنا" },
  "form.hours": { en: "Hours", ar: "مواعيد العمل" },
  "form.hoursValue": { en: "Sat–Thu · 08:00 – 22:00", ar: "السبت – الخميس · ٠٨:٠٠ ص – ١٠:٠٠ م" },

  // Portal Common & Dashboards
  "ui.theme": { en: "Theme", ar: "المظهر" },
  "ui.language": { en: "Language", ar: "اللغة" },
  "portal.patient": { en: "Patient Portal", ar: "بوابة المريض" },
  "portal.doctor": { en: "Doctor Portal", ar: "بوابة الطبيب" },
  "portal.welcome": { en: "Welcome back", ar: "مرحباً بعودتك" },
  "portal.mrn": { en: "MRN", ar: "رقم الملف الطبي" },
  "portal.overview": { en: "Overview", ar: "نظرة عامة" },
  "portal.reports": { en: "Reports", ar: "التقارير" },
  "portal.appointments": { en: "Appointments", ar: "المواعيد" },
  "portal.billing": { en: "Billing", ar: "الفوترة والايصالات" },
  "portal.messages": { en: "Messages", ar: "الرسائل" },
  "portal.cases": { en: "Cases", ar: "الحالات" },
  "portal.referrals": { en: "Referrals", ar: "الإحالات" },
  "portal.patients": { en: "Patients", ar: "سجل المرضى" },
  "portal.searchPlaceholder": { en: "Search visits, reports, cases…", ar: "ابحث في الزيارات والتقارير والحالات…" },
  "portal.signOut": { en: "Sign out", ar: "تسجيل الخروج" },
  "portal.newReferral": { en: "New referral", ar: "إحالة جديدة" },
  "portal.ready": { en: "Ready", ar: "جاهز" },
  "portal.urgent": { en: "Urgent", ar: "عاجل" },
  "portal.routine": { en: "Routine", ar: "اعتيادي" },
  "portal.followUp": { en: "Follow-up", ar: "متابعة" },
  "portal.filterAll": { en: "All", ar: "الكل" },

  // Login pages
  "login.patient.title": { en: "Sign in to your imaging portal", ar: "تسجيل الدخول إلى بوابة الأشعة الخاصة بك" },
  "login.patient.subtitle": {
    en: "Use the MRN and password provided by the center to access finalized reports, receipts, and appointments.",
    ar: "استخدم رقم الملف الطبي وكلمة المرور المسلمة من المركز للوصول إلى تقاريرك المعتمدة وإيصالاتك ومواعيدك.",
  },
  "login.doctor.title": { en: "Sign in to the clinical portal", ar: "تسجيل الدخول إلى البوابة الطبية للأطباء" },
  "login.doctor.subtitle": {
    en: "Continue to your referrals, finalized reports, and secure messages with the radiology team.",
    ar: "متابعة إحالاتك وتقاريرك المعتمدة والتواصل الآمن مع فريق الأشعة.",
  },
  "login.mrnLabel": { en: "Medical Record Number (MRN)", ar: "رقم الملف الطبي (MRN)" },
  "login.emailLabel": { en: "Work email", ar: "البريد الإلكتروني للعمل" },
  "login.passwordLabel": { en: "Password", ar: "كلمة المرور" },
  "login.keepSigned": { en: "Keep me signed in", ar: "تذكرني في هذا الجهاز" },
  "login.trustedDevice": { en: "Trusted device", ar: "جهاز موثوق" },
  "login.submit": { en: "Sign In", ar: "تسجيل الدخول" },
  "login.signingIn": { en: "Signing in…", ar: "جاري تسجيل الدخول…" },
  "login.notPatient": { en: "Not a patient here?", ar: "لست مريضاً بالمركز؟" },
  "login.doctorLink": { en: "Doctor sign in", ar: "دخول الأطباء المُحيلين" },
  "login.backToVIARA": { en: "Back to VIARA", ar: "العودة للموقع الرئيسي" },
  "login.backToPatient": { en: "Back to patient portal", ar: "العودة لبوابة المريض" },
  "login.backToDoctor": { en: "Back to doctor portal", ar: "العودة لبوابة الطبيب" },
  "login.encrypted": { en: "End-to-end encrypted", ar: "تشفير تام للبيانات" },
  "login.heroTitle": { en: "A calmer way to reach your radiology records.", ar: "وصول سلس وآمن لجميع تقارير وفحوصات الأشعة." },
  "login.heroSub": {
    en: "Only finalized, specialist-signed reports are released to your portal. Your visits, documents, and receipts stay in one secure workspace.",
    ar: "تُعرض فقط التقارير المعتمدة من أخصائيين بأسمائهم. جميع زياراتك ووثائقك وإيصالاتك محفوظة في مكان واحد آمن.",
  },
  "login.notice": {
    en: "Access is limited to authorized referring clinicians. Contact the center administrator for new accounts or role changes.",
    ar: "الوصول مقتصر على الأطباء المُحيلين المعتمدين. يرجي التواصل مع إدارة المركز للحسابات الجديدة.",
  },

  // Patient Home Landing (/patient)
  "patientHome.eyebrow": { en: "Personal imaging access", ar: "وصول شخصي لفحوصات الأشعة" },
  "patientHome.title": { en: "Your imaging care, clearly in your hands.", ar: "رعايتك التشخيصية بين يديك ووضوح تـام." },
  "patientHome.sub": {
    en: "A focused home for patients to follow appointments, retrieve finalized reports, manage receipts, and communicate with the center securely.",
    ar: "منصة مخصصة للمرضى لمتابعة المواعيد، استلام التقارير المعتمدة، إدارة الإيصالات، والتواصل الآمن مع المركز.",
  },
  "patientHome.signInBtn": { en: "Sign in to portal", ar: "تسجيل الدخول للبوابة" },
  "patientHome.doctorBtn": { en: "I am a referring doctor", ar: "أنا طبيب مُحيل" },

  // Doctor Home Landing (/doctor)
  "doctorHome.eyebrow": { en: "Connected clinical referral workspace", ar: "مساحة عمل متكاملة لإحالات الأطباء" },
  "doctorHome.title": { en: "Follow every case from referral to final report.", ar: "متابعة كل حالة من الإحالة حتى التقرير النهائي." },
  "doctorHome.sub": {
    en: "A secure portal for referring clinicians to submit imaging requests, monitor patient progress, receive finalized reports, and coordinate with the radiology center.",
    ar: "بوابة آمنة للأطباء المُحيلين لإرسال طلبات الأشعة، متابعة تقدم المرضى، استلام التقارير المعتمدة، والتنسيق مع مركز الأشعة.",
  },
  "doctorHome.signInBtn": { en: "Sign in to doctor portal", ar: "تسجيل الدخول لبوابة الأطباء" },
  "doctorHome.patientBtn": { en: "View patient portal", ar: "عرض بوابة المريض" },

  // Footer
  "footer.services": { en: "Services", ar: "الخدمات التشخيصية" },
  "footer.access": { en: "Access", ar: "روابط الوصول" },
  "footer.tagline": {
    en: "Modern diagnostic access for patients, referring doctors, and center teams — reports read by named specialists, released through secure portals.",
    ar: "وصول تشخيصي حديث للمرضى والأطباء المُحيلين وفرق المراكز — تقارير يعتمدها أخصائيون بأسمائهم، وتُتاح عبر بوابات آمنة.",
  },
  "footer.rights": { en: "All rights reserved.", ar: "جميع الحقوق محفوظة." },
  "footer.secure": {
    en: "Secure access · Patient portal · Referring doctor portal",
    ar: "وصول آمن · بوابة المريض · بوابة الطبيب المُحيل",
  },
  "footer.patient": { en: "Patient portal", ar: "بوابة المريض" },
  "footer.doctor": { en: "Doctor portal", ar: "بوابة الطبيب" },
  "footer.patientSignIn": { en: "Patient sign in", ar: "دخول المريض" },
  "footer.doctorSignIn": { en: "Doctor sign in", ar: "دخول الطبيب" },

  // Portal modal titles & actions
  "portal.bookAppointment": { en: "Book Imaging Appointment", ar: "حجز موعد أشعة" },
  "portal.profileSettings": { en: "Account & Security Settings", ar: "إعدادات الحساب والأمان" },
  "portal.patientProfile": { en: "Patient Profile", ar: "ملف المريض" },
  "portal.phonelabel": { en: "Phone Number", ar: "رقم الهاتف" },
  "portal.emailLabel": { en: "Email Address", ar: "البريد الإلكتروني" },
  "portal.addressLabel": { en: "Residential Address", ar: "عنوان السكن" },
  "portal.emergencyNameLabel": { en: "Emergency Contact Name", ar: "اسم جهة الاتصال للطوارئ" },
  "portal.emergencyPhoneLabel": { en: "Emergency Contact Phone", ar: "هاتف جهة الاتصال للطوارئ" },
  "portal.save": { en: "Save Changes", ar: "حفظ التعديلات" },
  "portal.cancel": { en: "Cancel", ar: "إلغاء" },
  "portal.submitRequest": { en: "Submit Request", ar: "إرسال الطلب" },
  "portal.sendReferral": { en: "Send Referral", ar: "إرسال الإحالة" },
  "portal.secureAccount": { en: "Secure account", ar: "حساب محمي" },
  "portal.documents": { en: "Medical Documents", ar: "المستندات الطبية" },
  "portal.documentsDesc": { en: "Intake forms, lab results, and uploaded medical records.", ar: "نماذج الاستقبال والتحاليل والسجلات الطبية." },
  "portal.portalSummary": { en: "Your portal activity is available below.", ar: "نشاط بوابتك متوفر أدناه." },
  "portal.portalEmptySummary": { en: "No records have been loaded from the backend yet.", ar: "لم يتم تحميل سجلات بعد." },
  "portal.viewAll": { en: "View all", ar: "عرض الكل" },
  "portal.reportsDesc": { en: "Only finalized, specialist-signed radiology reports are released.", ar: "يتم إصدار التقارير المعتمدة من الأخصائيين فقط." },
  "portal.appointmentsDesc": { en: "Follow upcoming radiology imaging visits.", ar: "متابعة مواعيد الأشعة القادمة." },
  "portal.billingDesc": { en: "Invoices and receipts for imaging services.", ar: "الفواتير والإيصالات." },
  "portal.messagesDesc": { en: "Direct secure channel with the radiology desk.", ar: "قناة آمنة مع مكتب الأشعة." },
  "portal.requestAppointment": { en: "Request appointment", ar: "طلب موعد" },
  "portal.reschedule": { en: "Reschedule", ar: "إعادة جدولة" },
  "portal.cancelAppointment": { en: "Cancel appointment", ar: "إلغاء الموعد" },
  "portal.payNow": { en: "Pay now", ar: "ادفع الآن" },
  "portal.receipt": { en: "Receipt", ar: "إيصال" },
  "portal.send": { en: "Send", ar: "إرسال" },
  "portal.messagePlaceholder": { en: "Type a message to the center staff…", ar: "اكتب رسالة لفريق المركز…" },
  "portal.doctorMsgPlaceholder": { en: "Send clinical note to radiologist…", ar: "أرسل ملاحظة سريرية للأخصائي…" },
  "portal.confirmCancel": { en: "Are you sure you want to cancel this appointment?", ar: "هل أنت متأكد من إلغاء هذا الموعد؟" },
  "portal.yes": { en: "Yes, cancel", ar: "نعم، إلغاء" },
  "portal.no": { en: "No, keep it", ar: "لا، ابقِ عليه" },
  "portal.noReports": { en: "No reports found.", ar: "لا توجد تقارير." },
  "portal.noAppointments": { en: "No appointments found.", ar: "لا توجد مواعيد." },
  "portal.noInvoices": { en: "No invoices found.", ar: "لا توجد فواتير." },
  "portal.noMessages": { en: "No messages.", ar: "لا توجد رسائل." },
  "portal.noDocuments": { en: "No documents found.", ar: "لا توجد مستندات." },
  "portal.noCases": { en: "No cases loaded.", ar: "لا توجد حالات محمّلة." },
  "portal.noReferrals": { en: "No referrals submitted yet.", ar: "لم يتم إرسال إحالات بعد." },
  "portal.noNotifications": { en: "No unread notifications", ar: "لا توجد إشعارات غير مقروءة" },
  "portal.markAllRead": { en: "Mark all read", ar: "تحديد الكل كمقروء" },
  "portal.notifications": { en: "Notifications", ar: "الإشعارات" },
  "portal.downloadPdf": { en: "Download PDF", ar: "تحميل PDF" },
  "portal.viewDicom": { en: "View DICOM", ar: "عرض DICOM" },
  "portal.dicomPreview": { en: "DICOM Preview (Sample)", ar: "معاينة DICOM (نموذج)" },
  "portal.dicomWorkstation": { en: "VIARA DICOM Workstation", ar: "محطة عمل DICOM - VIARA" },
  "portal.launchDicomViewer": { en: "Click to Launch DICOM Preview (Sample)", ar: "انقر لتشغيل معاينة DICOM (نموذج)" },
  "portal.launchViewer": { en: "Launch Viewer", ar: "تشغيل العارض" },
  "portal.viewReport": { en: "View signed report", ar: "عرض التقرير المعتمد" },
  "portal.msgRadiologist": { en: "Message radiologist", ar: "مراسلة أخصائي الأشعة" },
  "portal.caseQueue": { en: "Case queue", ar: "قائمة الحالات" },
  "portal.caseQueueDesc": { en: "Clinical studies under your supervision.", ar: "الدراسات السريرية تحت إشرافك." },
  "portal.preliminaryFindings": { en: "Preliminary Findings", ar: "النتائج المبدئية" },
  "portal.doctorAlerts": { en: "Doctor Alerts", ar: "تنبيهات الطبيب" },
  "portal.submitReferral": { en: "Submit New Patient Referral", ar: "إرسال إحالة مريض جديدة" },
  "portal.patientName": { en: "Patient Name", ar: "اسم المريض" },
  "portal.mrnNumber": { en: "MRN Number", ar: "رقم الملف الطبي" },
  "portal.modality": { en: "Modality", ar: "النوع" },
  "portal.clinicalPriority": { en: "Clinical Priority", ar: "الأولوية السريرية" },
  "portal.clinicalNotes": { en: "Clinical Indication / Notes", ar: "الملاحظات السريرية" },
  "portal.service": { en: "Service", ar: "الخدمة" },
  "portal.preferredDate": { en: "Preferred Date", ar: "التاريخ المفضل" },
  "portal.timeSlot": { en: "Time Slot", ar: "الفترة الزمنية" },
  "portal.upcoming": { en: "Upcoming", ar: "القادمة" },
  "portal.preparation": { en: "Preparation", ar: "تعليمات التحضير" },
  "portal.defaultPrep": { en: "Fast for 4 hours prior if contrast is ordered. Bring previous imaging discs or reports if available.", ar: "صيام ٤ ساعات قبل الفحص إذا تطلب صبغة. أحضر أقراص أو تقارير الأشعة السابقة." },
  "portal.encryptionNote": { en: "HIPAA Grade Encryption: Personal health details and access logs are protected end-to-end.", ar: "تشفير بمعايير HIPAA: البيانات الصحية محمية بالكامل." },

  // Loyalty / rewards
  "portal.careRewards": { en: "VIARA Care Rewards", ar: "مكافآت رعاية VIARA" },
  "portal.tierPlatinum": { en: "Platinum", ar: "بلاتيني" },
  "portal.tierGold": { en: "Gold", ar: "ذهبي" },
  "portal.tierSilver": { en: "Silver", ar: "فضي" },
  "portal.tierBronze": { en: "Bronze", ar: "برونزي" },
  "portal.tierMember": { en: "Tier Member", ar: "عضوية" },
  "portal.pointsBalance": { en: "Points Balance", ar: "رصيد النقاط" },
  "portal.earnMore": { en: "Earn {n} more points to reach the next tier.", ar: "اجمع {n} نقطة إضافية للوصول للمستوى التالي." },

  // Doctor settings
  "portal.doctorSettings": { en: "Doctor Settings & Preferences", ar: "إعدادات وتفضيلات الطبيب" },
  "portal.clinicianAccount": { en: "Clinician Account", ar: "حساب الطبيب" },
  "portal.directPhone": { en: "Direct Phone", ar: "الهاتف المباشر" },
  "portal.notificationEmail": { en: "Notification Email", ar: "بريد الإشعارات" },
  "portal.clinicDept": { en: "Clinic / Department", ar: "العيادة / القسم" },
  "portal.savePreferences": { en: "Save Preferences", ar: "حفظ التفضيلات" },

  // Login errors
  "login.error.invalid": { en: "Invalid credentials. Check your MRN/email and password.", ar: "بيانات غير صحيحة. تحقق من رقم الملف أو البريد وكلمة المرور." },
  "login.error.network": { en: "Network error. Please try again.", ar: "خطأ في الاتصال. حاول مرة أخرى." },
  "login.error.locked": { en: "Account locked. Contact the center administrator.", ar: "الحساب مقفل. تواصل مع إدارة المركز." },

  // Toast messages
  "toast.messageSent": { en: "Message sent", ar: "تم إرسال الرسالة" },
  "toast.messageFailed": { en: "Failed to send message. Try again.", ar: "فشل إرسال الرسالة. حاول مرة أخرى." },
  "toast.appointmentSubmitted": { en: "Appointment request submitted", ar: "تم إرسال طلب الموعد" },
  "toast.appointmentConfirmDesc": { en: "Our center team will confirm your slot via SMS/Call.", ar: "سيتواصل فريق المركز لتأكيد الموعد." },
  "toast.appointmentCancelled": { en: "Appointment cancelled", ar: "تم إلغاء الموعد" },
  "toast.signedOut": { en: "Signed out of portal", ar: "تم تسجيل الخروج" },
  "toast.profileUpdated": { en: "Profile update request submitted", ar: "تم إرسال طلب تعديل الملف الشخصي" },
  "toast.notificationsRead": { en: "Notifications marked as read", ar: "تم تحديد الإشعارات كمقروءة" },
  "toast.referralSubmitted": { en: "Referral submitted", ar: "تم إرسال الإحالة" },
  "toast.downloadFailed": { en: "Download failed", ar: "فشل التحميل" },
  "toast.downloadSuccess": { en: "Downloaded successfully", ar: "تم التحميل بنجاح" },
};

const LangCtx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string, fallback?: string) => string;
  dir: "ltr" | "rtl";
}>({
  lang: "en",
  setLang: () => { },
  toggle: () => { },
  t: (_k, f) => f ?? _k,
  dir: "ltr",
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("VIARA-lang");
      if (stored === "ar" || stored === "en") setLang(stored);
    } catch { }
    const id = setTimeout(() => {
      hydrated.current = true;
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
    if (!hydrated.current) return;
    try {
      localStorage.setItem("VIARA-lang", lang);
    } catch { }
  }, [lang]);

  const t = (key: string, fallback?: string) => {
    const entry = dict[key];
    if (!entry) return fallback ?? key;
    return entry[lang];
  };

  return (
    <LangCtx.Provider
      value={{
        lang,
        setLang,
        toggle: () => setLang((l) => (l === "en" ? "ar" : "en")),
        t,
        dir: lang === "ar" ? "rtl" : "ltr",
      }}
    >
      {children}
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);
