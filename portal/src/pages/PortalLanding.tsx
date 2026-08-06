import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight,
    ArrowUpRight,
    Bone,
    CalendarCheck,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    ExternalLink,
    FileText,
    Filter,
    HeartPulse,
    HelpCircle,
    LockKeyhole,
    Loader2,
    MapPin,
    MessageSquare,
    Phone,
    Pause,
    Play,
    Radio,
    ScanLine,
    Search,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    ThumbsUp,
    UserRound,
    Waves,
    X,
    Zap,
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
            modalities: ['MRI 3.0T', 'CT 128-Slice', 'Ultrasound', 'Digital X-Ray', 'PET-CT'],
        },
        lookup: {
            title: 'Already have a scan?', desc: 'Enter your medical record number or order number to check whether your latest report is ready.',
            placeholder: 'MRN or Order number', action: 'Check last case', checking: 'Checking status…',
            secure: 'Rate-limited status check. Sign in to view clinical results.',
            completed: 'Report completed', pending: 'Report in progress', estimated: 'Estimated completion', delayed: 'Taking longer than the usual estimate',
            viewReport: 'Sign in to view report', checkAnother: 'Check another MRN or Order number', notFound: 'No recent case was found for this MRN or order number.',
            lookupError: 'Case status is temporarily unavailable. Please try again or call the center.', studyDate: 'Study date', lastUpdated: 'Last updated',
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
            desc: 'Choose the most convenient RCMS diagnostic center for your visit.',
            directions: 'Get directions', selectBranch: 'Select for booking', selected: 'Selected branch',
            all: 'View all locations on Google Maps', hoursLabel: 'Working Hours', modalitiesLabel: 'Available modalities',
            searchPlaceholder: 'Filter branches by area or name…',
            regions: {
                all: 'All Cairo Hubs',
                east: 'East Cairo & Maadi',
                west: 'West Cairo & October',
            },
            noResults: 'No branches match your location search.',
            clearSearch: 'Clear search',
        },
        form: {
            eyebrow: 'Appointment request', title: 'Request your appointment',
            desc: 'Share your preferred visit details and our scheduling team will help complete your booking.',
            badge: 'Instant Concierge Scheduling',
            liveSummaryTitle: 'Selected Visit Details:',
            urgentHotline: 'Need urgent booking?',
            statusActive: 'Scheduling Coordinators Active',
            call: 'Need help? Call', aria: 'Appointment request form', name: 'Full name',
            namePlaceholder: 'Your full name', phone: 'Phone number', phonePlaceholder: '010 0000 0000',
            service: 'Service', date: 'Preferred date', branch: 'Preferred center', timeWindow: 'Preferred time',
            submit: 'Continue booking', submitting: 'Please wait…',
            errors: { name: 'Please enter your full name.', phone: 'Please enter a valid phone number.', date: 'Please select a date from today onward.' },
            conciergeTitle: 'Concierge Booking Guarantees',
            features: [
                { title: '15-Min Callback', desc: 'Fast scheduling confirmation by phone' },
                { title: 'Prep Instructions', desc: 'Clear fasting & preparation checklist sent instantly' },
                { title: 'Secure & Private', desc: 'Your medical data is protected & confidential' },
            ],
            timeWindows: [
                { id: 'morning', label: 'Morning (9 AM - 1 PM)' },
                { id: 'afternoon', label: 'Afternoon (1 PM - 5 PM)' },
                { id: 'evening', label: 'Evening (5 PM - 9 PM)' },
            ],
        },
        faq: {
            eyebrow: 'Frequently asked questions', title: 'Helpful information before your visit',
            desc: 'Clear answers about preparation, appointments, reports, and accessing your results.',
            supportTitle: 'Still need help?', supportCopy: 'Our patient support team can confirm preparation instructions and guide your next step.',
            call: 'Call patient support', book: 'Request an appointment',
            searchPlaceholder: 'Search FAQs by keyword (e.g., MRI, fasting, report, contrast)…',
            noResults: 'No matching questions found for your search term.',
            clearSearch: 'Clear search',
            categoryLabels: {
                all: 'All Questions',
                prep: 'Scan Preparation',
                results: 'Results & Reports',
                booking: 'Booking & Visit',
                safety: 'Safety & Contrast',
            },
            items: [
                { category: 'results', q: 'How do I access my report?', a: 'Use the medical record number check above to confirm whether your latest report is ready. Sign in to the patient portal to view the report, available images, and your broader record history.' },
                { category: 'prep', q: 'Do I need preparation before my scan?', a: 'Preparation depends on the examination. Our team provides the correct fasting, hydration, medication, or clothing instructions when your appointment is confirmed.' },
                { category: 'results', q: 'Can my doctor view my images?', a: 'Authorized referring doctors can securely access assigned studies and signed reports through the doctor portal.' },
                { category: 'results', q: 'How soon will I receive my results?', a: 'Most routine reports are available within 24 hours. Urgent studies follow the priority agreed with your referring doctor.' },
                { category: 'booking', q: 'Can someone accompany me?', a: 'A companion may usually attend the visit, subject to examination-area safety and privacy requirements. Ask the center when confirming your appointment.' },
                { category: 'booking', q: 'How do I change my appointment?', a: 'Call the scheduling team as early as possible. They can review the available times and any preparation instructions that may need to change.' },
                { category: 'safety', q: 'What should I do before a contrast examination?', a: 'Tell the team about previous contrast reactions, kidney conditions, pregnancy, and current medication. Follow only the preparation instructions confirmed for your examination.' },
                { category: 'prep', q: 'Can I bring previous scans and reports?', a: 'Yes. Relevant prior images and reports help the radiologist compare changes over time. Bring digital media or printed reports when they are available.' },
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
        hero: { eyebrow: 'تميز تشخيصي موثوق منذ عام ٢٠٠٥', book: 'احجز موعداً', results: 'عرض نتائجي', availability: 'مواعيد متاحة في نفس اليوم', hotline: 'اتصل بالخط الساخن', modalities: ['الرنين 3T', 'المقطعية 128', 'السونار', 'الأشعة الرقمية', 'PET-CT'] },
        lookup: {
            title: 'أجريت فحصاً بالفعل؟', desc: 'أدخل رقم الملف الطبي أو رقم الطلب للتحقق مما إذا كان أحدث تقرير جاهزاً.',
            placeholder: 'رقم الملف الطبي أو الطلب', action: 'تحقق من آخر فحص', checking: 'جارٍ التحقق…',
            secure: 'تحقق محدود المحاولات من الحالة. سجل الدخول لعرض النتائج الطبية.',
            completed: 'اكتمل التقرير', pending: 'التقرير قيد الإعداد', estimated: 'الموعد المتوقع للاكتمال', delayed: 'يستغرق وقتاً أطول من التقدير المعتاد',
            viewReport: 'سجل الدخول لعرض التقرير', checkAnother: 'التحقق من رقم آخر', notFound: 'لم يتم العثور على فحص حديث لرقم الملف الطبي أو الطلب هذا.',
            lookupError: 'حالة الفحص غير متاحة مؤقتاً. حاول مرة أخرى أو اتصل بالمركز.', studyDate: 'تاريخ الفحص', lastUpdated: 'آخر تحديث',
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
        locations: {
            eyebrow: 'الفروع', title: 'فروع متعددة بالقرب منك',
            desc: 'اختر فرع RCMS التشخيصي الأنسب لزيارتك.',
            directions: 'اتجاهات الفرع', selectBranch: 'اختر للحجز', selected: 'الفرع المختار',
            all: 'عرض كل الفروع على خرائط جوجل', hoursLabel: 'مواعيد العمل', modalitiesLabel: 'الأجهزة المتاحة',
            searchPlaceholder: 'ابحث عن الفرع بالاسم أو المنطقة…',
            regions: {
                all: 'جميع الفروع',
                east: 'شرق القاهرة والمعادي',
                west: 'غرب القاهرة وأكتوبر',
            },
            noResults: 'لا توجد فروع تطابق بحثك المكانى.',
            clearSearch: 'إلغاء التصفية',
        },
        form: {
            eyebrow: 'طلب موعد', title: 'اطلب موعدك الآن', desc: 'شارك تفاصيل الزيارة المفضلة وسيساعدك فريق الحجز في إكمال الحجز.',
            badge: 'حجز تشخيصي مباشر',
            liveSummaryTitle: 'تفاصيل الزيارة المحددة:',
            urgentHotline: 'بحاجة إلى حجز عاجل؟',
            statusActive: 'منسقو الحجز متاحون الآن',
            call: 'للمساعدة اتصل', aria: 'نموذج طلب موعد', name: 'الاسم بالكامل', namePlaceholder: 'الاسم بالكامل',
            phone: 'رقم الهاتف', phonePlaceholder: '010 0000 0000', service: 'الخدمة', date: 'التاريخ المفضل', branch: 'المركز المفضل', timeWindow: 'الوقت المفضل',
            submit: 'متابعة الحجز', submitting: 'يرجى الانتظار…',
            errors: { name: 'يرجى إدخال الاسم بالكامل.', phone: 'يرجى إدخال رقم هاتف صحيح.', date: 'يرجى اختيار تاريخ من اليوم فصاعداً.' },
            conciergeTitle: 'ضمانات الحجز المميز',
            features: [
                { title: 'تأكيد خلال ١٥ دقيقة', desc: 'اتصال الهاتفي لتأكيد الموعد المناسب' },
                { title: 'تعليمات التحضير', desc: 'قائمة الصيام والتحضير فور طلب الحجز' },
                { title: 'سرية وأمان', desc: 'حجز طبي محمي وآمن تماماً' },
            ],
            timeWindows: [
                { id: 'morning', label: 'صباحاً (٩ ص - ١ م)' },
                { id: 'afternoon', label: 'ظهراً (١ م - ٥ م)' },
                { id: 'evening', label: 'مساءً (٥ م - ٩ م)' },
            ],
        },
        faq: {
            eyebrow: 'الأسئلة الشائعة', title: 'معلومات مفيدة قبل زيارتك',
            desc: 'إجابات واضحة حول التحضير والمواعيد والتقارير والوصول إلى النتائج.',
            supportTitle: 'ما زلت بحاجة إلى مساعدة؟', supportCopy: 'يساعدك فريق دعم المرضى في تأكيد تعليمات التحضير وتحديد خطوتك التالية.',
            call: 'اتصل بدعم المرضى', book: 'اطلب موعداً',
            searchPlaceholder: 'ابحث في الأسئلة (مثال: صيام، رنين، تقرير، صبغة)…',
            noResults: 'لم يتم العثور على أسئلة تطابق بحثك.',
            clearSearch: 'إلغاء البحث',
            categoryLabels: {
                all: 'كل الأسئلة',
                prep: 'تحضير الفحص',
                results: 'النتائج والتقارير',
                booking: 'الحجز والزيارة',
                safety: 'الأمان والصبغة',
            },
            items: [
                { category: 'results', q: 'كيف أصل إلى التقرير؟', a: 'استخدم رقم الملف الطبي في أداة التحقق أعلاه لعرض أحدث تقرير مكتمل دون تسجيل الدخول. سجل الدخول إلى بوابة المريض لعرض الصور المتاحة وسجل الفحوصات الأوسع.' },
                { category: 'prep', q: 'هل يحتاج الفحص إلى تحضير؟', a: 'تختلف التحضيرات حسب نوع الفحص. يرسل فريقنا تعليمات الصيام أو شرب المياه أو الأدوية عند تأكيد الموعد.' },
                { category: 'results', q: 'هل يستطيع طبيبي عرض الصور؟', a: 'يمكن للطبيب المحول والمصرح له الوصول إلى الفحوصات والتقارير المعتمدة من خلال بوابة الأطباء.' },
                { category: 'results', q: 'متى أحصل على النتيجة؟', a: 'تتوفر معظم التقارير العادية خلال 24 ساعة، بينما تتبع الحالات العاجلة الأولوية المتفق عليها مع الطبيب.' },
                { category: 'booking', q: 'هل يمكن أن يرافقني شخص؟', a: 'يمكن عادةً حضور مرافق مع مراعاة متطلبات الأمان والخصوصية داخل منطقة الفحص. اسأل المركز عند تأكيد الموعد.' },
                { category: 'booking', q: 'كيف أغير موعدي؟', a: 'اتصل بفريق الحجز في أقرب وقت ممكن لمراجعة المواعيد المتاحة وأي تعليمات تحضير تحتاج إلى تعديل.' },
                { category: 'safety', q: 'ماذا أفعل قبل فحص يستخدم الصبغة؟', a: 'أخبر الفريق عن أي حساسية سابقة من الصبغة أو أمراض بالكلى أو حمل أو أدوية حالية، واتبع فقط تعليمات التحضير المؤكدة لفحصك.' },
                { category: 'prep', q: 'هل يمكنني إحضار الأشعات والتقارير السابقة؟', a: 'نعم. تساعد الصور والتقارير السابقة طبيب الأشعة على مقارنة التغيرات بمرور الوقت. أحضر الوسائط الرقمية أو التقارير المطبوعة عند توفرها.' },
            ],
        },
        footer: { desc: 'أشعة تشخيصية حديثة مع وصول رقمي آمن للمرضى والأطباء المحولين.', services: 'خدماتنا', rights: 'جميع الحقوق محفوظة.', secure: 'وصول آمن للبيانات الطبية' },
    },
};

const SERVICES = {
    en: [
        { icon: ScanLine, name: 'MRI 3.0T', note: 'High-field', category: 'Advanced imaging', desc: 'High-resolution, radiation-free imaging for detailed evaluation of soft tissue and anatomy.', scope: 'Brain · Spine · Joints · Abdomen', image: '/images/scans/mri_machine.png' },
        { icon: Radio, name: 'CT 128-Slice', note: 'Fast acquisition', category: 'Cross-sectional imaging', desc: 'Rapid multi-slice imaging with detailed reconstruction for routine and urgent assessment.', scope: 'Chest · Abdomen · Trauma · Angiography', image: '/images/scans/ct_machine.png' },
        { icon: Waves, name: 'Ultrasound & Doppler', note: 'Real-time', category: 'Radiation-free imaging', desc: 'Comfortable real-time imaging for organs, soft tissue, pregnancy, and blood flow.', scope: 'Abdomen · Pelvis · Vascular · Pregnancy', image: '/images/scans/ultrasound_machine.png' },
        { icon: HeartPulse, name: '3D Mammography', note: 'Tomosynthesis', category: "Women's imaging", desc: 'Detailed breast imaging for screening, diagnostic evaluation, and follow-up.', scope: 'Screening · Diagnostic · Follow-up', image: '/images/scans/mammography_machine.png' },
        { icon: Bone, name: 'Digital X-Ray', note: 'Low dose', category: 'General radiography', desc: 'Fast digital radiography with high-quality images and optimized radiation exposure.', scope: 'Chest · Bones · Joints · Spine', image: '/images/scans/xray_machine.png' },
        { icon: ScanLine, name: 'PET-CT', note: 'Hybrid imaging', category: 'Molecular imaging', desc: 'Combined metabolic and anatomical imaging to support diagnosis, staging, and follow-up.', scope: 'Oncology · Neurology · Cardiology', image: '/images/scans/petct_machine.png' },
        { icon: Bone, name: 'Bone Density (DEXA)', note: 'Quick scan', category: 'Bone health', desc: 'Low-dose measurement of bone mineral density to assess osteoporosis and fracture risk.', scope: 'Spine · Hip · Whole body', image: '/images/scans/dexa_machine.png' },
        { icon: Radio, name: 'Fluoroscopy & Contrast', note: 'Dynamic imaging', category: 'Special examinations', desc: 'Live X-ray guidance for functional and contrast-enhanced diagnostic studies.', scope: 'Gastrointestinal · Urinary · Swallowing', image: '/images/scans/fluoroscopy_machine.png' },
        { icon: Stethoscope, name: 'Image-Guided Procedures', note: 'Minimally invasive', category: 'Interventional support', desc: 'Imaging guidance for selected diagnostic and therapeutic procedures.', scope: 'Biopsy · Aspiration · Drainage', image: '/images/scans/interventional_machine.png' },
        { icon: Radio, name: 'Dental & Panoramic', note: 'Digital dental', category: 'Dental imaging', desc: 'Wide-view dental and jaw imaging to support orthodontic, surgical, and routine dental assessment.', scope: 'Teeth · Jaw · TMJ · Orthodontics', image: '/images/scans/dental_machine.png' },
    ],
    ar: [
        { icon: ScanLine, name: 'الرنين المغناطيسي 3 تسلا', note: 'مجال عالٍ', category: 'تصوير متقدم', desc: 'تصوير عالي الدقة دون إشعاع لتقييم الأنسجة الرخوة والتفاصيل التشريحية.', scope: 'المخ · العمود الفقري · المفاصل · البطن', image: '/images/scans/mri_machine.png' },
        { icon: Radio, name: 'المقطعية 128 شريحة', note: 'تصوير سريع', category: 'تصوير مقطعي', desc: 'تصوير سريع متعدد الشرائح مع إعادة بناء تفصيلية للفحوصات الروتينية والعاجلة.', scope: 'الصدر · البطن · الإصابات · الأوعية', image: '/images/scans/ct_machine.png' },
        { icon: Waves, name: 'السونار والدوبلر', note: 'تصوير لحظي', category: 'تصوير دون إشعاع', desc: 'تصوير لحظي ومريح للأعضاء والأنسجة والحمل وتدفق الدم.', scope: 'البطن · الحوض · الأوعية · الحمل', image: '/images/scans/ultrasound_machine.png' },
        { icon: HeartPulse, name: 'الماموجرام ثلاثي الأبعاد', note: 'توموسينثيسس', category: 'تصوير المرأة', desc: 'تصوير تفصيلي للثدي للفحص الدوري والتشخيص والمتابعة.', scope: 'الفحص الدوري · التشخيص · المتابعة', image: '/images/scans/mammography_machine.png' },
        { icon: Bone, name: 'الأشعة الرقمية', note: 'جرعة منخفضة', category: 'الأشعة العامة', desc: 'تصوير رقمي سريع وعالي الجودة مع تحسين جرعة الإشعاع.', scope: 'الصدر · العظام · المفاصل · العمود الفقري', image: '/images/scans/xray_machine.png' },
        { icon: ScanLine, name: 'PET-CT', note: 'تصوير هجين', category: 'التصوير الجزيئي', desc: 'دمج التصوير الأيضي والتشريحي لدعم التشخيص وتحديد المراحل والمتابعة.', scope: 'الأورام · الأعصاب · القلب', image: '/images/scans/petct_machine.png' },
        { icon: Bone, name: 'قياس كثافة العظام DEXA', note: 'فحص سريع', category: 'صحة العظام', desc: 'قياس منخفض الجرعة لكثافة المعادن بالعظام وتقييم هشاشة العظام وخطر الكسور.', scope: 'العمود الفقري · الفخذ · الجسم بالكامل', image: '/images/scans/dexa_machine.png' },
        { icon: Radio, name: 'الفلوروسكوبي وفحوصات الصبغة', note: 'تصوير ديناميكي', category: 'فحوصات خاصة', desc: 'أشعة حية لتوجيه الفحوصات الوظيفية والدراسات التشخيصية بالصبغة.', scope: 'الجهاز الهضمي · البولي · البلع', image: '/images/scans/fluoroscopy_machine.png' },
        { icon: Stethoscope, name: 'إجراءات موجهة بالصور', note: 'تدخل محدود', category: 'دعم تداخلي', desc: 'استخدام التصوير لتوجيه إجراءات تشخيصية وعلاجية مختارة.', scope: 'الخزعات · سحب العينات · التصريف', image: '/images/scans/interventional_machine.png' },
        { icon: Radio, name: 'أشعة الأسنان والبانوراما', note: 'أسنان رقمية', category: 'تصوير الأسنان', desc: 'تصوير واسع للأسنان والفكين لدعم التقويم والجراحة والتقييم الدوري للأسنان.', scope: 'الأسنان · الفك · مفصل الفك · التقويم', image: '/images/scans/dental_machine.png' },
    ],
};

const BRANCHES = {
    en: [
        {
            id: 'maadi',
            name: 'RCMS Maadi Center',
            tag: 'Flagship Diagnostic Center',
            address: '49 Street 199, Maadi, Cairo',
            phone: '02 2515 0200',
            hours: 'Sat – Thu: 8:00 AM – 10:00 PM | Fri: 10:00 AM – 6:00 PM',
            modalities: ['MRI 3.0T', 'CT 128', 'Ultrasound', '3D Mammo'],
            position: '8%',
        },
        {
            id: 'heliopolis',
            name: 'RCMS Heliopolis Center',
            tag: 'East Cairo Hub',
            address: '8 El Nozha St., Heliopolis, Cairo',
            phone: '02 2080 2444',
            hours: 'Sat – Thu: 8:00 AM – 10:00 PM | Fri: Emergency scans',
            modalities: ['MRI 3.0T', 'CT 128', 'Digital X-Ray', 'DEXA'],
            position: '38%',
        },
        {
            id: 'october',
            name: 'RCMS 6th of October',
            tag: 'West Cairo Hub',
            address: 'El Mehwar El Markazi, 6th of October',
            phone: '02 3838 6060',
            hours: 'Sat – Thu: 8:00 AM – 10:00 PM | Fri: 10:00 AM – 6:00 PM',
            modalities: ['CT 128-Slice', 'Ultrasound', 'PET-CT', 'X-Ray'],
            position: '70%',
        },
        {
            id: 'sheikh-zayed',
            name: 'RCMS Sheikh Zayed',
            tag: 'West Cairo Hub',
            address: 'Sheikh Zayed, Cairo',
            phone: '02 3838 6060',
            hours: 'Sat – Thu: 8:00 AM – 10:00 PM | Fri: 10:00 AM – 6:00 PM',
            modalities: ['CT 128-Slice', 'Ultrasound', 'PET-CT', 'X-Ray'],
            position: '70%',
        },
        {
            id: 'new-cairo',
            name: 'RCMS New Cairo',
            tag: 'New Cairo Hub',
            address: 'New Cairo, Cairo',
            phone: '02 3838 6060',
            hours: 'Sat – Thu: 8:00 AM – 10:00 PM | Fri: 10:00 AM – 6:00 PM',
            modalities: ['CT 128-Slice', 'Ultrasound', 'PET-CT', 'X-Ray'],
            position: '70%',
        }
    ],
    ar: [
        {
            id: 'maadi',
            name: 'مركز RCMS المعادي',
            tag: 'الفرع الرئيسي',
            address: '٤٩ شارع ١٩٩، المعادي، القاهرة',
            phone: '02 2515 0200',
            hours: 'السبت – الخميس: ٨ ص – ١٠ م | الجمعة: ١٠ ص – ٦ م',
            modalities: ['الرنين 3T', 'المقطعية 128', 'السونار', 'الماموجرام'],
            position: '8%',
        },
        {
            id: 'heliopolis',
            name: 'مركز RCMS مصر الجديدة',
            tag: 'مركز شرق القاهرة',
            address: '٨ شارع النزهة، مصر الجديدة، القاهرة',
            phone: '02 2080 2444',
            hours: 'السبت – الخميس: ٨ ص – ١٠ م | الجمعة: الطوارئ فقط',
            modalities: ['الرنين 3T', 'المقطعية 128', 'الأشعة الرقمية', 'DEXA'],
            position: '38%',
        },
        {
            id: 'october',
            name: 'مركز RCMS السادس من أكتوبر',
            tag: 'مركز غرب القاهرة',
            address: 'المحور المركزي، السادس من أكتوبر',
            phone: '02 3838 6060',
            hours: 'السبت – الخميس: ٨ ص – ١٠ م | الجمعة: ١٠ ص – ٦ م',
            modalities: ['المقطعية 128', 'السونار', 'PET-CT', 'الأشعة الرقمية'],
            position: '70%',
        },
        {
            id: 'sheikh-zayed',
            name: 'مركز RCMS الشيخ زايد',
            tag: 'مركز غرب القاهرة',
            address: 'الشيخ زايد، القاهرة',
            phone: '02 3838 6060',
            hours: 'السبت – الخميس: ٨ ص – ١٠ م | الجمعة: ١٠ ص – ٦ م',
            modalities: ['المقطعية 128', 'السونار', 'PET-CT', 'الأشعة الرقمية'],
            position: '70%',
        },
        {
            id: 'new-cairo',
            name: 'مركز RCMS القاهرة الجديدة',
            tag: 'مركز القاهرة الجديدة',
            address: 'القاهرة الجديدة، القاهرة',
            phone: '02 3838 6060',
            hours: 'السبت – الخميس: ٨ ص – ١٠ م | الجمعة: ١٠ ص – ٦ م',
            modalities: ['المقطعية 128', 'السونار', 'PET-CT', 'الأشعة الرقمية'],
            position: '70%',
        }
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
}

const CASE_STATUS_LABELS = {
    en: { completed: 'Report completed', reporting: 'Report in progress', imaging: 'Imaging in progress', preparation: 'Preparing for imaging', arrived: 'Visit checked in', scheduled: 'Appointment scheduled' },
    ar: { completed: 'اكتمل التقرير', reporting: 'التقرير قيد الإعداد', imaging: 'الفحص جارٍ', preparation: 'جارٍ التحضير للفحص', arrived: 'تم تسجيل الوصول', scheduled: 'تم تحديد الموعد' },
};

const Reveal = ({
    children,
    className = '',
    delay = 0,
    as: Tag = 'div',
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
    as?: 'div' | 'span' | 'article' | 'li';
}) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;
        if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setVisible(true);
            return undefined;
        }
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
        }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return (
        <Tag
            ref={ref as never}
            className={`reveal-up ${visible ? 'is-visible' : ''} ${className}`}
            style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
        >
            {children}
        </Tag>
    );
};

const AnimatedStat = ({ value, className = '' }: { value: string; className?: string }) => {
    const ref = useRef<HTMLSpanElement | null>(null);
    const [display, setDisplay] = useState(value);
    const match = value.match(/\d+/);

    useEffect(() => {
        const node = ref.current;
        if (!node || !match) { setDisplay(value); return undefined; }
        if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setDisplay(value);
            return undefined;
        }
        const target = parseInt(match[0], 10);
        const prefix = value.slice(0, match.index);
        const suffix = value.slice((match.index || 0) + match[0].length);
        let frame: number;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            const duration = 900;
            const start = performance.now();
            const tick = (now: number) => {
                const progress = Math.min(1, (now - start) / duration);
                const eased = 1 - (1 - progress) ** 3;
                setDisplay(`${prefix}${Math.round(eased * target)}${suffix}`);
                if (progress < 1) frame = window.requestAnimationFrame(tick);
            };
            frame = window.requestAnimationFrame(tick);
        }, { threshold: 0.4 });
        observer.observe(node);
        return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
    }, [value]);

    return <span ref={ref} className={className}>{display}</span>;
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
    const [selectedService, setSelectedService] = useState(services[0]?.name || '');
    const [selectedBranch, setSelectedBranch] = useState(branches[0]?.name || '');
    const [selectedTimeWindow, setSelectedTimeWindow] = useState('morning');
    const [faqCategory, setFaqCategory] = useState('all');
    const [faqSearchQuery, setFaqSearchQuery] = useState('');
    const [branchSearchQuery, setBranchSearchQuery] = useState('');
    const [branchRegionFilter, setBranchRegionFilter] = useState('all');
    const [faqHelpful, setFaqHelpful] = useState<Record<number, boolean>>({});
    const [bookingDraft, setBookingDraft] = useState<AppointmentFields | null>(null);
    const [openFaq, setOpenFaq] = useState<number | null>(0);

    const filteredBranches = useMemo(() => {
        const query = branchSearchQuery.trim().toLowerCase();
        return branches.filter((branch) => {
            let matchesRegion = true;
            if (branchRegionFilter === 'east') {
                matchesRegion = ['maadi', 'heliopolis', 'new-cairo'].includes(branch.id) || Boolean(branch.tag?.toLowerCase().includes('east')) || Boolean(branch.tag?.includes('شرق')) || Boolean(branch.tag?.includes('المعادي'));
            } else if (branchRegionFilter === 'west') {
                matchesRegion = ['october', 'sheikh-zayed'].includes(branch.id) || Boolean(branch.tag?.toLowerCase().includes('west')) || Boolean(branch.tag?.includes('غرب'));
            }
            const matchesQuery =
                !query ||
                branch.name.toLowerCase().includes(query) ||
                branch.address.toLowerCase().includes(query) ||
                Boolean(branch.tag?.toLowerCase().includes(query));
            return matchesRegion && matchesQuery;
        });
    }, [branches, branchRegionFilter, branchSearchQuery]);

    useEffect(() => {
        if (branches.length && (!selectedBranch || !branches.some((b) => b.name === selectedBranch))) {
            setSelectedBranch(branches[0].name);
        }
    }, [branches, selectedBranch]);

    const filteredFaqs = useMemo(() => {
        const query = faqSearchQuery.trim().toLowerCase();
        return text.faq.items.filter((item) => {
            const matchesCategory = faqCategory === 'all' || item.category === faqCategory;
            const matchesQuery = !query || item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query);
            return matchesCategory && matchesQuery;
        });
    }, [text.faq.items, faqCategory, faqSearchQuery]);
    const [serviceSlide, setServiceSlide] = useState(0);
    const [servicesPaused, setServicesPaused] = useState(false);
    const [servicesInteracting, setServicesInteracting] = useState(false);
    const [servicesInView, setServicesInView] = useState(false);
    const [servicesPerView, setServicesPerView] = useState(1);
    const bookingDialogRef = useRef<HTMLDivElement | null>(null);
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

    const openResults = async (event: FormEvent) => {
        event.preventDefault();
        const mrn = medicalRecordNumber.trim();
        if (!mrn) return;
        try {
            await lookupCaseStatus({ mrn }).unwrap();
        } catch (_) {
            // The mutation state renders a privacy-safe, actionable error.
        }
    };

    const clearCaseLookup = () => {
        resetCaseLookup();
        setMedicalRecordNumber('');
        window.requestAnimationFrame(() => mrnInputRef.current?.focus());
    };

    const formatCaseDate = (value?: string | null) => {
        if (!value) return isRtl ? 'غير متاح' : 'Not available';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return isRtl ? 'غير متاح' : 'Not available';
        return new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };

    const localizedCaseStatus = (code?: string) => CASE_STATUS_LABELS[language][code as keyof typeof CASE_STATUS_LABELS.en]
        || (isRtl ? 'جارٍ تحديث الحالة' : 'Status updating');

    const selectService = (serviceName: string) => {
        setSelectedService(serviceName);
        setBookingDraft(null);
    };

    const handleSelectBranch = (branchName: string) => {
        setSelectedBranch(branchName);
        const bookElem = document.getElementById('book');
        if (bookElem) {
            bookElem.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const continueBooking = (values: AppointmentFields) => {
        const timeLabel = text.form.timeWindows?.find((t) => t.id === selectedTimeWindow)?.label || selectedTimeWindow;
        const branchContext = selectedBranch ? ` [${selectedBranch} - ${timeLabel}]` : '';
        setBookingDraft({
            ...values,
            service: `${values.service || selectedService}${branchContext}`,
        });
        setBookingOpen(true);
    };

    const openBookingOptions = () => {
        setBookingDraft(null);
        setBookingOpen(true);
    };

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="portal-theme portal-bilingual reference-portal min-h-screen overflow-x-clip bg-white text-[#0b2245] antialiased dark:bg-[#07111f] dark:text-white">
            <style>{`
                .reveal-up { opacity: 0; transform: translateY(22px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); will-change: opacity, transform; }
                .reveal-up.is-visible { opacity: 1; transform: translateY(0); }
                .tilt-card { transition: transform .35s cubic-bezier(.16,1,.3,1), box-shadow .35s ease, border-color .35s ease; }
                .tilt-card:hover { transform: translateY(-6px) scale(1.015); }
                .shine-sweep { position: relative; overflow: hidden; }
                .shine-sweep::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.55) 48%, transparent 66%); transform: translateX(-120%); pointer-events: none; }
                .shine-sweep:hover::after { animation: shineSweep 1.1s ease; }
                @keyframes shineSweep { to { transform: translateX(120%); } }
                .faq-answer-panel { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .38s cubic-bezier(.16,1,.3,1), opacity .3s ease; }
                .faq-answer-panel.is-open { grid-template-rows: 1fr; opacity: 1; }
                .faq-answer-inner { overflow: hidden; min-height: 0; }
                .modal-pop { animation: modalPop .32s cubic-bezier(.16,1,.3,1); }
                .modal-backdrop-in { animation: backdropIn .28s ease; }
                @keyframes modalPop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
                .stat-count-pulse { display: inline-block; }
                .mobile-dock-in { animation: dockIn .5s cubic-bezier(.16,1,.3,1) .15s both; }
                @keyframes dockIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
                .branch-row { transition: transform .3s ease, background-color .3s ease; }
                .branch-row:hover { transform: translateX(2px); }
                [dir='rtl'] .branch-row:hover { transform: translateX(-2px); }
                @media (prefers-reduced-motion: reduce) {
                    .reveal-up, .tilt-card, .shine-sweep::after, .faq-answer-panel, .modal-pop, .modal-backdrop-in, .mobile-dock-in, .branch-row { animation: none !important; transition: none !important; transform: none !important; opacity: 1 !important; }
                    .faq-answer-panel { grid-template-rows: 1fr !important; }
                }
            `}</style>
            <a href="#main-content" className="prototype-skip-link">{text.skip}</a>
            <PortalHeader navLinks={text.navLinks} center={center} text={text} isRtl={isRtl} onBook={openBookingOptions} />

            <main id="main-content" tabIndex={-1} className="pt-[97px]">
                <section aria-labelledby="portal-hero-title" className="reference-hero relative isolate overflow-hidden border-b border-[#dce9f5] bg-[#edf6ff] dark:border-slate-800 dark:bg-[#07111f]">
                    {/* Background image + overlays */}
                    <div className="absolute inset-0 -z-10" aria-hidden="true">
                        <img src="/images/rcms-radiology-hero-v2.png" alt="" decoding="async" className={`h-full w-full object-cover ${isRtl ? '-scale-x-100 object-[37%_center]' : 'object-[63%_center]'} dark:opacity-40`} />
                        <div className={`absolute inset-0 ${isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white via-white/90 to-white/10 dark:from-[#07111f] dark:via-[#07111f]/90 dark:to-transparent lg:via-white/74 lg:dark:via-[#07111f]/72`} />
                    </div>

                    {/* Animated floating particles */}
                    <div className="pointer-events-none absolute inset-0 -z-[5] overflow-hidden" aria-hidden="true">
                        <div className="hero-particle hero-particle-1 absolute h-2 w-2 rounded-full bg-[#075cb7]/20 dark:bg-sky-400/15" />
                        <div className="hero-particle hero-particle-2 absolute h-3 w-3 rounded-full bg-[#35a66f]/15 dark:bg-emerald-400/15" />
                        <div className="hero-particle hero-particle-3 absolute h-1.5 w-1.5 rounded-full bg-[#287ed5]/20 dark:bg-blue-300/15" />
                        <div className="hero-particle hero-particle-4 absolute h-2.5 w-2.5 rounded-full bg-[#9564eb]/12 dark:bg-violet-400/10" />
                        <div className="hero-particle hero-particle-5 absolute h-1.5 w-1.5 rounded-full bg-[#ee862f]/15 dark:bg-amber-400/12" />
                    </div>

                    <div className="mx-auto max-w-7xl px-4 pb-7 pt-9 sm:px-6 sm:pt-11 lg:px-8 lg:pb-5 lg:pt-7">
                        <div className="grid min-h-[340px] gap-8 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] lg:items-start">
                            <div className="reference-hero-copy max-w-[620px] space-y-4">
                                {/* Animated eyebrow badge */}
                                <div className="hero-anim hero-anim-1 inline-flex items-center gap-2 rounded-full border border-[#d8e7f4] bg-white/90 px-3.5 py-1.5 text-[11px] font-extrabold text-[#075cb7] shadow-sm backdrop-blur transition-colors dark:border-slate-700/80 dark:bg-slate-900/85 dark:text-sky-300">
                                    <ShieldCheck className="h-4 w-4 hero-icon-pulse text-[#075cb7] dark:text-sky-400" />
                                    <span>{text.hero.eyebrow}</span>
                                </div>

                                {/* Main headline with line-by-line stagger & language-specific font styling */}
                                <h1 id="portal-hero-title" className="text-[2.5rem] font-black leading-[1.08] tracking-[-.045em] text-[#071d43] sm:text-[3.25rem] lg:text-[2.65rem] xl:text-[3.35rem] dark:text-white">
                                    {isRtl ? (
                                        <div className="space-y-1 font-black leading-[1.24] text-[#071d43] dark:text-slate-50">
                                            <span className="hero-anim hero-anim-2 inline-block">تصوير تشخيصي <span className="hero-text-highlight font-black">عالي الدقة</span>.</span><br />
                                            <span className="hero-anim hero-anim-3 inline-block">تقارير <span className="hero-text-highlight font-black">بإشراف استشاريين</span>.</span><br />
                                            <span className="hero-anim hero-anim-4 inline-block">نتائجك <span className="hero-text-highlight font-black">في متناول يدك</span>.</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 font-black leading-[1.05] tracking-[-.045em]">
                                            <span className="hero-anim hero-anim-2 inline-block">Advanced <span className="hero-text-highlight">precision</span> imaging.</span><br />
                                            <span className="hero-anim hero-anim-3 inline-block">Consultant-led <span className="hero-text-highlight">diagnosis</span>.</span><br />
                                            <span className="hero-anim hero-anim-4 inline-block">Your results, <span className="hero-text-highlight">your way</span>.</span>
                                        </div>
                                    )}
                                </h1>

                                {/* Subtitle with enhanced legibility and contrast */}
                                <p className="hero-anim hero-anim-5 max-w-xl text-sm font-medium leading-6 text-[#334a67] sm:text-[15.5px] sm:leading-7 dark:text-slate-200">
                                    {isRtl ? (
                                        <>خدمات تصوير تشخيصي متخصصة في <bdi className="font-black text-[#071d43] dark:text-white">{centerName}</bdi>، مع إرشادات تحضير واضحة وتقارير يراجعها الأطباء ووصول آمن إلى نتائجك.</>
                                    ) : (
                                        <>Specialist diagnostic imaging at <bdi className="font-black text-[#071d43] dark:text-white">{centerName}</bdi>, with clear preparation guidance, consultant-led reporting, and secure access to your results.</>
                                    )}
                                </p>

                                {/* Modality pills with stagger */}
                                <ul className="reference-modality-pills hero-anim hero-anim-6 flex flex-wrap gap-1.5" aria-label={isRtl ? 'خدمات التصوير المتاحة' : 'Available imaging services'}>
                                    {text.hero.modalities.map((modality, i) => (
                                        <li key={modality} className="hero-pill-stagger" style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
                                            <ScanLine className="h-3 w-3" />{modality}
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA buttons */}
                                <div className="hero-anim hero-anim-7 flex flex-col gap-3 pt-1 sm:flex-row">
                                    <button type="button" onClick={openBookingOptions} className="hero-cta-primary group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#082761] px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-950/15 transition-all hover:-translate-y-0.5 hover:bg-[#0c347b] hover:shadow-xl hover:shadow-blue-950/20">
                                        <CalendarCheck className="h-4 w-4" />{text.hero.book}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                                    </button>
                                    <Link to="/patient/login" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#173c73] bg-white/80 px-5 text-xs font-extrabold text-[#0b2b5b] transition-all hover:-translate-y-0.5 hover:border-[#287ed5] hover:bg-white hover:shadow-md dark:bg-slate-900/70 dark:text-white">
                                        {text.hero.results}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                                    </Link>
                                </div>

                                {/* Trust signals */}
                                <div className="hero-anim hero-anim-8 flex flex-wrap items-center gap-x-7 gap-y-2 pt-2 text-[11px] font-semibold text-[#344b68] dark:text-slate-300">
                                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#35a66f] hero-icon-pulse" />{text.hero.availability}</span>
                                    <a href={`tel:${phone}`} className="flex items-center gap-2 transition-colors hover:text-[#075cb7]"><Phone className="h-4 w-4 text-[#082761] dark:text-sky-300" />{text.hero.hotline} <b dir="ltr">{phone}</b></a>
                                </div>
                            </div>

                            {/* Lookup card */}
                            <form onSubmit={openResults} className="reference-results-card hero-anim hero-anim-card self-end rounded-2xl border border-white/80 bg-white/95 p-5 shadow-[0_18px_55px_-24px_rgba(7,29,67,.5)] backdrop-blur lg:mb-5 lg:ms-auto lg:w-[330px] dark:border-white/10 dark:bg-slate-900/90">
                                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#075cb7] dark:bg-blue-500/10 dark:text-sky-300"><FileText className="h-4.5 w-4.5" /></span><div><h2 className="text-base font-black text-[#0b2245] dark:text-white">{text.lookup.title}</h2><p id="landing-mrn-help" className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{text.lookup.desc}</p></div></div>
                                <div className="mt-3" aria-live="polite">
                                    {!caseLookup && <>
                                        {caseLookupError && <p role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold leading-4 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{text.lookup.lookupError}</p>}
                                        <label className="sr-only" htmlFor="landing-mrn">{text.lookup.placeholder}</label>
                                        <input ref={mrnInputRef} id="landing-mrn" required aria-describedby="landing-mrn-help" value={medicalRecordNumber} onChange={(e) => { if (caseLookupError) resetCaseLookup(); setMedicalRecordNumber(e.target.value); }} autoComplete="username" className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-900 outline-none transition-all focus:border-[#075cb7] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder={text.lookup.placeholder} />
                                        <button type="submit" disabled={caseLookupLoading} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#082761] px-4 text-xs font-extrabold text-white transition-all hover:bg-[#0c347b] hover:shadow-md disabled:cursor-wait disabled:opacity-70">{caseLookupLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{text.lookup.checking}</> : <>{text.lookup.action}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></>}</button>
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
                                        {caseLookup.completed && <Link to="/patient/login" className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white transition hover:bg-emerald-700"><LockKeyhole className="h-4 w-4" />{text.lookup.viewReport}</Link>}
                                        <button type="button" onClick={clearCaseLookup} className="flex min-h-8 w-full items-center justify-center text-[9.5px] font-extrabold text-[#075cb7] hover:underline dark:text-sky-300">{text.lookup.checkAnother}</button>
                                    </div>}
                                </div>
                            </form>
                        </div>

                        {/* Task cards grid */}
                        <div className="relative z-10 grid gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4 mt-4 sm:mt-6">
                            {text.tasks.map(({ icon: Icon, title, desc, href, to, tone }, index) => {
                                const content = <><span className={`reference-task-icon is-${tone}`}><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-black text-[#0b2245] dark:text-white">{title}</strong><small className="mt-1 block text-[11px] leading-4 text-slate-600 dark:text-slate-300">{desc}</small></span><ArrowRight className="h-4 w-4 shrink-0 text-[#082761] transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1 dark:text-sky-300" /></>;
                                return (
                                    <Reveal key={title} delay={index * 90}>
                                        {to
                                            ? <Link to={to} className="reference-task-card tilt-card group">{content}</Link>
                                            : <a href={href} className="reference-task-card tilt-card group">{content}</a>}
                                    </Reveal>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section id="services" className="scroll-mt-28 border-y border-[#dfebf5] bg-gradient-to-b from-[#f6faff] via-white to-[#f8fbff] py-10 dark:border-slate-800 dark:from-[#091522] dark:via-[#07111f] dark:to-[#091522] sm:py-14">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
                            <Reveal className="max-w-3xl">
                                <p className="reference-eyebrow">{text.services.eyebrow}</p>
                                <h2 className="reference-title mt-1">{text.services.title}</h2>
                                <p className="reference-copy max-w-2xl">{text.services.desc}</p>
                            </Reveal>
                            <div className="grid gap-2 sm:grid-cols-3 lg:w-[31rem]">
                                {text.services.stats.map((stat, index) => <Reveal key={stat} delay={index * 100} className="flex min-h-14 items-center gap-2 rounded-xl border border-[#d9e7f3] bg-white px-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/75"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${index === 0 ? 'bg-blue-50 text-[#075cb7]' : index === 1 ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'} dark:bg-white/10`}><CheckCircle2 className="h-4 w-4" /></span><strong className="text-[9.5px] leading-4 text-[#0b2245] dark:text-white">{stat}</strong></Reveal>)}
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
                                        <article key={name} role="group" aria-roledescription="slide" aria-label={`${index + 1} / ${services.length}: ${name}`} className="group relative flex min-h-full w-[84%] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] border border-[#dce8f3] bg-white shadow-[0_8px_30px_-12px_rgba(8,39,97,.1)] transition-all duration-500 hover:-translate-y-2 hover:border-[#9fc4e8] hover:shadow-[0_24px_50px_-16px_rgba(8,39,97,.2)] sm:w-[calc((100%_-_0.75rem)/2)] lg:w-[calc((100%_-_2.25rem)/4)] dark:border-slate-700/60 dark:bg-slate-900/80">
                                            <div className="relative flex h-44 w-full items-center justify-center overflow-hidden border-b border-[#e4edf5]/60 bg-gradient-to-br from-[#f4f9ff] via-[#ffffff] to-[#eaf2f9] dark:border-slate-700/50 dark:from-[#0d1d30] dark:via-[#07111f] dark:to-[#091522]">
                                                {/* Abstract glowing background orbs */}
                                                <div className="absolute -start-10 -top-10 h-32 w-32 rounded-full bg-blue-400/20 blur-[32px] transition-transform duration-700 group-hover:scale-150 group-hover:bg-blue-400/30 dark:bg-sky-500/10 dark:group-hover:bg-sky-500/20" />
                                                <div className="absolute -bottom-10 -end-10 h-32 w-32 rounded-full bg-indigo-400/15 blur-[32px] transition-transform duration-700 group-hover:scale-150 group-hover:bg-indigo-400/25 dark:bg-indigo-500/10 dark:group-hover:bg-indigo-500/20" />

                                                {/* 3D Machine Image */}
                                                <img src={image} alt="" loading="lazy" decoding="async" className="relative h-full w-full object-contain p-4 drop-shadow-xl transition-all duration-700 group-hover:scale-[1.12] group-hover:drop-shadow-2xl" />

                                                {/* Floating Badges */}
                                                <div className="absolute inset-x-3 top-3 flex items-start justify-between">
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[#075cb7] shadow-sm backdrop-blur-md transition-transform duration-500 group-hover:rotate-12 dark:border-white/10 dark:bg-slate-900/60 dark:text-sky-300">
                                                        <Icon className="h-4.5 w-4.5" />
                                                    </span>
                                                    <span className="rounded-full border border-blue-100/80 bg-blue-50/80 px-2.5 py-1 text-[8.5px] font-black tracking-wide text-[#075cb7] shadow-sm backdrop-blur-md dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                                                        {note}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-1 flex-col p-5">
                                                <p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-400 dark:text-slate-500">
                                                    {category}
                                                </p>
                                                <h3 className="mt-1.5 text-[15px] font-black leading-snug text-[#0b2245] dark:text-white">
                                                    {name}
                                                </h3>
                                                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-[10px] leading-5 text-slate-600 dark:text-slate-300">
                                                    {desc}
                                                </p>

                                                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50/80 px-3 py-2.5 dark:bg-slate-800/50">
                                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2ca36d] dark:text-emerald-400" />
                                                    <span className="text-[9px] font-bold leading-relaxed text-slate-600 dark:text-slate-300">{scope}</span>
                                                </div>

                                                <div className="mt-auto pt-4">
                                                    <a href="#book" onClick={() => selectService(name)} className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-[#f0f6fc] px-4 text-[10.5px] font-black text-[#075cb7] transition-all duration-300 hover:bg-[#075cb7] hover:text-white hover:shadow-lg hover:shadow-blue-900/20 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-sky-600 dark:hover:text-white">
                                                        <span>{text.services.action}</span>
                                                        <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                                                    </a>
                                                </div>
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
                                <Reveal>
                                    <p className="reference-eyebrow">{text.why.eyebrow}</p>
                                    <h2 className="reference-title mt-1 max-w-2xl">{text.why.title}</h2>
                                    <p className="reference-copy max-w-2xl">{text.why.desc}</p>
                                </Reveal>

                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    {text.why.items.map(({ icon: Icon, title, desc }, index) => (
                                        <Reveal key={title} delay={index * 90} as="article" className="tilt-card group relative overflow-hidden rounded-2xl border border-[#dfeaf3] bg-[#f8fbfe] p-4 hover:border-[#aacbe8] hover:bg-white hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                                            <span className="absolute end-3 top-2 text-3xl font-black text-[#dfeefa] dark:text-slate-700" aria-hidden="true">0{index + 1}</span>
                                            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ff] text-[#075cb7] transition group-hover:bg-[#082761] group-hover:text-white dark:bg-blue-500/10 dark:text-sky-300"><Icon className="h-5 w-5" /></span>
                                            <h3 className="relative mt-3 text-xs font-black text-[#0b2245] dark:text-white">{title}</h3>
                                            <p className="relative mt-1.5 text-[10px] leading-5 text-slate-600 dark:text-slate-300">{desc}</p>
                                        </Reveal>
                                    ))}
                                </div>

                                <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-[#dbe8f2] bg-[#082761] text-white shadow-lg dark:border-slate-700">
                                    {text.why.stats.map((stat, index) => <div key={stat.label} className={`px-2 py-4 text-center transition hover:bg-white/5 sm:px-4 ${index ? 'border-s border-white/15' : ''}`}><strong className="block text-base font-black text-white sm:text-lg"><AnimatedStat value={stat.value} /></strong><span className="mt-1 block text-[8px] font-semibold leading-3 text-blue-100 sm:text-[9px]">{stat.label}</span></div>)}
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
                                    <Reveal key={n} delay={index * 110} as="article" className="reference-journey-step group relative flex items-center gap-3 rounded-xl p-2 transition hover:bg-[#f7fbff] dark:hover:bg-slate-800/60">
                                        <span className={`reference-step-number is-${index + 1}`}>{n}</span>
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dbe7f3] bg-[#f7fbff] text-[#2976cc] transition-transform duration-300 group-hover:scale-110 dark:border-slate-700 dark:bg-slate-800"><Icon className="h-5 w-5" /></span>
                                        <span><strong className="block text-xs font-black text-[#0b2245] dark:text-white">{title}</strong><small className="mt-1 block text-[10.5px] leading-4 text-slate-600 dark:text-slate-300">{desc}</small></span>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="patient-guide" className="scroll-mt-28 border-y border-[#e2edf6] bg-[#f7fbff] py-8 dark:border-slate-800 dark:bg-[#091522] sm:py-10">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <Reveal className="mx-auto max-w-3xl text-center">
                            <p className="reference-eyebrow">{text.guide.eyebrow}</p>
                            <h2 className="reference-title">{text.guide.title}</h2>
                            <p className="reference-copy">{text.guide.desc}</p>
                        </Reveal>
                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                            {text.guide.cards.map(({ icon: Icon, label, items }, index) => (
                                <Reveal key={label} delay={index * 110} as="article" className="reference-guide-card tilt-card rounded-2xl border border-[#dce9f5] bg-white p-5 shadow-sm hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70">
                                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf5ff] text-[#075cb7] dark:bg-blue-500/10 dark:text-sky-300"><Icon className="h-5 w-5" /></span><h3 className="text-sm font-black text-[#0b2245] dark:text-white">{label}</h3></div>
                                    <ul className="mt-4 space-y-2.5">
                                        {items.map((item) => <li key={item} className="flex items-start gap-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2ca36d]" /><span>{item}</span></li>)}
                                    </ul>
                                </Reveal>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div><strong className="block text-xs font-black text-[#59380b] dark:text-amber-100">{text.guide.safetyTitle}</strong><p className="mt-1 text-[10.5px] leading-5 text-amber-900/75 dark:text-amber-100/75">{text.guide.safetyCopy}</p></div></div>
                            <a href={`tel:${phone}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#082761] px-4 text-xs font-extrabold text-white transition hover:bg-[#0c347b]"><Phone className="h-4 w-4" /><span dir="ltr">{phone}</span></a>
                        </div>
                    </div>
                </section>

                <section className="bg-[#f8fbfe] py-8 dark:bg-[#091522] sm:py-10">
                    <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[.78fr_1.22fr] lg:px-8">
                        <section id="locations" className="scroll-mt-28 flex flex-col justify-between rounded-3xl border border-[#dce9f5] bg-gradient-to-b from-white via-[#f8fbfe] to-white p-5 shadow-lg dark:border-slate-800 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-900/90 sm:p-6">
                            <div>
                                <Reveal>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/90 px-3 py-1 text-[10px] font-black text-[#075cb7] shadow-sm backdrop-blur dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {text.locations.eyebrow}
                                        </span>
                                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                            {isRtl ? `🟢 ${branches.length} فروع تشخيصية مفتوحة` : `🟢 ${branches.length} Diagnostic Hubs Open`}
                                        </span>
                                    </div>
                                    <h2 className="reference-title max-w-xs mt-2 text-xl font-black text-[#0b2245] dark:text-white sm:text-2xl">{text.locations.title}</h2>
                                    <p className="reference-copy mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{text.locations.desc}</p>
                                </Reveal>

                                {/* Live Branch Search & Region Filter Bar */}
                                <div className="mt-4 space-y-2.5">
                                    <div className="relative">
                                        <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={branchSearchQuery}
                                            onChange={(e) => setBranchSearchQuery(e.target.value)}
                                            placeholder={text.locations.searchPlaceholder}
                                            className="min-h-9 w-full rounded-xl border border-slate-200 bg-white pe-8 ps-9 text-[11px] font-semibold text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#075cb7] focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-sky-500/20"
                                        />
                                        {branchSearchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setBranchSearchQuery('')}
                                                className="absolute end-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Region Filter Chips */}
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {Object.entries(text.locations.regions || {}).map(([regKey, regLabel]) => {
                                            const active = branchRegionFilter === regKey;
                                            return (
                                                <button
                                                    key={regKey}
                                                    type="button"
                                                    onClick={() => setBranchRegionFilter(regKey)}
                                                    className={`rounded-full px-3 py-1 text-[9.5px] font-extrabold transition-all ${active ? 'bg-[#082761] text-white shadow-sm dark:bg-sky-500' : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                                                >
                                                    {regLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Scrollable Container to prevent excessive vertical height */}
                                <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pe-1.5 custom-scrollbar">
                                    {filteredBranches.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900/50">
                                            <MapPin className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                                            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">{text.locations.noResults}</p>
                                            <button
                                                type="button"
                                                onClick={() => { setBranchRegionFilter('all'); setBranchSearchQuery(''); }}
                                                className="mt-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#075cb7] hover:underline dark:text-sky-300"
                                            >
                                                {text.locations.clearSearch}
                                            </button>
                                        </div>
                                    ) : (
                                        filteredBranches.map((branch) => {
                                            const isSelected = selectedBranch === branch.name;
                                            return (
                                                <article
                                                    key={branch.name}
                                                    className={`branch-row group relative overflow-hidden rounded-2xl border p-3.5 transition-all duration-300 ${isSelected ? 'border-[#075cb7] bg-[#f0f7ff] shadow-md ring-2 ring-[#075cb7]/20 dark:border-sky-500 dark:bg-slate-800/90 dark:ring-sky-500/20' : 'border-slate-200/80 bg-white hover:border-[#a3c9ed] hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/50 dark:hover:bg-slate-800'}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {/* Branch Strip Image Thumbnail with Hover Zoom */}
                                                        <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
                                                            <span
                                                                className="block h-full w-full bg-cover bg-no-repeat transition-transform duration-500 group-hover:scale-110"
                                                                style={{ backgroundImage: "url('/images/rcms-branch-strip-v1.png')", backgroundPosition: `${branch.position} center`, backgroundSize: '390px auto' }}
                                                            />
                                                            {isSelected && (
                                                                <span className="absolute end-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#082761] text-white shadow-sm dark:bg-sky-500">
                                                                    <Check className="h-2.5 w-2.5" />
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <strong className="truncate text-xs font-black text-[#0b2245] dark:text-white sm:text-sm">{branch.name}</strong>
                                                                {branch.tag && (
                                                                    <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100/90 px-2 py-0.5 text-[8.5px] font-black text-[#075cb7] dark:bg-sky-500/20 dark:text-sky-300">
                                                                        {branch.tag}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-4 font-semibold text-slate-600 dark:text-slate-300">
                                                                <MapPin className="h-3 w-3 shrink-0 text-[#075cb7] dark:text-sky-300" />
                                                                <span>{branch.address}</span>
                                                            </p>

                                                            <p className="mt-0.5 flex items-center gap-1.5 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
                                                                <Clock3 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                                <span>{branch.hours}</span>
                                                            </p>

                                                            {branch.modalities && branch.modalities.length > 0 && (
                                                                <div className="mt-2 flex flex-wrap gap-1">
                                                                    {branch.modalities.map((mod) => (
                                                                        <span
                                                                            key={mod}
                                                                            className="rounded-lg border border-blue-100 bg-blue-50/80 px-1.5 py-0.5 text-[8px] font-extrabold text-[#075cb7] dark:border-slate-700 dark:bg-slate-900/80 dark:text-sky-300"
                                                                        >
                                                                            {mod}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-700/70">
                                                        <a
                                                            href={`tel:${branch.phone.replace(/\s/g, '')}`}
                                                            dir="ltr"
                                                            className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#075cb7] transition hover:underline dark:text-sky-300"
                                                        >
                                                            <Phone className="h-3 w-3" />
                                                            {branch.phone}
                                                        </a>

                                                        <div className="flex items-center gap-1.5">
                                                            <a
                                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300/80 bg-white px-2 py-1 text-[9px] font-extrabold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-[#075cb7] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                                {text.locations.directions}
                                                            </a>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleSelectBranch(branch.name)}
                                                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[9px] font-black transition ${isSelected ? 'bg-[#082761] text-white shadow-sm dark:bg-sky-500' : 'bg-blue-50 text-[#075cb7] hover:bg-blue-100 dark:bg-slate-800 dark:text-sky-300'}`}
                                                            >
                                                                {isSelected ? <Check className="h-3 w-3" /> : <CalendarCheck className="h-3 w-3" />}
                                                                {isSelected ? text.locations.selected : text.locations.selectBranch}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centerName)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-xs font-black text-[#075cb7] transition hover:underline dark:text-sky-300"
                                >
                                    {text.locations.all}
                                    <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                                </a>
                            </div>
                        </section>

                        <section id="book" className="relative scroll-mt-28 overflow-hidden rounded-3xl border border-[#dce9f5] bg-gradient-to-br from-white via-[#f7fbff] to-[#edf5fd] p-6 shadow-xl dark:border-slate-800 dark:from-slate-900 dark:via-slate-900/95 dark:to-[#0b1728] sm:p-8">
                            {/* Rich Background Atmosphere & Radial Glow Effects */}
                            <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden" aria-hidden="true">
                                <div className="absolute -end-16 -top-16 h-72 w-72 rounded-full bg-[#075cb7]/10 blur-3xl dark:bg-sky-500/10" />
                                <div className="absolute -bottom-20 start-1/3 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10" />
                            </div>

                            {/* Coordinator Side Image Container with Floating Live Status Overlay */}
                            <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-[42%] overflow-hidden lg:block" aria-hidden="true">
                                <img
                                    src="/images/rcms-booking-coordinator-v1.png"
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className={`h-full w-full object-cover object-[77%_center] opacity-45 transition-all duration-700 dark:opacity-25 ${isRtl ? '-scale-x-100' : ''}`}
                                />
                                <div className={`absolute inset-0 ${isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white via-white/70 to-transparent dark:from-slate-900 dark:via-slate-900/80`} />

                                {/* Floating Live Coordinator Glass Badge */}
                                <div className="pointer-events-auto absolute bottom-8 end-8 max-w-[220px] rounded-2xl border border-white/40 bg-white/85 p-3.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-900/85">
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                        </span>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                            {text.form.statusActive || (isRtl ? 'منسقو الحجز متاحون' : 'Coordinators Active')}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-[10px] font-bold leading-4 text-slate-700 dark:text-slate-200">
                                        {isRtl ? 'مساعدة في اختيار الوقت المناسب وتحضير الفحص' : 'Personal assistance for timing and scan prep guidance'}
                                    </p>
                                </div>
                            </div>

                            <div className="relative z-10 max-w-3xl">
                                <Reveal className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/90 px-3 py-1 text-[10px] font-black text-[#075cb7] shadow-sm backdrop-blur dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                            <Sparkles className="h-3.5 w-3.5" />
                                            {text.form.badge}
                                        </span>
                                        <h2 className="reference-title mt-2 text-2xl font-black sm:text-3xl">{text.form.title}</h2>
                                        <p className="reference-copy max-w-lg mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">{text.form.desc}</p>
                                    </div>

                                    {/* Direct Phone Call Button */}
                                    <a
                                        href={`tel:${phone}`}
                                        className="group inline-flex shrink-0 items-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-black text-[#075cb7] shadow-sm transition hover:border-[#075cb7] hover:bg-blue-50 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-750"
                                    >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#075cb7] group-hover:bg-[#082761] group-hover:text-white dark:bg-slate-700 dark:text-sky-300">
                                            <Phone className="h-4 w-4" />
                                        </span>
                                        <div className="text-start">
                                            <span className="block text-[9px] font-bold text-slate-500 dark:text-slate-400">{text.form.urgentHotline}</span>
                                            <b dir="ltr" className="text-xs font-black text-[#0b2245] dark:text-white">{phone}</b>
                                        </div>
                                    </a>
                                </Reveal>

                                {/* Active Booking Selection Summary Bar */}
                                <div className="mb-5 rounded-2xl border border-blue-100 bg-white/90 p-3.5 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-800/80">
                                    <span className="block text-[9.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {text.form.liveSummaryTitle}
                                    </span>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-extrabold text-[#0b2245] dark:text-white">
                                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-[#075cb7] dark:bg-sky-500/20 dark:text-sky-300">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {selectedBranch}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
                                            <Clock3 className="h-3.5 w-3.5" />
                                            {text.form.timeWindows?.find((t) => t.id === selectedTimeWindow)?.label || selectedTimeWindow}
                                        </span>
                                        {selectedService && (
                                            <>
                                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2.5 py-1 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300">
                                                    <ScanLine className="h-3.5 w-3.5" />
                                                    {selectedService}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Branch Selection Pills */}
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {text.form.branch}
                                    </label>
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        {branches.map((b) => (
                                            <button
                                                key={b.name}
                                                type="button"
                                                onClick={() => setSelectedBranch(b.name)}
                                                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${selectedBranch === b.name ? 'border-[#075cb7] bg-[#082761] text-white shadow-md dark:border-sky-400 dark:bg-sky-600' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
                                            >
                                                <MapPin className="h-3.5 w-3.5" />
                                                {b.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preferred Time Window Selector */}
                                <div className="mb-5">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {text.form.timeWindow}
                                    </label>
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        {text.form.timeWindows?.map((tw) => (
                                            <button
                                                key={tw.id}
                                                type="button"
                                                onClick={() => setSelectedTimeWindow(tw.id)}
                                                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${selectedTimeWindow === tw.id ? 'border-emerald-600 bg-emerald-700 text-white shadow-md dark:bg-emerald-600' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
                                            >
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {tw.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <AppointmentForm services={services} initialService={selectedService} onSubmit={continueBooking} text={text.form} showIntro={false} compact />

                                {/* Concierge Features Bar */}
                                {text.form.features && (
                                    <div className="mt-6 grid gap-3.5 border-t border-slate-200/80 pt-5 sm:grid-cols-3 dark:border-slate-700/80">
                                        {text.form.features.map((feat, idx) => (
                                            <div key={feat.title} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-3 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800 dark:bg-slate-800/70">
                                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' : idx === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-400/20 dark:text-sky-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300'}`}>
                                                    {idx === 0 ? <Zap className="h-4 w-4" /> : idx === 1 ? <ClipboardCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                                </span>
                                                <div>
                                                    <strong className="block text-xs font-black text-[#0b2245] dark:text-white">{feat.title}</strong>
                                                    <small className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{feat.desc}</small>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </section>

                <section id="faq" className="scroll-mt-28 border-t border-[#dfebf5] bg-[#f4f8fc] py-10 dark:border-slate-800 dark:bg-[#091522] sm:py-14">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <Reveal className="mx-auto max-w-3xl text-center">
                            <p className="reference-eyebrow">{text.faq.eyebrow}</p>
                            <h2 className="reference-title mt-1">{text.faq.title}</h2>
                            <p className="reference-copy mx-auto max-w-2xl">{text.faq.desc}</p>
                        </Reveal>

                        {/* Search and Category Filter Bar */}
                        <div className="mx-auto mt-7 max-w-4xl space-y-4">
                            <div className="relative">
                                <Search className="absolute start-4 top-3.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={faqSearchQuery}
                                    onChange={(e) => setFaqSearchQuery(e.target.value)}
                                    placeholder={text.faq.searchPlaceholder}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pe-10 ps-11 text-xs font-semibold text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#075cb7] focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-500/20"
                                />
                                {faqSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setFaqSearchQuery('')}
                                        aria-label={text.faq.clearSearch}
                                        className="absolute end-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>

                            {/* Filter Category Pills */}
                            <div className="flex flex-wrap items-center justify-center gap-2" role="tablist">
                                {Object.entries(text.faq.categoryLabels || {}).map(([key, label]) => {
                                    const active = faqCategory === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            role="tab"
                                            aria-selected={active}
                                            onClick={() => setFaqCategory(key)}
                                            className={`rounded-full px-4 py-1.5 text-xs font-extrabold transition-all duration-200 ${active ? 'bg-[#082761] text-white shadow-md dark:bg-sky-500' : 'border border-slate-200/80 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[.72fr_1.28fr]">
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
                                {filteredFaqs.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
                                        <HelpCircle className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
                                        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">{text.faq.noResults}</p>
                                        <button
                                            type="button"
                                            onClick={() => { setFaqCategory('all'); setFaqSearchQuery(''); }}
                                            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#082761] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0c347b] dark:bg-sky-600"
                                        >
                                            {text.faq.clearSearch}
                                        </button>
                                    </div>
                                ) : (
                                    filteredFaqs.map((item, index) => {
                                        const expanded = openFaq === index;
                                        const number = String(index + 1).padStart(2, '0');
                                        const catLabel = text.faq.categoryLabels[item.category as keyof typeof text.faq.categoryLabels] || item.category;
                                        return (
                                            <Reveal key={item.q} delay={Math.min(index, 4) * 70} as="article" className={`overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow] duration-200 dark:bg-slate-900/85 ${expanded ? 'border-[#8ab8e4] shadow-[0_16px_36px_-28px_rgba(8,39,97,.8)] dark:border-sky-600/60' : 'border-[#dce7f1] hover:border-[#b8d2e9] dark:border-slate-700'}`}>
                                                <h3>
                                                    <button
                                                        id={`faq-question-${index}`}
                                                        type="button"
                                                        aria-expanded={expanded}
                                                        aria-controls={`faq-answer-${index}`}
                                                        onClick={() => setOpenFaq(expanded ? null : index)}
                                                        className="group flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-start sm:gap-4 sm:px-5"
                                                    >
                                                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black transition ${expanded ? 'bg-[#082761] text-white dark:bg-sky-500' : 'bg-[#edf5fc] text-[#287ed5] group-hover:bg-blue-100 dark:bg-slate-800 dark:text-sky-300'}`}>{number}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[8.5px] font-extrabold text-[#075cb7] dark:bg-slate-800 dark:text-sky-300">
                                                                    {catLabel}
                                                                </span>
                                                            </div>
                                                            <span className="mt-0.5 block text-[11.5px] font-black leading-5 text-[#0b2245] dark:text-white sm:text-xs">{item.q}</span>
                                                        </div>
                                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${expanded ? 'rotate-180 border-[#082761] bg-[#082761] text-white dark:border-sky-500 dark:bg-sky-500' : 'border-[#cfddea] text-[#287ed5] group-hover:border-[#8ab8e4] dark:border-slate-600 dark:text-sky-300'}`}><ChevronDown className="h-4 w-4" /></span>
                                                    </button>
                                                </h3>
                                                <div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} className={`faq-answer-panel ${expanded ? 'is-open' : ''}`}>
                                                    <div className={`faq-answer-inner bg-[#fbfdff] px-4 py-4 ps-16 dark:bg-slate-900 sm:px-5 sm:py-5 sm:ps-[5.25rem] ${expanded ? 'border-t border-[#e6eef5] dark:border-slate-700' : ''}`}>
                                                        <p className="max-w-2xl text-[11px] leading-6 text-slate-600 dark:text-slate-300">{item.a}</p>
                                                        <div className="mt-3 flex items-center gap-3 text-[9.5px] font-bold text-slate-500 dark:text-slate-400">
                                                            <button
                                                                type="button"
                                                                onClick={() => setFaqHelpful((prev) => ({ ...prev, [index]: !prev[index] }))}
                                                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${faqHelpful[index] ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                                                            >
                                                                <ThumbsUp className="h-3 w-3" />
                                                                {faqHelpful[index] ? (isRtl ? 'شكراً لتقييمك' : 'Helpful!') : (isRtl ? 'هل كان هذا مفيداً؟' : 'Was this helpful?')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Reveal>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <div className="mobile-dock-in fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-2xl backdrop-blur-xl sm:hidden dark:border-white/10 dark:bg-slate-900/95">
                <button type="button" onClick={openBookingOptions} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#082761] px-3 text-xs font-extrabold text-white"><CalendarCheck className="h-4 w-4" />{text.hero.book}</button>
                <Link to="/patient/login" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#9cb6d5] bg-white px-3 text-xs font-extrabold text-[#0b2b5b] dark:bg-slate-800 dark:text-white"><FileText className="h-4 w-4" />{text.hero.results}</Link>
            </div>

            {bookingOpen && <div className="modal-backdrop-in fixed inset-0 z-[80] flex items-center justify-center bg-[#06152b]/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingOpen(false); }}>
                <div ref={bookingDialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-dialog-title" className="prototype-booking-dialog modal-pop relative w-full max-w-xl rounded-3xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-slate-900 sm:p-8">
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
