import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../node_modules/react-i18next';
import {
    ArrowRight,
    ArrowUpRight,
    Bone,
    CalendarCheck,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    FileText,
    HeartPulse,
    LockKeyhole,
    Loader2,
    MapPin,
    Phone,
    Pause,
    Play,
    Printer,
    Radio,
    ScanLine,
    ShieldCheck,
    Stethoscope,
    UserRound,
    Waves,
    X,
} from 'lucide-react';
import { PortalHeader } from '../components/portal/layout/PortalHeader';
import { PortalFooter } from '../components/portal/layout/PortalFooter';
import { AppointmentForm, type AppointmentFields } from '../components/portal/ui/Form/AppointmentForm';
import { useGetPublicCenterSettingsQuery, useLookupPublicCaseStatusMutation } from '../store/api';
import { normalizeCenterSettings } from '@/utils/centerSettings';

const COPY = {
    en: {
        metaTitle: 'Radiology Services & Online Results',
        skip: 'Skip to main content',
        primaryNav: 'Primary navigation',
        brandSuffix: 'Diagnostic Imaging Center',
        patientPortal: 'Patient Portal',
        doctorPortal: 'Doctor Portal',
        navLinks: [
            { label: 'Home', href: '#main-content' },
            { label: 'Services', href: '#services' },
            { label: 'Our centers', href: '#locations' },
            { label: 'About us', href: '#why-rcms' },
            { label: 'For patients', href: '#patient-guide' },
            { label: 'Contact', href: '#book' },
        ],
        menu: { open: 'Open menu', close: 'Close menu' },
        hero: {
            eyebrow: 'Trusted diagnostic excellence since 2005',
            book: 'Book an appointment', results: 'View my results',
            availability: 'Same-day appointments available', hotline: 'Call our hotline',
            modalities: ['MRI', 'CT', 'Ultrasound', 'X-Ray', 'PET-CT'],
        },
        lookup: {
            title: 'Already have a scan?', desc: 'Enter your medical record number or order number to view a completed report or see when an unfinished report is expected.',
            placeholder: 'MRN or Order number', action: 'Check last case', checking: 'Checking status…',
            secure: 'Private, rate-limited access to your most recent case',
            completed: 'Report completed', pending: 'Report in progress', estimated: 'Estimated completion', delayed: 'Taking longer than the usual estimate',
            viewReport: 'View completed report', checkAnother: 'Check another MRN or Order number', notFound: 'No recent case was found for this MRN or order number.',
            lookupError: 'Case status is temporarily unavailable. Please try again or call the center.', studyDate: 'Study date', lastUpdated: 'Last updated',
            reportTitle: 'Final diagnostic report', print: 'Print report', close: 'Close report', noNarrative: 'The report is finalized, but no narrative content is available in this view.',
        },
        tasks: [
            { icon: CalendarCheck, title: 'Book a scan', desc: 'Request a convenient appointment.', href: '#book', tone: 'emerald' },
            { icon: FileText, title: 'View results', desc: 'Access reports and scan images.', to: '/patient/login', tone: 'blue' },
            { icon: Stethoscope, title: 'Doctor access', desc: 'Review referred patient studies.', to: '/doctor/login', tone: 'violet' },
            { icon: MapPin, title: 'Find a location', desc: 'Choose the nearest imaging center.', href: '#locations', tone: 'orange' },
        ],
        services: {
            eyebrow: 'Our services', title: 'Comprehensive diagnostic solutions',
            desc: 'From routine imaging to advanced molecular studies and image-guided procedures, every service follows a coordinated clinical pathway.',
            action: 'Book this service', all: 'Plan a scan',
            supportTitle: 'Not sure which examination to choose?',
            supportCopy: 'Use your physician request when available, or speak with our scheduling team before booking.',
            stats: ['10 diagnostic services', 'Consultant-led reporting', 'Digital report delivery'],
        },
        why: {
            eyebrow: 'Why choose us',
            title: 'Imaging built around clinical clarity and patient confidence',
            desc: 'From choosing the right examination to receiving the final report, our workflow keeps patients informed and referring doctors connected.',
            items: [
                { icon: ScanLine, title: 'Advanced imaging', desc: 'Modern MRI, CT, ultrasound, mammography, X-ray, and molecular imaging workflows.' },
                { icon: Stethoscope, title: 'Clinical review', desc: 'Studies are prepared for specialist review with the clinical context your doctor provides.' },
                { icon: UserRound, title: 'Patient guidance', desc: 'Clear support for preparation, arrival, comfort, and next steps throughout the visit.' },
                { icon: ShieldCheck, title: 'Connected results', desc: 'Protected online access helps patients and authorized doctors retrieve available records.' },
            ],
            visualLabel: 'One connected imaging journey',
            visualCopy: 'Diagnostic information organized to support clearer clinical decisions.',
            stats: [{ value: 'Since 2005', label: 'Trusted diagnostic care' }, { value: '10', label: 'Imaging services' }, { value: '24/7', label: 'Digital result access' }],
            servicesAction: 'Explore our services', callAction: 'Speak with our team',
        },
        journey: {
            eyebrow: 'What to expect', title: 'A simple patient journey',
            steps: [
                { n: '01', icon: CalendarCheck, title: 'Request', desc: 'Select a service and preferred date.' },
                { n: '02', icon: ClipboardCheck, title: 'Confirm', desc: 'Our team confirms timing and preparation.' },
                { n: '03', icon: UserRound, title: 'Visit', desc: 'Complete your scan with guided support.' },
                { n: '04', icon: FileText, title: 'Results', desc: 'Receive your signed report securely online.' },
            ],
        },
        guide: {
            eyebrow: 'Patient guide', title: 'Prepare for a smoother visit',
            desc: 'Requirements vary by examination. Follow the instructions confirmed by the scheduling team for your specific scan.',
            cards: [
                { icon: FileText, label: 'What to bring', items: ['Government ID or passport', 'Physician request or referral', 'Relevant prior scans and reports'] },
                { icon: Clock3, label: 'Before arrival', items: ['Confirm fasting or hydration instructions', 'Share implant, pregnancy, or contrast concerns', 'Arrive early enough for registration'] },
                { icon: ShieldCheck, label: 'After your scan', items: ['Confirm the expected report time', 'Use the secure patient portal when available', 'Share the signed report with your doctor'] },
            ],
            safetyTitle: 'Have an implant, possible pregnancy, or previous contrast reaction?',
            safetyCopy: 'Tell the scheduling team before your visit so they can check the appropriate preparation and safety pathway.',
        },
        locations: {
            eyebrow: 'Locations', title: 'Multiple branches near you',
            desc: 'Choose the most convenient RCMS location for your visit.', directions: 'Get directions', all: 'View all locations',
        },
        form: {
            eyebrow: 'Appointment request', title: 'Request your appointment',
            desc: 'Share your preferred visit details and our scheduling team will help complete your booking.',
            call: 'Need help? Call', aria: 'Appointment request form', name: 'Full name',
            namePlaceholder: 'Your full name', phone: 'Phone number', phonePlaceholder: '010 0000 0000',
            service: 'Service', date: 'Preferred date', submit: 'Continue booking', submitting: 'Please wait…',
            errors: { name: 'Please enter your full name.', phone: 'Please enter a valid phone number.', date: 'Please select a date from today onward.' },
        },
        faq: {
            eyebrow: 'Frequently asked questions', title: 'Helpful information before your visit',
            desc: 'Clear answers about preparation, appointments, reports, and accessing your results.',
            supportTitle: 'Still need help?', supportCopy: 'Our patient support team can confirm preparation instructions and guide your next step.',
            call: 'Call patient support', book: 'Request an appointment',
            items: [
                { q: 'How do I access my report?', a: 'Use the medical record number check above to view your latest completed report without signing in. Sign in to the patient portal for available images and your broader record history.' },
                { q: 'Do I need preparation before my scan?', a: 'Preparation depends on the examination. Our team provides the correct fasting, hydration, medication, or clothing instructions when your appointment is confirmed.' },
                { q: 'Can my doctor view my images?', a: 'Authorized referring doctors can securely access assigned studies and signed reports through the doctor portal.' },
                { q: 'How soon will I receive my results?', a: 'Most routine reports are available within 24 hours. Urgent studies follow the priority agreed with your referring doctor.' },
                { q: 'Can someone accompany me?', a: 'A companion may usually attend the visit, subject to examination-area safety and privacy requirements. Ask the center when confirming your appointment.' },
                { q: 'How do I change my appointment?', a: 'Call the scheduling team as early as possible. They can review the available times and any preparation instructions that may need to change.' },
                { q: 'What should I do before a contrast examination?', a: 'Tell the team about previous contrast reactions, kidney conditions, pregnancy, and current medication. Follow only the preparation instructions confirmed for your examination.' },
                { q: 'Can I bring previous scans and reports?', a: 'Yes. Relevant prior images and reports help the radiologist compare changes over time. Bring digital media or printed reports when they are available.' },
            ],
        },
        footer: {
            desc: 'Modern diagnostic imaging with secure digital access for patients and referring doctors.',
            services: 'Our services', rights: 'All rights reserved.', secure: 'Secure medical data access',
        },
    },
    ar: {
        metaTitle: 'خدمات الأشعة والنتائج الإلكترونية', skip: 'الانتقال إلى المحتوى الرئيسي',
        primaryNav: 'التنقل الرئيسي', brandSuffix: 'مركز الأشعة التشخيصية',
        patientPortal: 'بوابة المرضى', doctorPortal: 'بوابة الأطباء',
        navLinks: [
            { label: 'الرئيسية', href: '#main-content' }, { label: 'الخدمات', href: '#services' },
            { label: 'فروعنا', href: '#locations' }, { label: 'من نحن', href: '#why-rcms' },
            { label: 'للمرضى', href: '#patient-guide' }, { label: 'تواصل معنا', href: '#book' },
        ],
        menu: { open: 'فتح القائمة', close: 'إغلاق القائمة' },
        hero: { eyebrow: 'تميز تشخيصي موثوق منذ عام 2005', book: 'احجز موعداً', results: 'عرض نتائجي', availability: 'مواعيد متاحة في نفس اليوم', hotline: 'اتصل بالخط الساخن', modalities: ['الرنين', 'المقطعية', 'السونار', 'الأشعة الرقمية', 'PET-CT'] },
        lookup: {
            title: 'أجريت فحصاً بالفعل؟', desc: 'أدخل رقم الملف الطبي أو رقم الطلب لعرض التقرير المكتمل أو معرفة الموعد المتوقع للتقرير غير المكتمل.',
            placeholder: 'رقم الملف الطبي أو الطلب', action: 'تحقق من آخر فحص', checking: 'جارٍ التحقق…',
            secure: 'وصول خاص ومحدود المحاولات إلى أحدث فحص',
            completed: 'اكتمل التقرير', pending: 'التقرير قيد الإعداد', estimated: 'الموعد المتوقع للاكتمال', delayed: 'يستغرق وقتاً أطول من التقدير المعتاد',
            viewReport: 'عرض التقرير المكتمل', checkAnother: 'التحقق من رقم آخر', notFound: 'لم يتم العثور على فحص حديث لرقم الملف الطبي أو الطلب هذا.',
            lookupError: 'حالة الفحص غير متاحة مؤقتاً. حاول مرة أخرى أو اتصل بالمركز.', studyDate: 'تاريخ الفحص', lastUpdated: 'آخر تحديث',
            reportTitle: 'التقرير التشخيصي النهائي', print: 'طباعة التقرير', close: 'إغلاق التقرير', noNarrative: 'تم اعتماد التقرير، لكن محتواه النصي غير متاح في هذا العرض.',
        },
        tasks: [
            { icon: CalendarCheck, title: 'حجز فحص', desc: 'اطلب موعداً مناسباً لك.', href: '#book', tone: 'emerald' },
            { icon: FileText, title: 'عرض النتائج', desc: 'اطلع على التقارير والصور.', to: '/patient/login', tone: 'blue' },
            { icon: Stethoscope, title: 'بوابة الأطباء', desc: 'مراجعة فحوصات المرضى المحولين.', to: '/doctor/login', tone: 'violet' },
            { icon: MapPin, title: 'أقرب فرع', desc: 'اختر مركز الأشعة الأقرب.', href: '#locations', tone: 'orange' },
        ],
        services: { eyebrow: 'خدماتنا', title: 'حلول تشخيصية متكاملة', desc: 'من الفحوصات الروتينية إلى التصوير الجزيئي المتقدم والإجراءات الموجهة بالصور، تتبع كل خدمة مساراً سريرياً منسقاً.', action: 'حجز هذه الخدمة', all: 'خطط لفحصك', supportTitle: 'لست متأكداً من الفحص المناسب؟', supportCopy: 'استخدم طلب الطبيب عند توفره، أو تحدث مع فريق الحجز قبل إتمام الموعد.', stats: ['١٠ خدمات تشخيصية', 'تقارير بإشراف استشاريين', 'تسليم رقمي للتقارير'] },
        why: {
            eyebrow: 'لماذا تختارنا', title: 'تصوير تشخيصي يركز على وضوح القرار وطمأنينة المريض',
            desc: 'من اختيار الفحص المناسب حتى استلام التقرير النهائي، تساعد منظومة العمل المريض على فهم الخطوات وتُبقي الطبيب المحول على اتصال بالنتائج المتاحة.',
            items: [
                { icon: ScanLine, title: 'تقنيات تصوير متقدمة', desc: 'مسارات حديثة للرنين والمقطعية والسونار والماموجرام والأشعة الرقمية والتصوير الجزيئي.' },
                { icon: Stethoscope, title: 'مراجعة سريرية', desc: 'تُجهز الدراسات للمراجعة المتخصصة مع المعلومات السريرية التي يقدمها طبيبك.' },
                { icon: UserRound, title: 'إرشاد المريض', desc: 'دعم واضح للتحضير والوصول والراحة والخطوات التالية طوال الزيارة.' },
                { icon: ShieldCheck, title: 'نتائج مترابطة', desc: 'وصول إلكتروني محمي يساعد المرضى والأطباء المصرح لهم على استرجاع السجلات المتاحة.' },
            ],
            visualLabel: 'رحلة تصوير مترابطة', visualCopy: 'معلومات تشخيصية منظمة لدعم قرارات سريرية أكثر وضوحاً.',
            stats: [{ value: 'منذ 2005', label: 'رعاية تشخيصية موثوقة' }, { value: '١٠', label: 'خدمات تصوير وتشخيص' }, { value: '24/7', label: 'وصول رقمي للنتائج' }],
            servicesAction: 'استكشف خدماتنا', callAction: 'تحدث مع فريقنا',
        },
        journey: {
            eyebrow: 'ماذا تتوقع', title: 'رحلة مريض بسيطة وواضحة',
            steps: [
                { n: '01', icon: CalendarCheck, title: 'الطلب', desc: 'اختر الخدمة والتاريخ المناسب.' },
                { n: '02', icon: ClipboardCheck, title: 'التأكيد', desc: 'نؤكد الموعد وتعليمات التحضير.' },
                { n: '03', icon: UserRound, title: 'الزيارة', desc: 'أجرِ الفحص بمساعدة فريقنا.' },
                { n: '04', icon: FileText, title: 'النتيجة', desc: 'استلم التقرير المعتمد إلكترونياً.' },
            ],
        },
        guide: {
            eyebrow: 'دليل المريض', title: 'استعد لزيارة أكثر سهولة',
            desc: 'تختلف المتطلبات حسب نوع الفحص. اتبع التعليمات التي يؤكدها فريق الحجز لفحصك تحديداً.',
            cards: [
                { icon: FileText, label: 'ما يجب إحضاره', items: ['بطاقة الهوية أو جواز السفر', 'طلب الطبيب أو خطاب التحويل', 'الفحوصات والتقارير السابقة ذات الصلة'] },
                { icon: Clock3, label: 'قبل الوصول', items: ['تأكد من تعليمات الصيام أو شرب المياه', 'أبلغنا عن الأجهزة المزروعة أو الحمل أو حساسية الصبغة', 'احضر مبكراً بما يكفي لإجراءات التسجيل'] },
                { icon: ShieldCheck, label: 'بعد الفحص', items: ['تأكد من الموعد المتوقع للتقرير', 'استخدم بوابة المريض الآمنة عند توفر النتيجة', 'شارك التقرير المعتمد مع طبيبك'] },
            ],
            safetyTitle: 'لديك جهاز مزروع أو احتمال حمل أو تفاعل سابق مع الصبغة؟',
            safetyCopy: 'أخبر فريق الحجز قبل الزيارة حتى يتمكن من مراجعة التحضير ومسار الأمان المناسبين.',
        },
        locations: { eyebrow: 'الفروع', title: 'فروع متعددة بالقرب منك', desc: 'اختر فرع RCMS الأنسب لزيارتك.', directions: 'اتجاهات الفرع', all: 'عرض كل الفروع' },
        form: {
            eyebrow: 'طلب موعد', title: 'اطلب موعدك الآن', desc: 'شارك تفاصيل الزيارة المفضلة وسيساعدك فريق الحجز في إكمال الحجز.',
            call: 'للمساعدة اتصل', aria: 'نموذج طلب موعد', name: 'الاسم بالكامل', namePlaceholder: 'الاسم بالكامل',
            phone: 'رقم الهاتف', phonePlaceholder: '010 0000 0000', service: 'الخدمة', date: 'التاريخ المفضل',
            submit: 'متابعة الحجز', submitting: 'يرجى الانتظار…',
            errors: { name: 'يرجى إدخال الاسم بالكامل.', phone: 'يرجى إدخال رقم هاتف صحيح.', date: 'يرجى اختيار تاريخ من اليوم فصاعداً.' },
        },
        faq: {
            eyebrow: 'الأسئلة الشائعة', title: 'معلومات مفيدة قبل زيارتك',
            desc: 'إجابات واضحة حول التحضير والمواعيد والتقارير والوصول إلى النتائج.',
            supportTitle: 'ما زلت بحاجة إلى مساعدة؟', supportCopy: 'يساعدك فريق دعم المرضى في تأكيد تعليمات التحضير وتحديد خطوتك التالية.',
            call: 'اتصل بدعم المرضى', book: 'اطلب موعداً',
            items: [
                { q: 'كيف أصل إلى التقرير؟', a: 'استخدم رقم الملف الطبي في أداة التحقق أعلاه لعرض أحدث تقرير مكتمل دون تسجيل الدخول. سجل الدخول إلى بوابة المريض لعرض الصور المتاحة وسجل الفحوصات الأوسع.' },
                { q: 'هل يحتاج الفحص إلى تحضير؟', a: 'تختلف التحضيرات حسب نوع الفحص. يرسل فريقنا تعليمات الصيام أو شرب المياه أو الأدوية عند تأكيد الموعد.' },
                { q: 'هل يستطيع طبيبي عرض الصور؟', a: 'يمكن للطبيب المحول والمصرح له الوصول إلى الفحوصات والتقارير المعتمدة من خلال بوابة الأطباء.' },
                { q: 'متى أحصل على النتيجة؟', a: 'تتوفر معظم التقارير العادية خلال 24 ساعة، بينما تتبع الحالات العاجلة الأولوية المتفق عليها مع الطبيب.' },
                { q: 'هل يمكن أن يرافقني شخص؟', a: 'يمكن عادةً حضور مرافق مع مراعاة متطلبات الأمان والخصوصية داخل منطقة الفحص. اسأل المركز عند تأكيد الموعد.' },
                { q: 'كيف أغير موعدي؟', a: 'اتصل بفريق الحجز في أقرب وقت ممكن لمراجعة المواعيد المتاحة وأي تعليمات تحضير تحتاج إلى تعديل.' },
                { q: 'ماذا أفعل قبل فحص يستخدم الصبغة؟', a: 'أخبر الفريق عن أي حساسية سابقة من الصبغة أو أمراض بالكلى أو حمل أو أدوية حالية، واتبع فقط تعليمات التحضير المؤكدة لفحصك.' },
                { q: 'هل يمكنني إحضار الأشعات والتقارير السابقة؟', a: 'نعم. تساعد الصور والتقارير السابقة طبيب الأشعة على مقارنة التغيرات بمرور الوقت. أحضر الوسائط الرقمية أو التقارير المطبوعة عند توفرها.' },
            ],
        },
        footer: { desc: 'أشعة تشخيصية حديثة مع وصول رقمي آمن للمرضى والأطباء المحولين.', services: 'خدماتنا', rights: 'جميع الحقوق محفوظة.', secure: 'وصول آمن للبيانات الطبية' },
    },
};

const SERVICES = {
    en: [
        { icon: ScanLine, name: 'MRI 3.0T', note: 'High-field', category: 'Advanced imaging', desc: 'High-resolution, radiation-free imaging for detailed evaluation of soft tissue and anatomy.', scope: 'Brain · Spine · Joints · Abdomen', image: '/images/scans/mri_device_3d.png' },
        { icon: Radio, name: 'CT 128-Slice', note: 'Fast acquisition', category: 'Cross-sectional imaging', desc: 'Rapid multi-slice imaging with detailed reconstruction for routine and urgent assessment.', scope: 'Chest · Abdomen · Trauma · Angiography', image: '/images/scans/ct_device_3d.png' },
        { icon: Waves, name: 'Ultrasound & Doppler', note: 'Real-time', category: 'Radiation-free imaging', desc: 'Comfortable real-time imaging for organs, soft tissue, pregnancy, and blood flow.', scope: 'Abdomen · Pelvis · Vascular · Pregnancy', image: '/images/scans/ultrasound_device_3d.png' },
        { icon: HeartPulse, name: '3D Mammography', note: 'Tomosynthesis', category: "Women's imaging", desc: 'Detailed breast imaging for screening, diagnostic evaluation, and follow-up.', scope: 'Screening · Diagnostic · Follow-up', image: '/images/scans/mammography_device_3d.png' },
        { icon: Bone, name: 'Digital X-Ray', note: 'Low dose', category: 'General radiography', desc: 'Fast digital radiography with high-quality images and optimized radiation exposure.', scope: 'Chest · Bones · Joints · Spine', image: '/images/scans/xray_device_3d.png' },
        { icon: ScanLine, name: 'PET-CT', note: 'Hybrid imaging', category: 'Molecular imaging', desc: 'Combined metabolic and anatomical imaging to support diagnosis, staging, and follow-up.', scope: 'Oncology · Neurology · Cardiology', image: '/images/scans/petct_device_3d.png' },
        { icon: Bone, name: 'Bone Density (DEXA)', note: 'Quick scan', category: 'Bone health', desc: 'Low-dose measurement of bone mineral density to assess osteoporosis and fracture risk.', scope: 'Spine · Hip · Whole body', image: '/images/scans/xray_device_3d.png' },
        { icon: Radio, name: 'Fluoroscopy & Contrast', note: 'Dynamic imaging', category: 'Special examinations', desc: 'Live X-ray guidance for functional and contrast-enhanced diagnostic studies.', scope: 'Gastrointestinal · Urinary · Swallowing', image: '/images/scans/ct_device_3d.png' },
        { icon: Stethoscope, name: 'Image-Guided Procedures', note: 'Minimally invasive', category: 'Interventional support', desc: 'Imaging guidance for selected diagnostic and therapeutic procedures.', scope: 'Biopsy · Aspiration · Drainage', image: '/images/scans/ultrasound_device_3d.png' },
        { icon: Radio, name: 'Dental & Panoramic', note: 'Digital dental', category: 'Dental imaging', desc: 'Wide-view dental and jaw imaging to support orthodontic, surgical, and routine dental assessment.', scope: 'Teeth · Jaw · TMJ · Orthodontics', image: '/images/scans/dental-panoramic-device-v1.png' },
    ],
    ar: [
        { icon: ScanLine, name: 'الرنين المغناطيسي 3 تسلا', note: 'مجال عالٍ', category: 'تصوير متقدم', desc: 'تصوير عالي الدقة دون إشعاع لتقييم الأنسجة الرخوة والتفاصيل التشريحية.', scope: 'المخ · العمود الفقري · المفاصل · البطن', image: '/images/scans/mri_device_3d.png' },
        { icon: Radio, name: 'المقطعية 128 شريحة', note: 'تصوير سريع', category: 'تصوير مقطعي', desc: 'تصوير سريع متعدد الشرائح مع إعادة بناء تفصيلية للفحوصات الروتينية والعاجلة.', scope: 'الصدر · البطن · الإصابات · الأوعية', image: '/images/scans/ct_device_3d.png' },
        { icon: Waves, name: 'السونار والدوبلر', note: 'تصوير لحظي', category: 'تصوير دون إشعاع', desc: 'تصوير لحظي ومريح للأعضاء والأنسجة والحمل وتدفق الدم.', scope: 'البطن · الحوض · الأوعية · الحمل', image: '/images/scans/ultrasound_device_3d.png' },
        { icon: HeartPulse, name: 'الماموجرام ثلاثي الأبعاد', note: 'توموسينثيسس', category: 'تصوير المرأة', desc: 'تصوير تفصيلي للثدي للفحص الدوري والتشخيص والمتابعة.', scope: 'الفحص الدوري · التشخيص · المتابعة', image: '/images/scans/mammography_device_3d.png' },
        { icon: Bone, name: 'الأشعة الرقمية', note: 'جرعة منخفضة', category: 'الأشعة العامة', desc: 'تصوير رقمي سريع وعالي الجودة مع تحسين جرعة الإشعاع.', scope: 'الصدر · العظام · المفاصل · العمود الفقري', image: '/images/scans/xray_device_3d.png' },
        { icon: ScanLine, name: 'PET-CT', note: 'تصوير هجين', category: 'التصوير الجزيئي', desc: 'دمج التصوير الأيضي والتشريحي لدعم التشخيص وتحديد المراحل والمتابعة.', scope: 'الأورام · الأعصاب · القلب', image: '/images/scans/petct_device_3d.png' },
        { icon: Bone, name: 'قياس كثافة العظام DEXA', note: 'فحص سريع', category: 'صحة العظام', desc: 'قياس منخفض الجرعة لكثافة المعادن بالعظام وتقييم هشاشة العظام وخطر الكسور.', scope: 'العمود الفقري · الفخذ · الجسم بالكامل', image: '/images/scans/xray_device_3d.png' },
        { icon: Radio, name: 'الفلوروسكوبي وفحوصات الصبغة', note: 'تصوير ديناميكي', category: 'فحوصات خاصة', desc: 'أشعة حية لتوجيه الفحوصات الوظيفية والدراسات التشخيصية بالصبغة.', scope: 'الجهاز الهضمي · البولي · البلع', image: '/images/scans/ct_device_3d.png' },
        { icon: Stethoscope, name: 'إجراءات موجهة بالصور', note: 'تدخل محدود', category: 'دعم تداخلي', desc: 'استخدام التصوير لتوجيه إجراءات تشخيصية وعلاجية مختارة.', scope: 'الخزعات · سحب العينات · التصريف', image: '/images/scans/ultrasound_device_3d.png' },
        { icon: Radio, name: 'أشعة الأسنان والبانوراما', note: 'أسنان رقمية', category: 'تصوير الأسنان', desc: 'تصوير واسع للأسنان والفكين لدعم التقويم والجراحة والتقييم الدوري للأسنان.', scope: 'الأسنان · الفك · مفصل الفك · التقويم', image: '/images/scans/dental-panoramic-device-v1.png' },
    ],
};

const BRANCHES = {
    en: [
        { name: 'RCMS Maadi Center', address: '49 Street 199, Maadi, Cairo', phone: '02 2515 0200', position: '8%' },
        { name: 'RCMS Heliopolis Center', address: '8 El Nozha St., Heliopolis, Cairo', phone: '02 2080 2444', position: '38%' },
        { name: 'RCMS 6th of October', address: 'El Mehwar El Markazi, 6th of October', phone: '02 3838 6060', position: '70%' },
    ],
    ar: [
        { name: 'مركز RCMS المعادي', address: '٤٩ شارع ١٩٩، المعادي، القاهرة', phone: '02 2515 0200', position: '8%' },
        { name: 'مركز RCMS مصر الجديدة', address: '٨ شارع النزهة، مصر الجديدة، القاهرة', phone: '02 2080 2444', position: '38%' },
        { name: 'مركز RCMS السادس من أكتوبر', address: 'المحور المركزي، السادس من أكتوبر', phone: '02 3838 6060', position: '70%' },
    ],
};

interface PublicCaseLookup {
    found: boolean;
    completed?: boolean;
    case?: {
        examType?: string;
        modality?: string | null;
        studyDate?: string | null;
        lastUpdatedAt?: string | null;
        status?: { code: string; label: string; progress: number };
    };
    estimate?: { estimatedCompletionAt?: string | null; delayed?: boolean; basedOn?: string };
    report?: {
        status?: string;
        finalizedAt?: string | null;
        signedBy?: string | null;
        signerRole?: string | null;
        sections?: Array<{ key: string; label: string; content: string }>;
        plainText?: string;
    };
}

const REPORT_SECTION_LABELS = {
    en: { clinicalHistory: 'Clinical history', technique: 'Technique', findings: 'Findings', impression: 'Impression', recommendations: 'Recommendations' },
    ar: { clinicalHistory: 'التاريخ المرضي', technique: 'طريقة الفحص', findings: 'النتائج', impression: 'الانطباع التشخيصي', recommendations: 'التوصيات' },
};

const CASE_STATUS_LABELS = {
    en: { completed: 'Report completed', reporting: 'Report in progress', imaging: 'Imaging in progress', preparation: 'Preparing for imaging', arrived: 'Visit checked in', scheduled: 'Appointment scheduled' },
    ar: { completed: 'اكتمل التقرير', reporting: 'التقرير قيد الإعداد', imaging: 'الفحص جارٍ', preparation: 'جارٍ التحضير للفحص', arrived: 'تم تسجيل الوصول', scheduled: 'تم تحديد الموعد' },
};

const PortalLanding = () => {
    const { i18n } = useTranslation('landing');
    const { data: publicSettings } = useGetPublicCenterSettingsQuery();
    const [lookupCaseStatus, { data: caseLookupData, error: caseLookupError, isLoading: caseLookupLoading, reset: resetCaseLookup }] = useLookupPublicCaseStatusMutation();
    const caseLookup = caseLookupData as PublicCaseLookup | undefined;
    const center = normalizeCenterSettings(publicSettings || {});
    const language = ((i18n.resolvedLanguage || i18n.language || 'en').split('-')[0] === 'ar' ? 'ar' : 'en') as keyof typeof COPY;
    const text = COPY[language];
    const isRtl = language === 'ar';
    const services = useMemo(() => SERVICES[language], [language]);
    const branches = BRANCHES[language];
    const centerName = [center.center_name, center.branch_name].filter(Boolean).join(' - ') || 'RCMS Radiology Center';
    const phone = center.phone || '19144';
    const [medicalRecordNumber, setMedicalRecordNumber] = useState('');
    const [bookingOpen, setBookingOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [selectedService, setSelectedService] = useState(services[0]?.name || '');
    const [bookingDraft, setBookingDraft] = useState<AppointmentFields | null>(null);
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const [serviceSlide, setServiceSlide] = useState(0);
    const [servicesPaused, setServicesPaused] = useState(false);
    const [servicesInteracting, setServicesInteracting] = useState(false);
    const [servicesInView, setServicesInView] = useState(false);
    const [servicesPerView, setServicesPerView] = useState(1);
    const bookingDialogRef = useRef<HTMLDivElement | null>(null);
    const reportDialogRef = useRef<HTMLDivElement | null>(null);
    const mrnInputRef = useRef<HTMLInputElement | null>(null);
    const servicesTrackRef = useRef<HTMLDivElement | null>(null);
    const servicesCarouselRef = useRef<HTMLDivElement | null>(null);
    const servicesScrollFrameRef = useRef<number | null>(null);
    const servicePageStarts = useMemo(() => {
        const maxStart = Math.max(0, services.length - servicesPerView);
        const starts = Array.from({ length: Math.ceil(services.length / servicesPerView) }, (_, index) => Math.min(index * servicesPerView, maxStart));
        return Array.from(new Set(starts));
    }, [services.length, servicesPerView]);
    const activeServicePage = servicePageStarts.reduce((closest, start, index) => Math.abs(start - serviceSlide) < Math.abs(servicePageStarts[closest] - serviceSlide) ? index : closest, 0);

    const goToServiceSlide = useCallback((requestedIndex: number, behavior: ScrollBehavior = 'smooth') => {
        const track = servicesTrackRef.current;
        if (!track || !services.length) return;
        const maxIndex = Math.max(0, services.length - servicesPerView);
        const nextIndex = requestedIndex > maxIndex ? 0 : requestedIndex < 0 ? maxIndex : requestedIndex;
        setServiceSlide(nextIndex);
        const card = track.children.item(nextIndex) as HTMLElement | null;
        if (card) {
            const trackRect = track.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const horizontalDelta = isRtl ? cardRect.right - trackRect.right : cardRect.left - trackRect.left;
            track.scrollBy({ left: horizontalDelta, behavior });
        }
    }, [isRtl, services.length, servicesPerView]);

    const syncServiceSlide = useCallback(() => {
        if (servicesScrollFrameRef.current !== null) return;
        servicesScrollFrameRef.current = window.requestAnimationFrame(() => {
            const track = servicesTrackRef.current;
            if (track) {
                const trackRect = track.getBoundingClientRect();
                const trackStart = isRtl ? trackRect.right : trackRect.left;
                let closestIndex = 0;
                let closestDistance = Number.POSITIVE_INFINITY;
                Array.from(track.children).forEach((child, index) => {
                    const rect = child.getBoundingClientRect();
                    const cardStart = isRtl ? rect.right : rect.left;
                    const distance = Math.abs(cardStart - trackStart);
                    if (distance < closestDistance) { closestDistance = distance; closestIndex = index; }
                });
                setServiceSlide(closestIndex);
            }
            servicesScrollFrameRef.current = null;
        });
    }, [isRtl]);

    useEffect(() => {
        const previousTitle = document.title;
        document.title = `${centerName} | ${text.metaTitle}`;
        return () => { document.title = previousTitle; };
    }, [centerName, text.metaTitle]);

    useEffect(() => {
        setSelectedService(services[0]?.name || '');
        setBookingDraft(null);
        setServiceSlide(0);
        const track = servicesTrackRef.current;
        if (track) track.scrollLeft = 0;
    }, [services]);

    useEffect(() => {
        const updatePerView = () => setServicesPerView(window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 2 : 1);
        updatePerView();
        window.addEventListener('resize', updatePerView);
        return () => window.removeEventListener('resize', updatePerView);
    }, []);

    useEffect(() => {
        const carousel = servicesCarouselRef.current;
        if (!carousel || typeof IntersectionObserver === 'undefined') {
            setServicesInView(true);
            return undefined;
        }
        const observer = new IntersectionObserver(([entry]) => setServicesInView(entry.isIntersecting), { threshold: 0.2 });
        observer.observe(carousel);
        return () => observer.disconnect();
    }, []);

    const autoPlayCallback = useRef<() => void>();
    useEffect(() => {
        autoPlayCallback.current = () => {
            if (document.visibilityState === 'visible') goToServiceSlide(servicePageStarts[(activeServicePage + 1) % servicePageStarts.length] || 0);
        };
    }, [activeServicePage, goToServiceSlide, servicePageStarts]);

    useEffect(() => {
        if (!servicesInView || servicesPaused || servicesInteracting || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        const timer = window.setInterval(() => autoPlayCallback.current?.(), 3000);
        return () => window.clearInterval(timer);
    }, [servicesInView, servicesInteracting, servicesPaused]);

    useEffect(() => () => {
        if (servicesScrollFrameRef.current !== null) window.cancelAnimationFrame(servicesScrollFrameRef.current);
    }, []);

    useEffect(() => {
        if (!bookingOpen) return undefined;
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = bookingDialogRef.current;
        const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])') || []);
        const timer = window.setTimeout(() => getFocusable()[0]?.focus(), 0);
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setBookingOpen(false); return; }
            if (event.key !== 'Tab') return;
            const focusable = getFocusable();
            if (!focusable.length) return;
            const first = focusable[0]; const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKey);
        return () => { window.clearTimeout(timer); document.body.style.overflow = overflow; window.removeEventListener('keydown', handleKey); returnFocus?.focus(); };
    }, [bookingOpen]);

    useEffect(() => {
        if (!reportOpen) return undefined;
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const getFocusable = () => Array.from(reportDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') || []);
        const timer = window.setTimeout(() => getFocusable()[0]?.focus(), 0);
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setReportOpen(false); return; }
            if (event.key !== 'Tab') return;
            const focusable = getFocusable();
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKey);
        return () => {
            window.clearTimeout(timer);
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', handleKey);
            returnFocus?.focus();
        };
    }, [reportOpen]);

    const openResults = async (event: FormEvent) => {
        event.preventDefault();
        const mrn = medicalRecordNumber.trim();
        if (!mrn) return;
        setReportOpen(false);
        try {
            await lookupCaseStatus({ mrn }).unwrap();
        } catch (_) {
            // The mutation state renders a privacy-safe, actionable error.
        }
    };

    const clearCaseLookup = () => {
        resetCaseLookup();
        setMedicalRecordNumber('');
        setReportOpen(false);
        window.requestAnimationFrame(() => mrnInputRef.current?.focus());
    };

    const formatCaseDate = (value?: string | null) => {
        if (!value) return isRtl ? 'غير متاح' : 'Not available';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return isRtl ? 'غير متاح' : 'Not available';
        return new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };

    const formatReportDate = (value?: string | null) => {
        if (!value) return 'Not available';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not available';
        return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };

    const localizedCaseStatus = (code?: string) => CASE_STATUS_LABELS[language][code as keyof typeof CASE_STATUS_LABELS.en]
        || (isRtl ? 'جارٍ تحديث الحالة' : 'Status updating');

    const selectService = (serviceName: string) => {
        setSelectedService(serviceName);
        setBookingDraft(null);
    };

    const continueBooking = (values: AppointmentFields) => {
        setBookingDraft(values);
        setBookingOpen(true);
    };

    const openBookingOptions = () => {
        setBookingDraft(null);
        setBookingOpen(true);
    };

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="portal-theme portal-bilingual reference-portal min-h-screen overflow-x-clip bg-white text-[#0b2245] antialiased dark:bg-[#07111f] dark:text-white">
            <a href="#main-content" className="prototype-skip-link">{text.skip}</a>
            <PortalHeader navLinks={text.navLinks} center={center} text={text} isRtl={isRtl} onBook={openBookingOptions} />

            <main id="main-content" tabIndex={-1} className="pt-[97px]">
                <section aria-labelledby="portal-hero-title" className="reference-hero relative isolate overflow-hidden border-b border-[#dce9f5] bg-[#edf6ff] dark:border-slate-800 dark:bg-[#07111f]">
                    <div className="absolute inset-0 -z-10" aria-hidden="true">
                        <img src="/images/rcms-radiology-hero-v2.png" alt="" decoding="async" className={`h-full w-full object-cover ${isRtl ? '-scale-x-100 object-[37%_center]' : 'object-[63%_center]'} dark:opacity-40`} />
                        <div className={`absolute inset-0 ${isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white via-white/90 to-white/10 dark:from-[#07111f] dark:via-[#07111f]/90 dark:to-transparent lg:via-white/74 lg:dark:via-[#07111f]/72`} />
                    </div>

                    <div className="mx-auto max-w-7xl px-4 pb-7 pt-9 sm:px-6 sm:pt-11 lg:px-8 lg:pb-5 lg:pt-7">
                        <div className="grid min-h-[340px] gap-8 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] lg:items-start">
                            <div className="reference-hero-copy max-w-[620px] space-y-4">
                                <div className="inline-flex items-center gap-2 rounded-full border border-[#d8e7f4] bg-white/90 px-3 py-1.5 text-[10px] font-extrabold text-[#075cb7] shadow-sm backdrop-blur">
                                    <ShieldCheck className="h-4 w-4" /><span>{text.hero.eyebrow}</span>
                                </div>
                                <h1 id="portal-hero-title" className="text-[2.45rem] font-black leading-[1.05] tracking-[-.045em] text-[#071d43] sm:text-[3.15rem] lg:text-[2.45rem] xl:text-[3.15rem] dark:text-white">
                                    {isRtl ? <>تصوير دقيق.<br />تشخيص واثق.<br />رعاية أفضل.</> : <>Precision imaging.<br />Confident diagnosis.<br />Better care.</>}
                                </h1>
                                <p className="max-w-xl text-sm font-medium leading-6 text-[#334a67] sm:text-[15px] dark:text-slate-200">
                                    {isRtl ? <>خدمات تصوير تشخيصي متخصصة في <bdi className="font-extrabold">{centerName}</bdi>، مع إرشادات تحضير واضحة وتقارير يراجعها الأطباء ووصول آمن إلى نتائجك.</> : <>Specialist diagnostic imaging at <bdi className="font-extrabold">{centerName}</bdi>, with clear preparation guidance, consultant-led reporting, and secure access to your results.</>}
                                </p>
                                <ul className="reference-modality-pills flex flex-wrap gap-1.5" aria-label={isRtl ? 'خدمات التصوير المتاحة' : 'Available imaging services'}>
                                    {text.hero.modalities.map((modality) => <li key={modality}><ScanLine className="h-3 w-3" />{modality}</li>)}
                                </ul>
                                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                                    <button type="button" onClick={openBookingOptions} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#082761] px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-[#0c347b]">
                                        <CalendarCheck className="h-4 w-4" />{text.hero.book}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                                    </button>
                                    <Link to="/patient/login" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#173c73] bg-white/80 px-5 text-xs font-extrabold text-[#0b2b5b] transition hover:-translate-y-0.5 hover:bg-white dark:bg-slate-900/70 dark:text-white">
                                        {text.hero.results}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                                    </Link>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-7 gap-y-2 pt-2 text-[11px] font-semibold text-[#344b68] dark:text-slate-300">
                                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#35a66f]" />{text.hero.availability}</span>
                                    <a href={`tel:${phone}`} className="flex items-center gap-2 hover:text-[#075cb7]"><Phone className="h-4 w-4 text-[#082761] dark:text-sky-300" />{text.hero.hotline} <b dir="ltr">{phone}</b></a>
                                </div>
                            </div>

                            <form onSubmit={openResults} className="reference-results-card self-end rounded-2xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_55px_-24px_rgba(7,29,67,.5)] backdrop-blur lg:mb-5 lg:ms-auto lg:w-[330px] dark:border-white/10 dark:bg-slate-900/90">
                                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#075cb7] dark:bg-blue-500/10 dark:text-sky-300"><FileText className="h-4.5 w-4.5" /></span><div><h2 className="text-base font-black text-[#0b2245] dark:text-white">{text.lookup.title}</h2><p id="landing-mrn-help" className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{text.lookup.desc}</p></div></div>
                                <div className="mt-3" aria-live="polite">
                                    {!caseLookup && <>
                                        {caseLookupError && <p role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold leading-4 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{text.lookup.lookupError}</p>}
                                        <label className="sr-only" htmlFor="landing-mrn">{text.lookup.placeholder}</label>
                                        <input ref={mrnInputRef} id="landing-mrn" required aria-describedby="landing-mrn-help" value={medicalRecordNumber} onChange={(e) => { if (caseLookupError) resetCaseLookup(); setMedicalRecordNumber(e.target.value); }} autoComplete="username" className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-900 outline-none focus:border-[#075cb7] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder={text.lookup.placeholder} />
                                        <button type="submit" disabled={caseLookupLoading} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#082761] px-4 text-xs font-extrabold text-white transition hover:bg-[#0c347b] disabled:cursor-wait disabled:opacity-70">{caseLookupLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{text.lookup.checking}</> : <>{text.lookup.action}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></>}</button>
                                        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[9px] font-bold text-slate-500 dark:text-slate-400"><LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[#075cb7]" />{text.lookup.secure}</p>
                                    </>}

                                    {caseLookup && !caseLookup.found && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-400/20 dark:bg-amber-400/10"><p className="text-[11px] font-bold leading-5 text-amber-900 dark:text-amber-100">{text.lookup.notFound}</p><button type="button" onClick={clearCaseLookup} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-[10px] font-extrabold text-amber-900 dark:border-amber-300/25 dark:bg-slate-900 dark:text-amber-100">{text.lookup.checkAnother}</button></div>}

                                    {caseLookup?.found && <div className="space-y-3">
                                        <div className={`rounded-xl border p-3 ${caseLookup.completed ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10' : 'border-blue-200 bg-blue-50 dark:border-blue-400/20 dark:bg-blue-400/10'}`}>
                                            <div className="flex items-center justify-between gap-3"><span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${caseLookup.completed ? 'text-emerald-700 dark:text-emerald-200' : 'text-[#075cb7] dark:text-sky-200'}`}>{caseLookup.completed ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{localizedCaseStatus(caseLookup.case?.status?.code)}</span><span className="text-[9px] font-black text-slate-500 dark:text-slate-400">{caseLookup.case?.status?.progress || 0}%</span></div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80 dark:bg-slate-900/60"><span className={`block h-full rounded-full ${caseLookup.completed ? 'bg-emerald-500' : 'bg-[#287ed5]'}`} style={{ width: `${caseLookup.case?.status?.progress || 0}%` }} /></div>
                                        </div>
                                        <div><h3 className="text-sm font-black text-[#0b2245] dark:text-white">{caseLookup.case?.examType}</h3><p className="mt-1 text-[9.5px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{text.lookup.studyDate}: <time dateTime={caseLookup.case?.studyDate || undefined}>{formatCaseDate(caseLookup.case?.studyDate)}</time><span aria-hidden="true"> · </span>{text.lookup.lastUpdated}: <time dateTime={caseLookup.case?.lastUpdatedAt || undefined}>{formatCaseDate(caseLookup.case?.lastUpdatedAt)}</time></p></div>
                                        {!caseLookup.completed && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{text.lookup.estimated}</span><time dateTime={caseLookup.estimate?.estimatedCompletionAt || undefined} className="mt-1 block text-xs font-black text-[#0b2245] dark:text-white">{formatCaseDate(caseLookup.estimate?.estimatedCompletionAt)}</time>{caseLookup.estimate?.delayed && <span className="mt-1 block text-[9px] font-bold text-amber-700 dark:text-amber-300">{text.lookup.delayed}</span>}</div>}
                                        {caseLookup.completed && <button type="button" onClick={() => setReportOpen(true)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white transition hover:bg-emerald-700"><FileText className="h-4 w-4" />{text.lookup.viewReport}</button>}
                                        <button type="button" onClick={clearCaseLookup} className="flex min-h-8 w-full items-center justify-center text-[9.5px] font-extrabold text-[#075cb7] hover:underline dark:text-sky-300">{text.lookup.checkAnother}</button>
                                    </div>}
                                </div>
                            </form>
                        </div>

                        <div className="relative z-10 grid gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4 mt-4 sm:mt-6">
                            {text.tasks.map(({ icon: Icon, title, desc, href, to, tone }) => {
                                const content = <><span className={`reference-task-icon is-${tone}`}><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-black text-[#0b2245] dark:text-white">{title}</strong><small className="mt-1 block text-[11px] leading-4 text-slate-600 dark:text-slate-300">{desc}</small></span><ArrowRight className="h-4 w-4 shrink-0 text-[#082761] rtl:-scale-x-100 dark:text-sky-300" /></>;
                                return to ? <Link key={title} to={to} className="reference-task-card">{content}</Link> : <a key={title} href={href} className="reference-task-card">{content}</a>;
                            })}
                        </div>
                    </div>
                </section>

                <section id="services" className="scroll-mt-28 border-y border-[#dfebf5] bg-gradient-to-b from-[#f6faff] via-white to-[#f8fbff] py-10 dark:border-slate-800 dark:from-[#091522] dark:via-[#07111f] dark:to-[#091522] sm:py-14">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
                            <div className="max-w-3xl">
                                <p className="reference-eyebrow">{text.services.eyebrow}</p>
                                <h2 className="reference-title mt-1">{text.services.title}</h2>
                                <p className="reference-copy max-w-2xl">{text.services.desc}</p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3 lg:w-[31rem]">
                                {text.services.stats.map((stat, index) => <div key={stat} className="flex min-h-14 items-center gap-2 rounded-xl border border-[#d9e7f3] bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/75"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${index === 0 ? 'bg-blue-50 text-[#075cb7]' : index === 1 ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'} dark:bg-white/10`}><CheckCircle2 className="h-4 w-4" /></span><strong className="text-[9.5px] leading-4 text-[#0b2245] dark:text-white">{stat}</strong></div>)}
                            </div>
                        </div>

                        <div ref={servicesCarouselRef} className="mt-7 [overflow-anchor:none]" role="region" aria-roledescription="carousel" aria-label={isRtl ? 'خدمات الأشعة والتصوير' : 'Radiology and imaging services'} onMouseEnter={() => setServicesInteracting(true)} onMouseLeave={() => setServicesInteracting(false)} onTouchStart={() => setServicesInteracting(true)} onTouchEnd={() => setServicesInteracting(false)} onFocusCapture={() => setServicesInteracting(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setServicesInteracting(false); }}>
                            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#dce8f3] bg-white/80 px-3.5 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900/70">
                                <div className="flex items-center justify-between gap-3 sm:justify-start">
                                    <p className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400"><span className="font-black text-[#0b2245] dark:text-white">{isRtl ? 'المجموعة' : 'Collection'} {String(activeServicePage + 1).padStart(2, '0')}</span><span className="mx-1.5">/</span>{String(servicePageStarts.length).padStart(2, '0')}</p>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[8px] font-black ${servicesPaused ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${servicesPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />{servicesPaused ? (isRtl ? 'متوقف' : 'Paused') : (isRtl ? 'تمرير تلقائي' : 'Auto-play')}</span>
                                    <span className="hidden text-[9px] font-semibold text-slate-400 md:inline">{isRtl ? 'اسحب لاستكشاف المزيد' : 'Drag or swipe to explore'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 sm:justify-end">
                                    <div className="flex items-center gap-1" aria-label={isRtl ? 'صفحات الخدمات' : 'Service pages'}>
                                        {servicePageStarts.map((start, index) => <button key={start} type="button" onClick={() => goToServiceSlide(start)} aria-label={`${isRtl ? 'انتقل إلى المجموعة' : 'Go to collection'} ${index + 1}`} aria-current={activeServicePage === index ? 'true' : undefined} className={`h-2 rounded-full transition-all duration-300 ${activeServicePage === index ? 'w-6 bg-[#075cb7] dark:bg-sky-400' : 'w-2 bg-[#cbdcea] hover:bg-[#8ab8e4] dark:bg-slate-600'}`} />)}
                                    </div>
                                    <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                                    <button type="button" onClick={() => setServicesPaused((paused) => !paused)} aria-label={servicesPaused ? (isRtl ? 'تشغيل التمرير التلقائي' : 'Start automatic scrolling') : (isRtl ? 'إيقاف التمرير التلقائي' : 'Pause automatic scrolling')} aria-pressed={servicesPaused} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cbdcea] bg-white text-[#0b3b78] transition hover:border-[#8ab8e4] hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">{servicesPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
                                    <button type="button" onClick={() => goToServiceSlide(servicePageStarts[(activeServicePage - 1 + servicePageStarts.length) % servicePageStarts.length])} aria-label={isRtl ? 'مجموعة الخدمات السابقة' : 'Previous service collection'} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cbdcea] bg-white text-[#0b3b78] transition hover:border-[#8ab8e4] hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">{isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
                                    <button type="button" onClick={() => goToServiceSlide(servicePageStarts[(activeServicePage + 1) % servicePageStarts.length])} aria-label={isRtl ? 'مجموعة الخدمات التالية' : 'Next service collection'} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#082761] text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#0c347b] dark:bg-sky-600 dark:hover:bg-sky-500">{isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                                </div>
                            </div>
                            <div className="relative">
                                <div className={`pointer-events-none absolute inset-y-0 start-0 z-10 w-8 ${isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-[#f8fbff] to-transparent opacity-90 dark:from-[#091522] sm:w-12`} aria-hidden="true" />
                                <div className={`pointer-events-none absolute inset-y-0 end-0 z-10 w-8 ${isRtl ? 'bg-gradient-to-r' : 'bg-gradient-to-l'} from-[#f8fbff] to-transparent opacity-90 dark:from-[#091522] sm:w-12`} aria-hidden="true" />
                                <div ref={servicesTrackRef} tabIndex={0} onScroll={syncServiceSlide} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const forward = isRtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'; goToServiceSlide(servicePageStarts[(activeServicePage + (forward ? 1 : -1) + servicePageStarts.length) % servicePageStarts.length]); } }} className="flex cursor-grab snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-4 active:cursor-grabbing [overflow-anchor:none] [scrollbar-width:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075cb7]/30 [&::-webkit-scrollbar]:hidden">
                                    {services.map(({ icon: Icon, name, note, category, desc, scope, image }, index) => (
                                        <article key={name} role="group" aria-roledescription="slide" aria-label={`${index + 1} / ${services.length}: ${name}`} className="group flex min-h-full w-[84%] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#dce8f3] bg-white shadow-[0_10px_26px_-22px_rgba(8,39,97,.65)] transition duration-300 hover:-translate-y-1 hover:border-[#9fc4e8] hover:shadow-[0_20px_38px_-26px_rgba(8,39,97,.55)] sm:w-[calc((100%_-_0.75rem)/2)] lg:w-[calc((100%_-_2.25rem)/4)] dark:border-slate-700 dark:bg-slate-900/90">
                                            <div className="relative h-32 overflow-hidden border-b border-[#e4edf5] bg-[radial-gradient(circle_at_65%_35%,#ffffff_0%,#e8f3ff_55%,#d7e8f8_100%)] dark:border-slate-700 dark:bg-[radial-gradient(circle_at_65%_35%,#17324e_0%,#10273d_55%,#0c1d2e_100%)]">
                                                <div className="absolute -end-12 -top-14 h-36 w-36 rounded-full bg-sky-300/25 blur-2xl" />
                                                <img src={image} alt="" loading="lazy" decoding="async" className="relative h-full w-full object-contain p-2.5 transition duration-500 group-hover:scale-[1.07]" />
                                                <span className="absolute start-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-[#075cb7] shadow-md backdrop-blur dark:border-white/10 dark:bg-slate-900/85 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
                                                <span className="absolute end-2.5 top-2.5 rounded-full border border-white/80 bg-white/90 px-2 py-1 text-[7.5px] font-black text-[#0b3b78] shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/85 dark:text-sky-200">{note}</span>
                                            </div>
                                            <div className="flex flex-1 flex-col p-3.5">
                                                <p className="text-[7.5px] font-black uppercase tracking-[.12em] text-[#287ed5] dark:text-sky-300">{category}</p>
                                                <h3 className="mt-1 text-sm font-black leading-5 text-[#0b2245] dark:text-white">{name}</h3>
                                                <p className="mt-1.5 text-[9.5px] leading-[1.05rem] text-slate-600 dark:text-slate-300">{desc}</p>
                                                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[#f5f9fd] px-2.5 py-2 text-[8.5px] font-bold leading-3.5 text-slate-600 dark:bg-slate-800/75 dark:text-slate-300"><CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-300" /><span>{scope}</span></p>
                                                <a href="#book" onClick={() => selectService(name)} className="mt-3 inline-flex min-h-8 items-center justify-between gap-2 border-t border-[#e7eef5] pt-2.5 text-[9.5px] font-extrabold text-[#075cb7] transition hover:text-[#082761] dark:border-slate-700 dark:text-sky-300"><span>{text.services.action}</span><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 transition group-hover:bg-[#082761] group-hover:text-white dark:bg-white/10"><ArrowRight className="h-3 w-3 rtl:-scale-x-100" /></span></a>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-1 flex items-center gap-3" aria-hidden="true"><div className="h-1 flex-1 overflow-hidden rounded-full bg-[#dce8f3] dark:bg-slate-800"><span className="block h-full rounded-full bg-gradient-to-r from-[#075cb7] via-[#2ca6d9] to-[#20a786] transition-[width] duration-500" style={{ width: `${Math.min(100, ((activeServicePage + 1) / servicePageStarts.length) * 100)}%` }} /></div><span className="text-[8px] font-black tabular-nums text-slate-400">{String(activeServicePage + 1).padStart(2, '0')}</span></div>
                        </div>

                        <div className="relative mt-6 overflow-hidden rounded-2xl bg-[#082761] px-5 py-5 text-white shadow-xl shadow-blue-950/10 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-7">
                            <div className="absolute -end-16 -top-20 h-48 w-48 rounded-full border-[32px] border-sky-400/10" aria-hidden="true" />
                            <div className="relative flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sky-200"><Stethoscope className="h-5 w-5" /></span><span><strong className="block text-sm font-black">{text.services.supportTitle}</strong><small className="mt-1 block max-w-2xl text-[10.5px] leading-5 text-blue-100">{text.services.supportCopy}</small></span></div>
                            <div className="relative mt-4 flex shrink-0 flex-col gap-2 min-[420px]:flex-row sm:mt-0"><a href={`tel:${phone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-[10.5px] font-extrabold text-[#082761] transition hover:bg-sky-50"><Phone className="h-4 w-4" /><span dir="ltr">{phone}</span></a><a href="#book" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 text-[10.5px] font-extrabold text-white transition hover:bg-white/10">{text.services.all}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></a></div>
                        </div>
                    </div>
                </section>

                <section id="why-rcms" className="scroll-mt-28 bg-white py-10 dark:bg-[#07111f] sm:py-14">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="overflow-hidden rounded-3xl border border-[#d6e5f1] bg-white shadow-[0_28px_70px_-48px_rgba(7,39,88,.7)] dark:border-slate-700 dark:bg-slate-900/75 lg:grid lg:grid-cols-[.88fr_1.12fr]">
                            <div className="relative min-h-[420px] overflow-hidden bg-[#dcebf6] lg:min-h-[650px]">
                                <img src="/images/rcms-patient-guidance-v1.png" alt={isRtl ? 'أخصائية أشعة تشرح خطوات الفحص لمريضة داخل مركز تصوير حديث' : 'Radiology technologist guiding a patient in a modern imaging center'} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[center_58%]" />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#041a3c]/90 via-transparent to-white/5" />
                                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                                    <div className="max-w-md rounded-2xl border border-white/20 bg-[#062451]/75 p-4 shadow-xl backdrop-blur-md sm:p-5">
                                        <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[.13em] text-sky-200"><HeartPulse className="h-4 w-4" />{text.why.visualLabel}</span>
                                        <p className="mt-2 text-sm font-bold leading-6 text-white">{text.why.visualCopy}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 sm:p-7 lg:p-10">
                                <p className="reference-eyebrow">{text.why.eyebrow}</p>
                                <h2 className="reference-title mt-1 max-w-2xl">{text.why.title}</h2>
                                <p className="reference-copy max-w-2xl">{text.why.desc}</p>

                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    {text.why.items.map(({ icon: Icon, title, desc }, index) => (
                                        <article key={title} className="group relative overflow-hidden rounded-2xl border border-[#dfeaf3] bg-[#f8fbfe] p-4 transition hover:-translate-y-0.5 hover:border-[#aacbe8] hover:bg-white hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                                            <span className="absolute end-3 top-2 text-3xl font-black text-[#dfeefa] dark:text-slate-700" aria-hidden="true">0{index + 1}</span>
                                            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ff] text-[#075cb7] transition group-hover:bg-[#082761] group-hover:text-white dark:bg-blue-500/10 dark:text-sky-300"><Icon className="h-5 w-5" /></span>
                                            <h3 className="relative mt-3 text-xs font-black text-[#0b2245] dark:text-white">{title}</h3>
                                            <p className="relative mt-1.5 text-[10px] leading-5 text-slate-600 dark:text-slate-300">{desc}</p>
                                        </article>
                                    ))}
                                </div>

                                <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-[#dbe8f2] bg-[#082761] text-white shadow-lg dark:border-slate-700">
                                    {text.why.stats.map((stat, index) => <div key={stat.label} className={`px-2 py-4 text-center sm:px-4 ${index ? 'border-s border-white/15' : ''}`}><strong className="block text-base font-black text-white sm:text-lg">{stat.value}</strong><span className="mt-1 block text-[8px] font-semibold leading-3 text-blue-100 sm:text-[9px]">{stat.label}</span></div>)}
                                </div>

                                <div className="mt-5 flex flex-col gap-2 min-[440px]:flex-row">
                                    <a href="#services" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#082761] px-4 text-[10.5px] font-extrabold text-white transition hover:bg-[#0c347b]">{text.why.servicesAction}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></a>
                                    <a href={`tel:${phone}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#afc8df] bg-white px-4 text-[10.5px] font-extrabold text-[#0b3b78] transition hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"><Phone className="h-4 w-4" />{text.why.callAction}</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-white pb-8 dark:bg-[#07111f] sm:pb-10">
                    <div id="patient-journey" className="mx-auto max-w-7xl scroll-mt-28 px-4 sm:px-6 lg:px-8">
                        <div className="rounded-2xl border border-[#dce9f5] bg-white px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/55 sm:px-6">
                            <div className="text-center"><p className="reference-eyebrow">{text.journey.eyebrow}</p><h2 className="reference-title">{text.journey.title}</h2></div>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {text.journey.steps.map(({ n, icon: Icon, title, desc }, index) => (
                                    <article key={n} className="reference-journey-step relative flex items-center gap-3 rounded-xl p-2">
                                        <span className={`reference-step-number is-${index + 1}`}>{n}</span>
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dbe7f3] bg-[#f7fbff] text-[#2976cc] dark:border-slate-700 dark:bg-slate-800"><Icon className="h-5 w-5" /></span>
                                        <span><strong className="block text-xs font-black text-[#0b2245] dark:text-white">{title}</strong><small className="mt-1 block text-[10.5px] leading-4 text-slate-600 dark:text-slate-300">{desc}</small></span>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="patient-guide" className="scroll-mt-28 border-y border-[#e2edf6] bg-[#f7fbff] py-8 dark:border-slate-800 dark:bg-[#091522] sm:py-10">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-3xl text-center">
                            <p className="reference-eyebrow">{text.guide.eyebrow}</p>
                            <h2 className="reference-title">{text.guide.title}</h2>
                            <p className="reference-copy">{text.guide.desc}</p>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                            {text.guide.cards.map(({ icon: Icon, label, items }) => (
                                <article key={label} className="reference-guide-card rounded-2xl border border-[#dce9f5] bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf5ff] text-[#075cb7] dark:bg-blue-500/10 dark:text-sky-300"><Icon className="h-5 w-5" /></span><h3 className="text-sm font-black text-[#0b2245] dark:text-white">{label}</h3></div>
                                    <ul className="mt-4 space-y-2.5">
                                        {items.map((item) => <li key={item} className="flex items-start gap-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2ca36d]" /><span>{item}</span></li>)}
                                    </ul>
                                </article>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div><strong className="block text-xs font-black text-[#59380b] dark:text-amber-100">{text.guide.safetyTitle}</strong><p className="mt-1 text-[10.5px] leading-5 text-amber-900/75 dark:text-amber-100/75">{text.guide.safetyCopy}</p></div></div>
                            <a href={`tel:${phone}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#082761] px-4 text-xs font-extrabold text-white transition hover:bg-[#0c347b]"><Phone className="h-4 w-4" /><span dir="ltr">{phone}</span></a>
                        </div>
                    </div>
                </section>

                <section className="bg-[#f8fbfe] py-8 dark:bg-[#091522] sm:py-10">
                    <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:px-8">
                        <section id="locations" className="scroll-mt-28 rounded-2xl border border-[#dce9f5] bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <p className="reference-eyebrow">{text.locations.eyebrow}</p><h2 className="reference-title max-w-xs">{text.locations.title}</h2><p className="reference-copy">{text.locations.desc}</p>
                            <div className="mt-4 space-y-3">
                                {branches.map((branch) => (
                                    <article key={branch.name} className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
                                        <span className="h-12 w-14 shrink-0 rounded-lg border border-slate-200 bg-cover bg-no-repeat shadow-sm dark:border-slate-700" style={{ backgroundImage: "url('/images/rcms-branch-strip-v1.png')", backgroundPosition: `${branch.position} center`, backgroundSize: '390px auto' }} />
                                        <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] font-black text-[#0b2245] dark:text-white">{branch.name}</strong><small className="mt-0.5 block text-[9.5px] leading-4 text-slate-600 dark:text-slate-300">{branch.address}<br /><a href={`tel:${branch.phone.replace(/\s/g, '')}`} dir="ltr" className="font-semibold text-[#075cb7] hover:underline dark:text-sky-300">{branch.phone}</a></small></span>
                                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-[#9cb6d5] px-2 py-1.5 text-[9px] font-extrabold text-[#0b3b78] hover:bg-blue-50 dark:text-sky-300">{text.locations.directions}</a>
                                    </article>
                                ))}
                            </div>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centerName)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-[10.5px] font-extrabold text-[#075cb7]">{text.locations.all}<ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" /></a>
                        </section>

                        <section id="book" className="relative scroll-mt-28 overflow-hidden rounded-2xl border border-[#dce9f5] bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
                            <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-[36%] lg:block" aria-hidden="true">
                                <img src="/images/rcms-booking-coordinator-v1.png" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-[77%_center] opacity-30 dark:opacity-15" />
                                <div className={`absolute inset-0 ${isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white via-white/65 to-transparent dark:from-slate-900 dark:via-slate-900/70`} />
                            </div>
                            <div className="relative max-w-3xl">
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div><p className="reference-eyebrow">{text.form.eyebrow}</p><h2 className="reference-title">{text.form.title}</h2><p className="reference-copy max-w-lg">{text.form.desc}</p></div>
                                    <a href={`tel:${phone}`} className="inline-flex shrink-0 items-center gap-2 text-[10.5px] font-extrabold text-[#075cb7]"><Phone className="h-4 w-4" />{text.form.call} <b dir="ltr">{phone}</b></a>
                                </div>
                                <AppointmentForm services={services} initialService={selectedService} onSubmit={continueBooking} text={text.form} showIntro={false} compact />
                                <p className="mt-3 flex items-center gap-2 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-[#075cb7]" />{isRtl ? 'تظل معلوماتك داخل نموذج الحجز ولا تُرسل قبل اختيار قناة الحجز.' : 'Your details stay in this form until you choose a booking channel.'}</p>
                            </div>
                        </section>
                    </div>
                </section>

                <section id="faq" className="scroll-mt-28 border-t border-[#dfebf5] bg-[#f4f8fc] py-10 dark:border-slate-800 dark:bg-[#091522] sm:py-14">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-3xl text-center">
                            <p className="reference-eyebrow">{text.faq.eyebrow}</p>
                            <h2 className="reference-title mt-1">{text.faq.title}</h2>
                            <p className="reference-copy mx-auto max-w-2xl">{text.faq.desc}</p>
                        </div>

                        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[.72fr_1.28fr]">
                            <aside className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#082761] via-[#0a326f] to-[#075b9f] p-6 text-white shadow-xl shadow-blue-950/10 lg:sticky lg:top-28 sm:p-7">
                                <div className="absolute -end-20 -top-24 h-64 w-64 rounded-full border-[42px] border-white/[.055]" aria-hidden="true" />
                                <div className="absolute -bottom-20 -start-16 h-52 w-52 rounded-full bg-sky-400/10 blur-2xl" aria-hidden="true" />
                                <div className="relative">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-sky-200"><ShieldCheck className="h-6 w-6" /></span>
                                    <h3 className="mt-5 text-xl font-black">{text.faq.supportTitle}</h3>
                                    <p className="mt-2 text-xs leading-6 text-blue-100">{text.faq.supportCopy}</p>
                                    <div className="mt-6 space-y-2.5 border-y border-white/10 py-5">
                                        <p className="flex items-center gap-3 text-[10.5px] font-bold text-blue-50"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />{isRtl ? 'إرشادات تحضير خاصة بكل فحص' : 'Examination-specific preparation guidance'}</p>
                                        <p className="flex items-center gap-3 text-[10.5px] font-bold text-blue-50"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />{isRtl ? 'مساعدة في المواعيد والوصول' : 'Appointment and location assistance'}</p>
                                        <p className="flex items-center gap-3 text-[10.5px] font-bold text-blue-50"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />{isRtl ? 'دعم الوصول إلى التقارير والنتائج' : 'Report and result-access support'}</p>
                                    </div>
                                    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                        <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[10.5px] font-extrabold text-[#082761] transition hover:bg-sky-50"><Phone className="h-4 w-4" />{text.faq.call}</a>
                                        <a href="#book" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 text-[10.5px] font-extrabold text-white transition hover:bg-white/10"><CalendarCheck className="h-4 w-4" />{text.faq.book}</a>
                                    </div>
                                    <p className="mt-4 text-center text-[9px] font-semibold text-blue-200"><span dir="ltr">{phone}</span> · {centerName}</p>
                                </div>
                            </aside>

                            <div className="space-y-3">
                                {text.faq.items.map((item, index) => {
                                    const expanded = openFaq === index;
                                    const number = String(index + 1).padStart(2, '0');
                                    return <article key={item.q} className={`overflow-hidden rounded-2xl border bg-white transition duration-200 dark:bg-slate-900/85 ${expanded ? 'border-[#8ab8e4] shadow-[0_16px_36px_-28px_rgba(8,39,97,.8)] dark:border-sky-600/60' : 'border-[#dce7f1] hover:border-[#b8d2e9] dark:border-slate-700'}`}>
                                        <h3><button id={`faq-question-${index}`} type="button" aria-expanded={expanded} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(expanded ? null : index)} className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start sm:gap-4 sm:px-5">
                                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black transition ${expanded ? 'bg-[#082761] text-white dark:bg-sky-500' : 'bg-[#edf5fc] text-[#287ed5] group-hover:bg-blue-100 dark:bg-slate-800 dark:text-sky-300'}`}>{number}</span>
                                            <span className="flex-1 text-[11.5px] font-black leading-5 text-[#0b2245] dark:text-white sm:text-xs">{item.q}</span>
                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${expanded ? 'rotate-180 border-[#082761] bg-[#082761] text-white dark:border-sky-500 dark:bg-sky-500' : 'border-[#cfddea] text-[#287ed5] group-hover:border-[#8ab8e4] dark:border-slate-600 dark:text-sky-300'}`}><ChevronDown className="h-4 w-4" /></span>
                                        </button></h3>
                                        {expanded && <div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} className="border-t border-[#e6eef5] bg-[#fbfdff] px-4 py-4 ps-16 dark:border-slate-700 dark:bg-slate-900 sm:px-5 sm:py-5 sm:ps-[5.25rem]"><p className="max-w-2xl text-[11px] leading-6 text-slate-600 dark:text-slate-300">{item.a}</p></div>}
                                    </article>;
                                })}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-2xl backdrop-blur-xl sm:hidden dark:border-white/10 dark:bg-slate-900/95">
                <button type="button" onClick={openBookingOptions} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#082761] px-3 text-xs font-extrabold text-white"><CalendarCheck className="h-4 w-4" />{text.hero.book}</button>
                <Link to="/patient/login" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#9cb6d5] bg-white px-3 text-xs font-extrabold text-[#0b2b5b] dark:bg-slate-800 dark:text-white"><FileText className="h-4 w-4" />{text.hero.results}</Link>
            </div>

            {reportOpen && caseLookup?.report && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#06152b]/85 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
                <article ref={reportDialogRef} role="dialog" aria-modal="true" aria-labelledby="public-report-title" dir="ltr" lang="en" className="public-report-print max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/20 bg-white text-left shadow-2xl dark:bg-slate-900">
                    <header className="public-report-header sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:px-7">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                                {center.logo_url ? <img src={center.logo_url} alt={`${centerName} logo`} className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#082761] text-[11px] font-black tracking-wide text-white">RCMS</span>}
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-[#0b2245] dark:text-white sm:text-base">{centerName}</p>
                                    {center.address && <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{center.address}</p>}
                                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] font-semibold text-slate-600 dark:text-slate-300">
                                        {center.phone && <span>Phone: <b dir="ltr">{center.phone}</b></span>}
                                        {center.email && <span>Email: {center.email}</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="public-report-actions flex shrink-0 items-center gap-2"><button type="button" onClick={() => window.print()} className="hidden min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[10px] font-extrabold text-[#0b3b78] hover:bg-slate-50 sm:inline-flex dark:border-slate-700 dark:text-sky-300 dark:hover:bg-slate-800"><Printer className="h-4 w-4" />Print report</button><button type="button" onClick={() => setReportOpen(false)} aria-label="Close report" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
                        </div>
                        <div className="mt-4 flex items-start gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><FileText className="h-5 w-5" /></span><div><p className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-700 dark:text-emerald-300">Report completed</p><h2 id="public-report-title" className="mt-1 text-lg font-black text-[#0b2245] dark:text-white sm:text-xl">Final diagnostic report</h2><p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{caseLookup.case?.examType} · {formatReportDate(caseLookup.report.finalizedAt)}</p></div></div>
                    </header>
                    <div className="px-5 py-5 sm:px-7 sm:py-7">
                        <div className="mb-5 grid gap-3 rounded-xl border border-[#dce9f5] bg-[#f7fbff] p-4 text-[10px] sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-800/60"><div><span className="block font-bold text-slate-500 dark:text-slate-400">Study date</span><strong className="mt-1 block text-[#0b2245] dark:text-white">{formatReportDate(caseLookup.case?.studyDate)}</strong></div><div><span className="block font-bold text-slate-500 dark:text-slate-400">Examination</span><strong className="mt-1 block text-[#0b2245] dark:text-white">{caseLookup.case?.examType}</strong></div><div><span className="block font-bold text-slate-500 dark:text-slate-400">Report status</span><strong className="mt-1 block text-emerald-700 dark:text-emerald-300">{caseLookup.report.status === 'Amended' ? 'Amended' : 'Report completed'}</strong></div></div>
                        <div className="space-y-5">
                            {(caseLookup.report.sections || []).map((section) => <section key={section.key} className="border-b border-slate-100 pb-5 last:border-0 dark:border-slate-800"><h3 className="text-xs font-black uppercase tracking-wider text-[#075cb7] dark:text-sky-300">{REPORT_SECTION_LABELS.en[section.key as keyof typeof REPORT_SECTION_LABELS.en] || section.label}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{section.content}</p></section>)}
                            {caseLookup.report.plainText && <section><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{caseLookup.report.plainText}</p></section>}
                            {!caseLookup.report.sections?.length && !caseLookup.report.plainText && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">The report is finalized, but no narrative content is available in this view.</p>}
                        </div>
                        {(caseLookup.report.signedBy || caseLookup.report.signerRole) && <footer className="mt-7 border-t border-slate-200 pt-5 text-right dark:border-slate-700"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Finalized by</p><strong className="mt-1 block text-sm text-[#0b2245] dark:text-white">{caseLookup.report.signedBy || 'Radiology team'}</strong>{caseLookup.report.signerRole && <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{caseLookup.report.signerRole}</span>}</footer>}
                        <footer className="public-report-center-footer mt-8 border-t border-slate-200 pt-4 text-center text-[9px] leading-4 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <strong className="block text-[#0b2245] dark:text-slate-200">{centerName}</strong>
                            <span>Confidential medical report</span>
                            {(center.address || center.phone || center.email) && <span className="mt-1 block">{[center.address, center.phone && `Phone: ${center.phone}`, center.email && `Email: ${center.email}`].filter(Boolean).join(' · ')}</span>}
                        </footer>
                    </div>
                </article>
            </div>}

            {bookingOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#06152b]/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingOpen(false); }}>
                <div ref={bookingDialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-dialog-title" className="prototype-booking-dialog relative w-full max-w-xl rounded-3xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-slate-900 sm:p-8">
                    <button type="button" onClick={() => setBookingOpen(false)} aria-label={text.menu.close} className="absolute end-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><X className="h-5 w-5" /></button>
                    <div className="pe-10"><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#075cb7] dark:bg-blue-500/10 dark:text-sky-300"><CalendarCheck className="h-6 w-6" /></span><h2 id="booking-dialog-title" className="mt-4 text-2xl font-black text-[#0b2245] dark:text-white">{isRtl ? 'اختر طريقة الحجز' : 'Choose how to book'}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{isRtl ? 'سيساعدك فريق الحجز في تأكيد الخدمة والموعد وأي تعليمات تحضير.' : 'Our scheduling team will help confirm the service, time, and any preparation instructions.'}</p></div>
                    {bookingDraft && <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] font-bold text-[#0b3b78] dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-sky-200"><span>{bookingDraft.name}</span><span aria-hidden="true">·</span><span>{bookingDraft.service}</span><span aria-hidden="true">·</span><time dateTime={bookingDraft.date}>{bookingDraft.date}</time></div>}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <a href={`tel:${phone}`} className="group rounded-2xl border border-[#cfe0f0] bg-[#f5faff] p-5 transition hover:-translate-y-0.5 hover:border-[#78a9db] dark:border-slate-700 dark:bg-slate-800"><Phone className="h-5 w-5 text-[#075cb7]" /><strong className="mt-3 block text-sm font-black text-[#0b2245] dark:text-white">{isRtl ? 'مريض جديد' : 'New patient'}</strong><small className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{isRtl ? 'اتصل بفريق الحجز' : 'Call the scheduling team'} · <b dir="ltr">{phone}</b></small></a>
                        <Link to="/patient/login" className="group rounded-2xl border border-[#cfe0f0] bg-[#f5faff] p-5 transition hover:-translate-y-0.5 hover:border-[#78a9db] dark:border-slate-700 dark:bg-slate-800"><LockKeyhole className="h-5 w-5 text-[#075cb7]" /><strong className="mt-3 block text-sm font-black text-[#0b2245] dark:text-white">{isRtl ? 'مريض مسجل' : 'Existing patient'}</strong><small className="mt-1 flex items-center gap-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{isRtl ? 'الدخول إلى بوابة المرضى' : 'Continue to the patient portal'}<ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" /></small></Link>
                    </div>
                    <p className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><Clock3 className="h-4 w-4 text-[#075cb7]" />{isRtl ? 'موعدك يُؤكد بعد التواصل مع فريق الحجز.' : 'Your appointment is confirmed after speaking with the scheduling team.'}</p>
                </div>
            </div>}

            <PortalFooter center={center} text={text} isRtl={isRtl} />
        </div>
    );
};

export default PortalLanding;
