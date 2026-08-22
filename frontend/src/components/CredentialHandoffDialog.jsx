import { useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, FileText, Printer, ShieldCheck, X } from 'lucide-react';
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

const CredentialHandoffDialog = ({ isOpen, onClose, credentials }) => {
    const { t, i18n } = useTranslation('admin');
    const [showPassword, setShowPassword] = useState(false);
    const { data: rawCenterSettings } = useGetCenterSettingsQuery(undefined, { skip: !isOpen });
    const centerSettings = normalizeCenterSettings(rawCenterSettings || {});
    const centerName = [centerSettings.center_name, centerSettings.branch_name].filter(Boolean).join(' - ') || centerSettings.center_name;
    const logoUrl = centerSettings.logo_url;
    const centerInitials = String(centerSettings.center_name || VIARA_BRAND.name).trim().slice(0, 4).toUpperCase();
    const language = i18n.resolvedLanguage?.split('-')[0] || i18n.language?.split('-')[0] || 'en';
    const direction = language === 'ar' ? 'rtl' : 'ltr';
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

    if (!credentials) return null;

    const close = () => {
        setShowPassword(false);
        onClose?.();
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
        <Modal isOpen={isOpen} onClose={close} title={credentials.title || t('credentialHandoff.title')} size="default">
            <div className="space-y-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 shrink-0 text-amber-600" size={20} />
                        <div>
                            <p className="text-sm font-black">{t('credentialHandoff.security.title')}</p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                                {t('credentialHandoff.security.description')}
                            </p>
                        </div>
                    </div>
                </div>

                <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <CredentialRow label={credentials.subjectLabel || t('credentialHandoff.fields.name')} value={credentials.subjectName} />
                    {credentials.identifier ? <CredentialRow label={credentials.identifierLabel || t('credentialHandoff.fields.identifier')} value={credentials.identifier} mono /> : null}
                    {credentials.email ? <CredentialRow label={t('credentialHandoff.fields.email')} value={credentials.email} mono /> : null}
                    <CredentialRow label={t('credentialHandoff.fields.loginUrl')} value={credentials.loginUrl || window.location.origin} mono />
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{t('credentialHandoff.fields.password')}</dt>
                        <dd className="mt-1 flex items-center gap-2">
                            <code className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-black text-slate-950">
                                {showPassword ? credentials.password : '••••••••••••••••••••••••'}
                            </code>
                            <button
                                type="button"
                                onClick={() => setShowPassword(value => !value)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-700"
                                title={showPassword ? t('credentialHandoff.actions.hidePassword') : t('credentialHandoff.actions.showPassword')}
                                aria-label={showPassword ? t('credentialHandoff.actions.hidePassword') : t('credentialHandoff.actions.showPassword')}
                            >
                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => copyToClipboard(credentials.password, t('credentialHandoff.toasts.passwordCopied'), t('credentialHandoff.toasts.copyFailed'))}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-700"
                                title={t('credentialHandoff.actions.copyPassword')}
                                aria-label={t('credentialHandoff.actions.copyPassword')}
                            >
                                <Copy size={17} />
                            </button>
                        </dd>
                    </div>
                </dl>

                <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => copyToClipboard(payload, t('credentialHandoff.toasts.credentialsCopied'), t('credentialHandoff.toasts.copyFailed'))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white transition hover:bg-cyan-800">
                        <Copy size={16} />
                        {t('credentialHandoff.actions.copyAll')}
                    </button>
                    <button type="button" onClick={printCredentials} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700">
                        <Printer size={16} />
                        {t('credentialHandoff.actions.print')}
                    </button>
                    <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        <X size={16} />
                        {t('credentialHandoff.actions.done')}
                    </button>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-slate-100 p-4 text-xs font-semibold leading-5 text-slate-600">
                    <FileText className="mt-0.5 shrink-0 text-slate-400" size={16} />
                    <p>{credentials.deliveryHint || t('credentialHandoff.deliveryHint')}</p>
                </div>
            </div>
        </Modal>
    );
};

const CredentialRow = ({ label, value, mono = false }) => (
    <div>
        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt>
        <dd className={`mt-1 truncate text-sm font-black text-slate-950 ${mono ? 'font-mono' : ''}`}>{value || '-'}</dd>
    </div>
);

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default CredentialHandoffDialog;
