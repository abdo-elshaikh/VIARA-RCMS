import { useMemo, useState } from 'react';
import {
    Copy, Eye, EyeOff, FileText, Printer, ShieldCheck, X,
    Send, Mail, Phone, MessageSquare, Check, CheckCircle2, ChevronDown, ChevronUp, Share2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Modal } from './ui';
import { VIARA_BRAND } from '../config/brand';
import { useGetCenterSettingsQuery } from '../store/api';
import { normalizeCenterSettings } from '../utils/centerSettings';

const copyToClipboard = async (text, successMessage, errorMessage) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
    } catch {
        toast.error(errorMessage);
    }
};

const cleanPhoneNumber = (phone) => {
    if (!phone) return '';
    let p = String(phone).replace(/[\s()-]/g, '');
    if (/^01[0125]\d{8}$/.test(p)) {
        p = '20' + p.slice(1);
    } else if (p.startsWith('+')) {
        p = p.slice(1);
    }
    return p;
};

const buildPatientMessage = ({ centerName, subjectName, identifier, loginUrl, password, language }) => {
    const isAr = language === 'ar';
    if (isAr) {
        return `مرحباً ${subjectName || 'عزيزي المريض'}،
يسعدنا انضمامك إلى بوابة المرضى في ${centerName || 'المركز الطبي'}.

يمكنك الآن استعراض نتائج الفحوصات والتحاليل، تحميل التقارير الطبية، ومتابعة الفواتير عبر الرابط التالي:
🌐 رابط البوابة: ${loginUrl || window.location.origin}
📋 رقم الملف (MRN): ${identifier || '-'}
🔑 كلمة المرور المؤقتة: ${password || '-'}

⚠️ ملاحظة أمنية: يرجى تسجيل الدخول وتغيير كلمة المرور عند الاستخدام الأول للحفاظ على خصوصية ملفك الطبي.
نتمنى لك دوام الصحة والعافية! 🌸`;
    }

    return `Dear ${subjectName || 'Patient'},
Welcome to the Patient Portal at ${centerName || 'our Medical Center'}.

You can easily access your imaging studies, download official medical reports, and view statements using the link below:
🌐 Portal Link: ${loginUrl || window.location.origin}
📋 Medical Record No. (MRN): ${identifier || '-'}
🔑 Temporary Password: ${password || '-'}

⚠️ Security Notice: Please log in and change your temporary password upon first sign-in to protect your personal medical data.
Wishing you good health!`;
};

const CredentialHandoffDialog = ({ isOpen, onClose, credentials }) => {
    const { t, i18n } = useTranslation('admin');
    const [showPassword, setShowPassword] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [targetPhone, setTargetPhone] = useState(credentials?.phone || credentials?.subjectPhone || '');
    const [targetEmail, setTargetEmail] = useState(credentials?.email || credentials?.subjectEmail || '');

    const { data: rawCenterSettings } = useGetCenterSettingsQuery(undefined, { skip: !isOpen });
    const centerSettings = normalizeCenterSettings(rawCenterSettings || {});
    const centerName = [centerSettings.center_name, centerSettings.branch_name].filter(Boolean).join(' - ') || centerSettings.center_name;
    const logoUrl = centerSettings.logo_url;
    const centerInitials = String(centerSettings.center_name || VIARA_BRAND.name).trim().slice(0, 4).toUpperCase();
    const language = i18n.resolvedLanguage?.split('-')[0] || i18n.language?.split('-')[0] || 'en';
    const direction = language === 'ar' ? 'rtl' : 'ltr';

    // Keep inputs synced when credentials change
    useMemo(() => {
        if (credentials?.phone || credentials?.subjectPhone) {
            setTargetPhone(credentials.phone || credentials.subjectPhone || '');
        }
        if (credentials?.email || credentials?.subjectEmail) {
            setTargetEmail(credentials.email || credentials.subjectEmail || '');
        }
    }, [credentials]);

    const payload = useMemo(() => {
        if (!credentials) return '';
        return [
            `${t('credentialHandoff.fields.center')}: ${centerName}`,
            `${credentials.subjectLabel || t('credentialHandoff.fields.name')}: ${credentials.subjectName || '-'}`,
            credentials.identifierLabel && credentials.identifier ? `${credentials.identifierLabel}: ${credentials.identifier}` : null,
            credentials.email ? `${t('credentialHandoff.fields.email')}: ${credentials.email}` : null,
            `${t('credentialHandoff.fields.portal')}: ${credentials.portalLabel || t('credentialHandoff.portal')}`,
            `${t('credentialHandoff.fields.url')}: ${credentials.loginUrl || window.location.origin}`,
            `${t('credentialHandoff.fields.password')}: ${credentials.password || '-'}`,
        ].filter(Boolean).join('\n');
    }, [centerName, credentials, t]);

    const patientMessage = useMemo(() => {
        if (!credentials) return '';
        return buildPatientMessage({
            centerName,
            subjectName: credentials.subjectName,
            identifier: credentials.identifier,
            loginUrl: credentials.loginUrl,
            password: credentials.password,
            language
        });
    }, [centerName, credentials, language]);

    if (!credentials) return null;

    const close = () => {
        setShowPassword(false);
        onClose?.();
    };

    const handleSendWhatsApp = () => {
        const clean = cleanPhoneNumber(targetPhone);
        if (!clean) {
            toast.error(t('credentialHandoff.toasts.phoneRequired'));
            return;
        }
        const url = `https://wa.me/${clean}?text=${encodeURIComponent(patientMessage)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success(t('credentialHandoff.toasts.messageCopied'));
    };

    const handleSendSms = () => {
        const clean = cleanPhoneNumber(targetPhone);
        if (!clean) {
            toast.error(t('credentialHandoff.toasts.phoneRequired'));
            return;
        }
        window.open(`sms:${clean}?body=${encodeURIComponent(patientMessage)}`, '_self');
    };

    const handleSendEmail = () => {
        if (!targetEmail) {
            toast.error(t('credentialHandoff.toasts.emailRequired'));
            return;
        }
        const subject = (language === 'ar' ? 'بيانات دخول بوابة المرضى - ' : 'Patient Portal Access - ') + centerName;
        window.open(`mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(patientMessage)}`, '_self');
    };

    const handleCopyPatientMessage = () => {
        copyToClipboard(patientMessage, t('credentialHandoff.toasts.messageCopied'), t('credentialHandoff.toasts.copyFailed'));
    };

    const printCredentials = () => {
        const title = t('credentialHandoff.print.title', { portal: credentials.portalLabel || t('credentialHandoff.portal') });
        const win = window.open('', '_blank', 'width=720,height=780');
        if (!win) {
            toast.error(t('credentialHandoff.toasts.popupBlocked'));
            return;
        }
        win.document.write(`<!doctype html>
<html lang="${escapeHtml(language)}" dir="${direction}">
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #0f172a; }
    .sheet { border: 1px solid #cbd5e1; border-radius: 12px; padding: 28px; }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
    .logo { max-width: 64px; max-height: 44px; object-fit: contain; }
    .mark { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 10px; background: #087F5B; color: white; font-size: 11px; font-weight: 800; }
    .center { margin: 0; color: #0f172a; font-size: 16px; font-weight: 800; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 6px 0; color: #475569; }
    dl { margin-top: 24px; display: grid; gap: 14px; }
    dt { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }
    dd { margin: 4px 0 0; font-size: 18px; font-weight: 800; }
    .secret { font-family: Consolas, monospace; letter-spacing: .04em; }
    .note { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <section class="sheet">
    <div class="brand">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="">` : `<div class="mark">${escapeHtml(centerInitials)}</div>`}
      <p class="center">${escapeHtml(centerName)}</p>
    </div>
    <h1>${escapeHtml(title)}</h1>
     <p>${escapeHtml(t('credentialHandoff.print.generated', { center: centerName }))}</p>
     <dl>
       <div><dt>${escapeHtml(credentials.subjectLabel || t('credentialHandoff.fields.name'))}</dt><dd>${escapeHtml(credentials.subjectName || '-')}</dd></div>
       ${credentials.identifier ? `<div><dt>${escapeHtml(credentials.identifierLabel || t('credentialHandoff.fields.identifier'))}</dt><dd>${escapeHtml(credentials.identifier)}</dd></div>` : ''}
       ${credentials.email ? `<div><dt>${escapeHtml(t('credentialHandoff.fields.email'))}</dt><dd>${escapeHtml(credentials.email)}</dd></div>` : ''}
       <div><dt>${escapeHtml(t('credentialHandoff.fields.loginUrl'))}</dt><dd>${escapeHtml(credentials.loginUrl || window.location.origin)}</dd></div>
       <div><dt>${escapeHtml(t('credentialHandoff.fields.password'))}</dt><dd class="secret">${escapeHtml(credentials.password || '-')}</dd></div>
     </dl>
     <p class="note">${escapeHtml(t('credentialHandoff.print.securityNote'))}</p>
  </section>
</body>
</html>`);
        win.document.close();
        win.focus();
        win.print();
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title={credentials.title || t('credentialHandoff.title')} width="max-w-2xl">
            <div className="space-y-4">
                {/* 1. Security Alert Note */}
                <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3.5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                        <ShieldCheck className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} />
                        <div>
                            <p className="text-xs font-black">{t('credentialHandoff.security.title')}</p>
                            <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
                                {t('credentialHandoff.security.description')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 2. Credentials Details Card */}
                <dl className="grid gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60 p-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                        <CredentialRow label={credentials.subjectLabel || t('credentialHandoff.fields.name')} value={credentials.subjectName} />
                        {credentials.identifier ? <CredentialRow label={credentials.identifierLabel || t('credentialHandoff.fields.identifier')} value={credentials.identifier} mono /> : null}
                    </div>
                    {credentials.email ? <CredentialRow label={t('credentialHandoff.fields.email')} value={credentials.email} mono /> : null}
                    <CredentialRow label={t('credentialHandoff.fields.loginUrl')} value={credentials.loginUrl || window.location.origin} mono />
                    
                    {/* Password Row */}
                    <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{t('credentialHandoff.fields.password')}</dt>
                        <dd className="mt-1 flex items-center gap-2">
                            <code className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm font-black text-slate-950 dark:text-slate-100 shadow-2xs">
                                {showPassword ? credentials.password : '••••••••••••••••••••••••'}
                            </code>
                            <button
                                type="button"
                                onClick={() => setShowPassword(value => !value)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition hover:border-teal-400 hover:text-teal-600 shadow-2xs"
                                title={showPassword ? t('credentialHandoff.actions.hidePassword') : t('credentialHandoff.actions.showPassword')}
                                aria-label={showPassword ? t('credentialHandoff.actions.hidePassword') : t('credentialHandoff.actions.showPassword')}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => copyToClipboard(credentials.password, t('credentialHandoff.toasts.passwordCopied'), t('credentialHandoff.toasts.copyFailed'))}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition hover:border-teal-400 hover:text-teal-600 shadow-2xs"
                                title={t('credentialHandoff.actions.copyPassword')}
                                aria-label={t('credentialHandoff.actions.copyPassword')}
                            >
                                <Copy size={16} />
                            </button>
                        </dd>
                    </div>
                </dl>

                {/* 3. EXECUTIVE PATIENT DISPATCH BOARD (إرسال للمريض بأفضل طريقة) */}
                <div className="rounded-2xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 dark:border-emerald-800/80 dark:bg-gradient-to-br dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-4 shadow-xs">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-emerald-100 dark:border-emerald-950 pb-2.5">
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs">
                                <Send size={15} />
                            </span>
                            <div>
                                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                    {t('credentialHandoff.dispatch.title')}
                                </h4>
                                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                    {t('credentialHandoff.dispatch.subtitle')}
                                </p>
                            </div>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            واتساب · SMS · إيميل
                        </span>
                    </div>

                    {/* Contact Number & Email Bar */}
                    <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                                {t('credentialHandoff.dispatch.phoneLabel')}
                            </label>
                            <div className="relative">
                                <Phone size={14} className="absolute start-3 top-2.5 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={targetPhone}
                                    onChange={e => setTargetPhone(e.target.value)}
                                    placeholder="01xxxxxxxxx"
                                    className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ps-8 pe-3 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-hidden"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                                {t('credentialHandoff.dispatch.emailLabel')}
                            </label>
                            <div className="relative">
                                <Mail size={14} className="absolute start-3 top-2.5 text-slate-400 pointer-events-none" />
                                <input
                                    type="email"
                                    value={targetEmail}
                                    onChange={e => setTargetEmail(e.target.value)}
                                    placeholder="patient@example.com"
                                    className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ps-8 pe-3 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-hidden"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Instant Dispatch Action Buttons */}
                    <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {/* 1. WhatsApp Action */}
                        <button
                            type="button"
                            onClick={handleSendWhatsApp}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-xs hover:shadow transition active:scale-95 px-2.5"
                            title={t('credentialHandoff.dispatch.whatsappHint')}
                        >
                            <MessageSquare size={14} />
                            <span>{t('credentialHandoff.actions.sendViaWhatsapp')}</span>
                        </button>

                        {/* 2. SMS Action */}
                        <button
                            type="button"
                            onClick={handleSendSms}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black shadow-xs hover:shadow transition active:scale-95 px-2.5"
                            title={t('credentialHandoff.dispatch.smsHint')}
                        >
                            <Phone size={14} />
                            <span>{t('credentialHandoff.actions.sendViaSms')}</span>
                        </button>

                        {/* 3. Email Action */}
                        <button
                            type="button"
                            onClick={handleSendEmail}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-xs hover:shadow transition active:scale-95 px-2.5"
                            title={t('credentialHandoff.dispatch.emailHint')}
                        >
                            <Mail size={14} />
                            <span>{t('credentialHandoff.actions.sendViaEmail')}</span>
                        </button>

                        {/* 4. Copy Formatted Patient Message */}
                        <button
                            type="button"
                            onClick={handleCopyPatientMessage}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-black hover:bg-slate-50 dark:hover:bg-slate-750 shadow-2xs transition active:scale-95 px-2.5"
                            title={t('credentialHandoff.actions.copyPatientMessage')}
                        >
                            <Copy size={14} />
                            <span>{t('credentialHandoff.actions.copyPatientMessage')}</span>
                        </button>
                    </div>

                    {/* Collapsible Message Preview */}
                    <div className="mt-3 pt-2.5 border-t border-emerald-100/70 dark:border-emerald-950">
                        <button
                            type="button"
                            onClick={() => setShowPreview(prev => !prev)}
                            className="flex items-center justify-between w-full text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-emerald-600 transition"
                        >
                            <span className="flex items-center gap-1">
                                <Share2 size={12} className="text-emerald-600" />
                                <span>{t('credentialHandoff.dispatch.preview')}</span>
                            </span>
                            {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {showPreview && (
                            <div className="mt-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans shadow-inner">
                                {patientMessage}
                            </div>
                        )}
                    </div>
                </div>

                {/* 4. Dialog Bottom Actions */}
                <div className="grid gap-2 sm:grid-cols-3 pt-1">
                    <button
                        type="button"
                        onClick={() => copyToClipboard(payload, t('credentialHandoff.toasts.credentialsCopied'), t('credentialHandoff.toasts.copyFailed'))}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-xs font-black text-slate-700 dark:text-slate-200 transition hover:border-teal-400 hover:text-teal-600"
                    >
                        <Copy size={15} />
                        {t('credentialHandoff.actions.copyAll')}
                    </button>
                    <button
                        type="button"
                        onClick={printCredentials}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-xs font-black text-slate-700 dark:text-slate-200 transition hover:border-teal-400 hover:text-teal-600"
                    >
                        <Printer size={15} />
                        {t('credentialHandoff.actions.print')}
                    </button>
                    <button
                        type="button"
                        onClick={close}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 text-xs font-black hover:opacity-90 transition"
                    >
                        <X size={15} />
                        {t('credentialHandoff.actions.done')}
                    </button>
                </div>

                {/* Delivery Hint Footnote */}
                <div className="flex items-start gap-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 p-3 text-[11px] font-semibold leading-relaxed text-slate-600 dark:text-slate-400">
                    <FileText className="mt-0.5 shrink-0 text-slate-400" size={14} />
                    <p>{credentials.deliveryHint || t('credentialHandoff.deliveryHint')}</p>
                </div>
            </div>
        </Modal>
    );
};

const CredentialRow = ({ label, value, mono = false }) => (
    <div>
        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt>
        <dd className={`mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-100 ${mono ? 'font-mono' : ''}`}>{value || '-'}</dd>
    </div>
);

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default CredentialHandoffDialog;
