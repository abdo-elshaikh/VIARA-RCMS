import React, { useEffect, useState, useMemo, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSubmitSafetyResponseMutation } from '../../store/api';
import {
    AlertTriangle,
    CheckCircle2,
    ShieldAlert,
    ShieldCheck,
    X,
    Activity,
    Info,
    FileCheck2,
    Lock,
    Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import useFocusTrap from '../../hooks/useFocusTrap';

const SAFETY_QUESTION_METADATA = {
    contrast_allergy: {
        arTitle: 'حساسية اليود وصبغة التباين',
        arQuestion: 'هل يعاني المريض من حساسية معروفة تجاه مركبات اليود أو صبغات الأشعة؟',
        enQuestion: 'Iodine or contrast media allergy?',
        category: 'الحساسية · Allergy',
        icon: AlertTriangle,
        riskWhen: true,
        riskNote: 'حساسية الصبغة قد تؤدي لتفاعل تأقي حاد؛ يتطلب تحضيراً وقائياً أو استشارة الطبيب.'
    },
    egfr: {
        arTitle: 'معدل الترشيح الكبيبي الكلوي (eGFR)',
        arQuestion: 'القيمة المخبرية الحديثة لمعدل الترشيح الكبيبي الكلوي',
        enQuestion: 'Latest recorded eGFR (mL/min/1.73m²)',
        category: 'وظائف الكلى · Renal',
        unit: 'mL/min/1.73m²',
        icon: Activity,
        isNumeric: true,
        riskWhen: (val) => val && Number(val) < 30,
        riskNote: 'معدل eGFR أقل من 30 يشير لاعتلال كلوي حاد ويشكل خطورة عالية مع الصبغة الوريدية.'
    },
    pregnancy: {
        arTitle: 'فحص احتمالية الحمل',
        arQuestion: 'هل المريضة حامل أو يوجد احتمال لوجود حمل؟',
        enQuestion: 'Pregnant or possibly pregnant?',
        category: 'الحمل · Pregnancy',
        icon: ShieldAlert,
        riskWhen: true,
        riskNote: 'الأشعة قد تشكل خطورة إشعاعية على الجنين؛ تتطلب موافقة واستشارة أخصائي الأشعة.'
    },
    pacemaker: {
        arTitle: 'منظم ضربات القلب أو أجهزة مزروعة',
        arQuestion: 'هل يوجد جهاز تنظيم ضربات قلب أو أسلاك قلبية مزروعة؟',
        enQuestion: 'Any implanted cardiac pacemaker or ICD?',
        category: 'الزرعات · Implants',
        icon: ShieldAlert,
        riskWhen: true,
        riskNote: 'أجهزة تنظيم ضربات القلب غير المتوافقة مع الرنين تشكل خطراً حرجاً على الحياة.'
    },
    metal: {
        arTitle: 'غرسات أو شظايا معدنية',
        arQuestion: 'هل توجد غرسات معدنية أو مشابك تمدد أوعية أو شظايا بجسم المريض؟',
        enQuestion: 'Metallic implant, clip, or foreign body?',
        category: 'المعادن · Metal',
        icon: AlertTriangle,
        riskWhen: true,
        riskNote: 'المعادن المغناطيسية قد تتحرك أو تسخن بشدة داخل المجال المغناطيسي.'
    },
    claustrophobia: {
        arTitle: 'رهاب الأماكن المغلقة',
        arQuestion: 'هل يعاني المريض من رهاب شديد للأماكن المغلقة؟',
        enQuestion: 'Severe claustrophobia?',
        category: 'راحة المريض · Comfort',
        icon: Info,
        riskWhen: true,
        riskNote: 'قد يحتاج المريض لمرافقة أو فترات راحة أو تدخل تهدئة سريري.'
    }
};

const resolveQuestionMeta = (field = {}) => {
    const id = (field.id || '').toLowerCase();
    const q = (field.question || '').toLowerCase();

    if (id.includes('contrast') || q.includes('contrast') || q.includes('iodine') || q.includes('allergy')) {
        return SAFETY_QUESTION_METADATA.contrast_allergy;
    }
    if (id.includes('egfr') || q.includes('egfr') || q.includes('renal')) {
        return SAFETY_QUESTION_METADATA.egfr;
    }
    if (id.includes('pregnan') || q.includes('pregnan')) {
        return SAFETY_QUESTION_METADATA.pregnancy;
    }
    if (id.includes('pacemaker') || q.includes('pacemaker')) {
        return SAFETY_QUESTION_METADATA.pacemaker;
    }
    if (id.includes('metal') || q.includes('metal') || q.includes('foreign body')) {
        return SAFETY_QUESTION_METADATA.metal;
    }
    if (id.includes('claustro') || q.includes('claustro')) {
        return SAFETY_QUESTION_METADATA.claustrophobia;
    }
    return null;
};

const getTemplateDisplayName = (templateName = '', isArabic = false) => {
    if (!templateName) return isArabic ? 'بروتوكول السلامة السريرية' : 'Clinical Safety Protocol';
    if (templateName.includes('CT Contrast') || templateName.includes('eGFR')) {
        return isArabic
            ? 'فحص سلامة صبغة الأشعة المقطعية ووظائف الكلى (CT Contrast & eGFR)'
            : 'CT Contrast & eGFR Screening';
    }
    if (templateName.includes('MRI Safety')) {
        return isArabic
            ? 'قائمة التحقق من أمان الرنين المغناطيسي (MRI Safety Checklist)'
            : 'MRI Safety Checklist';
    }
    return templateName;
};

// Clean up question text to remove accidental RTL inverted punctuation
const cleanQuestionText = (text = '', isArabic = false) => {
    if (!text) return '';
    let cleaned = text.trim();
    if (cleaned.startsWith('?') || cleaned.startsWith('؟')) {
        cleaned = cleaned.slice(1).trim();
    }
    if (cleaned.endsWith('?') || cleaned.endsWith('؟')) {
        cleaned = cleaned.slice(0, -1).trim();
    }
    return isArabic ? `${cleaned}؟` : `${cleaned}?`;
};

const SafetyFormModal = ({ isOpen, onClose, examId, template, onComplete }) => {
    const { t, i18n } = useTranslation('common');
    const isRtl = Boolean(i18n?.language?.startsWith('ar'));
    const dialogRef = useRef(null);
    const titleId = useId();
    const [answers, setAnswers] = useState({});
    const [submitForm, { isLoading }] = useSubmitSafetyResponseMutation();

    useFocusTrap({
        containerRef: dialogRef,
        isActive: Boolean(isOpen && template),
        onEscape: onClose,
        lockScroll: true,
    });

    const schema = useMemo(() => template?.schema_json || [], [template]);

    useEffect(() => {
        if (isOpen) setAnswers({});
    }, [examId, isOpen, template?.template_id]);

    // Detect if any answer triggers a potential clinical risk/hold
    const hasDetectedRisk = useMemo(() => {
        return schema.some(field => {
            const val = answers[field.id];
            if (val === undefined || val === '') return false;
            const meta = resolveQuestionMeta(field);
            if (meta) {
                if (typeof meta.riskWhen === 'function') {
                    return meta.riskWhen(val);
                }
                return val === meta.riskWhen;
            }
            return val === true;
        });
    }, [schema, answers]);

    if (!isOpen || !template) return null;

    const handleChange = (id, value) => {
        setAnswers(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const result = await submitForm({
                examId,
                data: { templateId: template.template_id, answers }
            }).unwrap();

            if (result?.isOnHold || result?.contraindicationDetected) {
                toast(t('safety.protocolOnHold'), {
                    icon: '⏸️',
                });
                onClose();
                return;
            }

            toast.success(t('safety.protocolSaved'));
            await onComplete();
        } catch (error) {
            toast.error(error?.data?.error || t('safety.submitError'));
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-2xl transition-all dark:border-slate-800"
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                {/* Header Banner */}
                <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] bg-gradient-to-r from-amber-500/10 via-[var(--VIARA-surface)] to-teal-500/10 p-5 dark:border-slate-800">
                    <div className="flex items-center gap-3.5">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/20 text-amber-700 ring-2 ring-amber-500/30 dark:text-amber-300">
                            <ShieldAlert size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 id={titleId} className="text-base font-black text-[var(--VIARA-ink)]">
                                    {getTemplateDisplayName(template.name, isRtl)}
                                </h2>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800/90 dark:text-amber-300/80">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>{isRtl ? 'بروتوكول السلامة الإلزامي قبل بدء التصوير' : 'Required Safety Protocol Check'}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={isRtl ? 'إغلاق' : 'Close'}
                        className="rounded-xl p-2 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)]"
                        title={isRtl ? 'إغلاق' : 'Close'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
                    {/* Guidance Alert Banner */}
                    <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/60 p-3 text-xs leading-relaxed text-[var(--VIARA-muted)] flex items-start gap-2.5">
                        <Info size={16} className="mt-0.5 shrink-0 text-[var(--VIARA-accent)]" />
                        <div>
                            <span className="font-bold text-[var(--VIARA-ink)]">
                                {isRtl ? 'تعليمات التحقق السريري: ' : 'Clinical Verification Notice: '}
                            </span>
                            <span>
                                {isRtl
                                    ? 'يُرجى توثيق إجابات المريض بدقة. سيتم وضع الفحص قيد التعليق السريري تلقائياً في حال وجود أي مانع أو خطر.'
                                    : 'Carefully record patient safety responses. Any positive risk triggers an automatic clinical hold.'}
                            </span>
                        </div>
                    </div>

                    {/* Question Cards */}
                    <div className="max-h-[58vh] overflow-y-auto pe-1 ps-0.5 space-y-3.5">
                        {schema.map((field, index) => {
                            const meta = resolveQuestionMeta(field);
                            const isEgfr = (field.id || '').toLowerCase().includes('egfr');

                            return (
                                <div
                                    key={field.id}
                                    className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/40 p-4 transition-all hover:border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-muted)]/70 dark:border-slate-800"
                                >
                                    {/* Question Card Header */}
                                    <div className="mb-3 flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--VIARA-surface)] text-[11px] font-black text-[var(--VIARA-ink)] shadow-xs ring-1 ring-[var(--VIARA-line)]">
                                                {index + 1}
                                            </span>
                                            {meta?.category && (
                                                <span className="rounded-md bg-[var(--VIARA-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--VIARA-accent)]">
                                                    {meta.category}
                                                </span>
                                            )}
                                        </div>
                                        {field.required && (
                                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                                {isRtl ? '* إلزامي' : '* Required'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Question Title & Translation */}
                                    <div className="mb-3">
                                        <label
                                            htmlFor={field.id}
                                            className="block text-sm font-bold text-[var(--VIARA-ink)] leading-snug"
                                            dir={isRtl ? 'rtl' : 'ltr'}
                                        >
                                            {isRtl && meta?.arQuestion ? (
                                                meta.arQuestion
                                            ) : (
                                                cleanQuestionText(field.question, isRtl)
                                            )}
                                        </label>
                                        {isRtl && meta?.enQuestion && (
                                            <span className="mt-0.5 block font-mono text-[11px] font-medium text-[var(--VIARA-muted)]" dir="ltr">
                                                {meta.enQuestion}
                                            </span>
                                        )}
                                    </div>

                                    {/* Field Controls */}
                                    {field.type === 'boolean' ? (
                                        <div className="grid grid-cols-2 gap-3 pt-1">
                                            {/* Safe (No) Option */}
                                            <label
                                                htmlFor={`${field.id}-no`}
                                                className={`group relative flex cursor-pointer select-none items-center justify-between rounded-xl border p-3 transition-all ${
                                                    answers[field.id] === false
                                                        ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900 ring-2 ring-emerald-500/20 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-200'
                                                        : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-slate-300 hover:text-[var(--VIARA-ink)] dark:border-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors ${
                                                        answers[field.id] === false
                                                            ? 'bg-emerald-500 text-white'
                                                            : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] group-hover:bg-slate-200 dark:group-hover:bg-slate-800'
                                                    }`}>
                                                        <CheckCircle2 size={13} />
                                                    </span>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black">
                                                            {isRtl ? 'لا (سليم / آمن)' : 'No (Clear)'}
                                                        </span>
                                                        <span className="text-[10px] font-medium opacity-70">
                                                            {isRtl ? 'لا يوجد مانع' : 'No contraindication'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <input
                                                    id={`${field.id}-no`}
                                                    type="radio"
                                                    name={field.id}
                                                    value="false"
                                                    aria-label="No"
                                                    checked={answers[field.id] === false}
                                                    required={field.required && answers[field.id] === undefined}
                                                    onChange={() => handleChange(field.id, false)}
                                                    className="h-4 w-4 cursor-pointer text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span className="sr-only">No</span>
                                            </label>

                                            {/* Risk / Alert (Yes) Option */}
                                            <label
                                                htmlFor={`${field.id}-yes`}
                                                className={`group relative flex cursor-pointer select-none items-center justify-between rounded-xl border p-3 transition-all ${
                                                    answers[field.id] === true
                                                        ? 'border-amber-500 bg-amber-50/80 text-amber-900 ring-2 ring-amber-500/20 dark:bg-amber-950/40 dark:border-amber-600 dark:text-amber-200'
                                                        : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-slate-300 hover:text-[var(--VIARA-ink)] dark:border-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors ${
                                                        answers[field.id] === true
                                                            ? 'bg-amber-500 text-white'
                                                            : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] group-hover:bg-slate-200 dark:group-hover:bg-slate-800'
                                                    }`}>
                                                        <AlertTriangle size={13} />
                                                    </span>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black">
                                                            {isRtl ? 'نعم (يوجد تنبيه)' : 'Yes (Alert)'}
                                                        </span>
                                                        <span className="text-[10px] font-medium opacity-70">
                                                            {isRtl ? 'يوجد تاريخ / خطر' : 'Risk factor present'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <input
                                                    id={`${field.id}-yes`}
                                                    type="radio"
                                                    name={field.id}
                                                    value="true"
                                                    aria-label="Yes"
                                                    checked={answers[field.id] === true}
                                                    required={field.required && answers[field.id] === undefined}
                                                    onChange={() => handleChange(field.id, true)}
                                                    className="h-4 w-4 cursor-pointer text-amber-600 focus:ring-amber-500"
                                                />
                                                <span className="sr-only">Yes</span>
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <input
                                                    id={field.id}
                                                    type={field.type === 'number' ? 'number' : 'text'}
                                                    required={field.required}
                                                    value={answers[field.id] ?? ''}
                                                    onChange={(e) => handleChange(field.id, e.target.value)}
                                                    className="h-11 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3.5 pe-12 text-sm font-bold text-[var(--VIARA-ink)] outline-none transition placeholder:text-[var(--VIARA-muted)] focus:border-[var(--VIARA-accent)] focus:ring-2 focus:ring-[rgba(var(--VIARA-accent-rgb),.15)] dark:border-slate-800"
                                                    placeholder={meta?.unit ? (isRtl ? 'مثال: 75' : 'e.g. 75') : (isRtl ? 'أدخل القيمة...' : `Enter ${field.type === 'number' ? 'value' : 'text'}...`)}
                                                    dir="ltr"
                                                    step="any"
                                                />
                                                {meta?.unit && (
                                                    <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 font-mono text-[11px] font-bold text-[var(--VIARA-muted)]" dir="ltr">
                                                        {meta.unit}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Dynamic eGFR Status Feedback */}
                                            {isEgfr && answers[field.id] !== undefined && answers[field.id] !== '' && (
                                                <div className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition-all ${
                                                    Number(answers[field.id]) < 30
                                                        ? 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                                                        : Number(answers[field.id]) < 60
                                                            ? 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                                            : 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                }`}>
                                                    {Number(answers[field.id]) < 30 ? (
                                                        <>
                                                            <AlertTriangle size={15} className="shrink-0 text-rose-600" />
                                                            <span>{isRtl ? '⚠️ قصور كلوي حاد (< 30) — يشكل خطورة بالغة مع الصبغة ويتطلب استشارة أخصائي الأشعة.' : '⚠️ Severe renal impairment (< 30) — high risk with contrast.'}</span>
                                                        </>
                                                    ) : Number(answers[field.id]) < 60 ? (
                                                        <>
                                                            <Info size={15} className="shrink-0 text-amber-600" />
                                                            <span>{isRtl ? '⚡ قصور كلوي متوسط (30-59) — يُرجى التأكد من الترطيب الوريدي الكافي ومراجعة الطبيب.' : '⚡ Moderate impairment (30-59) — ensure hydration and review dose.'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                                                            <span>{isRtl ? '✅ معدل ترشيح طبيعي (≥ 60) — آمن سريرياً لحقن الصبغة.' : '✅ Normal renal function (≥ 60) — safe for contrast.'}</span>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Detected Risk Notice */}
                    {hasDetectedRisk && (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-start gap-2.5 animate-in fade-in">
                            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600 animate-pulse" />
                            <div>
                                <span className="font-bold">{isRtl ? 'تنبيه سريري هام: ' : 'Important Clinical Notice: '}</span>
                                <span>
                                    {isRtl
                                        ? 'تم رصد إجابة تشير إلى موانع أو محاذير سريرية. عند التأكيد، سيتم تعليق الفحص تلقائياً (On Hold) وإشعار أخصائي الأشعة للمراجعة والاعتماد.'
                                        : 'A safety flag or contraindication was selected. Confirming will place the exam on hold for radiologist review.'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Modal Footer Actions */}
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[var(--VIARA-line)] pt-4 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--VIARA-muted)]">
                            <Lock size={12} className="text-emerald-600" />
                            <span>{isRtl ? 'توثيق سريري وتوقيع إلكتروني مؤرّخ' : 'Clinically recorded & audited'}</span>
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="h-10 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-4 text-xs font-bold text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)] dark:border-slate-800"
                            >
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </button>

                            <button
                                type="submit"
                                disabled={isLoading}
                                aria-label="Sign & Authorize Exam"
                                title="Sign & Authorize Exam"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 px-5 text-xs font-black text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                <CheckCircle2 size={16} />
                                <span>
                                    {isRtl ? 'توقيع واعتماد الفحص السريري' : 'Sign & Authorize Exam'}
                                </span>
                                <span className="sr-only">Sign & Authorize Exam</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default SafetyFormModal;
