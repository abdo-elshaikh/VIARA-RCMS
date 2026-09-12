import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGetInvoiceQuery, useGetCenterSettingsQuery } from '../../store/api';
import { Loader2, Building2, Printer, Settings2, Layout } from 'lucide-react';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import '../../styles/printDocuments.css';

const PrintInvoice = () => {
    const { id } = useParams();
    const { t, i18n } = useTranslation('common');
    const { data: invoice, isLoading: invLoading, isError: invError } = useGetInvoiceQuery(id);
    const { data: settings, isLoading: settingsLoading } = useGetCenterSettingsQuery();

    const [paperSize, setPaperSize] = useState('A4');
    const [orientation, setOrientation] = useState('portrait');
    const [showTaxId, setShowTaxId] = useState(true);
    const [showCenterInfo, setShowCenterInfo] = useState(true);
    const [showPatientMrn, setShowPatientMrn] = useState(true);
    const [invoiceDisplayNumber, setInvoiceDisplayNumber] = useState('');
    
    // Advanced print settings states
    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [headerLayout, setHeaderLayout] = useState('classic');
    const [showWatermark, setShowWatermark] = useState(true);
    const [invoiceTerms, setInvoiceTerms] = useState('');
    const [tableSpacing, setTableSpacing] = useState('normal'); // compact, normal, cozy

    const isArabic = i18n.language.startsWith('ar');

    useEffect(() => {
        if (settings) {
            const centerSettings = normalizeCenterSettings(settings);
            if (centerSettings.print_settings) {
                const ps = centerSettings.print_settings;
                if (ps.themeColor) setThemeColor(ps.themeColor);
                if (ps.fontFamily) setFontFamily(ps.fontFamily);
                if (ps.headerLayout) setHeaderLayout(ps.headerLayout);
                if (ps.showWatermark !== undefined) setShowWatermark(ps.showWatermark);
                if (ps.invoiceTerms) setInvoiceTerms(ps.invoiceTerms);
            }
        }
    }, [settings]);

    useEffect(() => {
        if (invoice?.invoice_number) setInvoiceDisplayNumber(invoice.invoice_number);
    }, [invoice?.invoice_number]);

    if (invLoading || settingsLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
    if (invError || !invoice) return <div className="p-8 text-center font-bold text-red-500">{t('errors.loadFailed', { defaultValue: 'Failed to load details' })}</div>;

    const centerSettings = normalizeCenterSettings(settings);
    const documentIdentity = resolveDocumentIdentity(centerSettings, invoice, { language: i18n.language, kind: 'invoice' });
    const centerName = documentIdentity.centerName;
    const branchName = documentIdentity.branchName;
    const logoUrl = documentIdentity.logoUrl;
    const contactPerson = centerSettings.contact_person;
    const otherDetails = centerSettings.other_details;
    const address = documentIdentity.address;
    const phone = documentIdentity.phone;
    const email = documentIdentity.email;
    const taxId = documentIdentity.taxNumber;

    const getPageDimensions = () => {
        if (paperSize === 'A4') return orientation === 'portrait' ? { width: '210mm', height: '297mm' } : { width: '297mm', height: '210mm' };
        if (paperSize === 'A5') return orientation === 'portrait' ? { width: '148mm', height: '210mm' } : { width: '210mm', height: '148mm' };
        if (paperSize === 'Letter') return orientation === 'portrait' ? { width: '8.5in', height: '11in' } : { width: '11in', height: '8.5in' };
        return { width: '210mm', height: '297mm' };
    };

    const fontStack = fontFamily === 'Outfit' ? "'Outfit', sans-serif" : fontFamily === 'Space Mono' ? "'Space Mono', monospace" : fontFamily === 'Arial' ? "'Arial', sans-serif" : "'Inter', sans-serif";
    const spacingClass = tableSpacing === 'compact' ? 'py-1.5 px-2 text-xs' : tableSpacing === 'cozy' ? 'py-4.5 px-3 text-base' : 'py-3 px-2 text-sm';

    const pageDimensions = getPageDimensions();
    const handlePrint = () => printWhenReady();

    return (
        <div className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'}>
            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800;900&display=swap');
                    @media print {
                        @page {
                            margin: 0.5in;
                            size: ${paperSize} ${orientation};
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            background-color: white !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .no-print {
                            display: none !important;
                        }
                        .invoice-container {
                            box-shadow: none !important;
                            margin: 0 !important;
                            width: 100% !important;
                            min-height: 0 !important;
                            max-width: none !important;
                            padding: 0 !important;
                        }
                    }
                `}
            </style>
            
            {/* Configuration Sidebar */}
            <aside className="print-controls no-print w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-4 sm:p-6 flex flex-col shrink-0 h-auto lg:h-screen lg:sticky top-0 overflow-y-auto z-10">
                <div className="flex items-center gap-3 mb-6 text-slate-800">
                    <Settings2 size={22} style={{ color: themeColor }} />
                    <h2 className="text-lg font-black tracking-tight">Print Customization</h2>
                </div>

                <div className="space-y-5 flex-1 text-slate-700">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Language</label>
                        <LanguageToggle variant="default" className="w-full justify-center" />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Paper Layout</label>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                            {['A4', 'A5', 'Letter'].map(size => (
                                <button
                                    key={size}
                                    onClick={() => setPaperSize(size)}
                                    className="py-1.5 rounded-lg text-xs font-bold border transition-all"
                                    style={{
                                        borderColor: paperSize === size ? themeColor : '#e2e8f0',
                                        backgroundColor: paperSize === size ? `${themeColor}12` : '#ffffff',
                                        color: paperSize === size ? themeColor : '#475569'
                                    }}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                onClick={() => setOrientation('portrait')}
                                className="py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5"
                                style={{
                                    borderColor: orientation === 'portrait' ? themeColor : '#e2e8f0',
                                    backgroundColor: orientation === 'portrait' ? `${themeColor}12` : '#ffffff',
                                    color: orientation === 'portrait' ? themeColor : '#475569'
                                }}
                            >
                                <Layout size={12} className="rotate-90" /> Portrait
                            </button>
                            <button
                                onClick={() => setOrientation('landscape')}
                                className="py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5"
                                style={{
                                    borderColor: orientation === 'landscape' ? themeColor : '#e2e8f0',
                                    backgroundColor: orientation === 'landscape' ? `${themeColor}12` : '#ffffff',
                                    color: orientation === 'landscape' ? themeColor : '#475569'
                                }}
                            >
                                <Layout size={12} /> Landscape
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Invoice Number</label>
                        <input
                            value={invoiceDisplayNumber}
                            onChange={e => setInvoiceDisplayNumber(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs font-bold"
                            placeholder="INV-000123"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Color Theme</label>
                        <select value={themeColor} onChange={e => setThemeColor(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="#087F5B">VIARA Emerald</option>
                            <option value="#327C92">Clinical Info</option>
                            <option value="#F4B942">Attention Amber</option>
                            <option value="#D95757">Critical Coral</option>
                            <option value="#172326">Clinical Charcoal</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Typography Font</label>
                        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="Inter">Inter (Sans-serif)</option>
                            <option value="Outfit">Outfit (Round modern)</option>
                            <option value="Space Mono">Space Mono (Sleek code)</option>
                            <option value="Arial">Arial (Standard)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Header Design</label>
                        <select value={headerLayout} onChange={e => setHeaderLayout(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="classic">Classic (Side-by-side)</option>
                            <option value="center">Centered Layout</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Table Density</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['compact', 'normal', 'cozy'].map(spacing => (
                                <button
                                    key={spacing}
                                    onClick={() => setTableSpacing(spacing)}
                                    className="py-1.5 rounded-lg text-xs font-bold border capitalize transition-all"
                                    style={{
                                        borderColor: tableSpacing === spacing ? themeColor : '#e2e8f0',
                                        backgroundColor: tableSpacing === spacing ? `${themeColor}12` : '#ffffff',
                                        color: tableSpacing === spacing ? themeColor : '#475569'
                                    }}
                                >
                                    {spacing}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Custom Notes / Terms</label>
                        <textarea
                            value={invoiceTerms}
                            onChange={e => setInvoiceTerms(e.target.value)}
                            placeholder="Write custom terms or payment details..."
                            className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-white min-h-16 resize-y font-mono"
                        />
                    </div>

                    <div className="space-y-2 border-t pt-3">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showCenterInfo} onChange={e => setShowCenterInfo(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" />
                            <span className="text-xs font-bold text-slate-600">Include Center Info Header</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showTaxId} onChange={e => setShowTaxId(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" />
                            <span className="text-xs font-bold text-slate-600">Display Tax ID</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showPatientMrn} onChange={e => setShowPatientMrn(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" />
                            <span className="text-xs font-bold text-slate-600">Display Patient MRN</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showWatermark} onChange={e => setShowWatermark(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" />
                            <span className="text-xs font-bold text-slate-600">Paid Seal / Watermark</span>
                        </label>
                    </div>
                </div>

                <div className="sticky bottom-0 mt-6 space-y-2 border-t border-slate-200 bg-white/95 pt-4 pb-1 backdrop-blur">
                    <button onClick={handlePrint} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-extrabold text-white shadow-sm transition-all" style={{ backgroundColor: themeColor }}>
                        <Printer size={16} /> Print Document
                    </button>
                    <button onClick={() => window.close()} className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs">
                        Close
                    </button>
                </div>
            </aside>

            {/* Print Preview Canvas */}
            <main className="print-preview-stage flex min-w-0 flex-1 overflow-auto p-4 lg:p-8 justify-center items-start">
                <div 
                    className="invoice-container print-document print-sheet relative bg-white p-4 shadow-lg font-sans text-slate-800 transition-all sm:p-6 lg:p-10 rounded-md border border-slate-200/50" 
                    style={{ 
                        width: pageDimensions.width,
                        minHeight: pageDimensions.height,
                        ...getSheetPreviewVariables(pageDimensions),
                        fontFamily: fontStack 
                    }}
                >
                    {/* Paid Watermark Stamp */}
                    {invoice.invoice_status === 'Paid' && showWatermark && (
                        <div 
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none opacity-[0.08] border-8 rounded-2xl p-6 text-7xl font-black uppercase tracking-widest text-center rotate-12 z-0"
                            style={{ borderColor: themeColor, color: themeColor }}
                        >
                            PAID / تم الدفع
                        </div>
                    )}

                    {/* Header */}
                    <div className={`print-keep-together flex flex-wrap gap-6 ${headerLayout === 'center' ? 'flex-col text-center items-center justify-center' : 'flex-col justify-between items-start sm:flex-row print:flex-row'} mb-8 border-b border-slate-200 pb-6 relative z-10 lg:mb-10`}>
                        <div className={`${headerLayout === 'center' ? 'flex flex-col items-center' : ''}`}>
                            {showCenterInfo && (
                                <div className={`flex ${headerLayout === 'center' ? 'flex-col text-center' : ''} items-center gap-3.5 mb-3`}>
                                    {logoUrl ? (
                                        <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />
                                    ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: themeColor }}>
                                            <Building2 size={24} />
                                        </div>
                                    )}
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-tight">{centerName}</h1>
                                        {branchName && <p className="text-xs font-black tracking-widest uppercase mt-0.5" style={{ color: themeColor }}>{branchName}</p>}
                                    </div>
                                </div>
                            )}
                            <div className="text-xs text-slate-400 space-y-0.5 mt-2 font-medium">
                                {showCenterInfo && (
                                    <>
                                        <p>{address}</p>
                                        <p>{t('fields.phone', { defaultValue: 'Phone' })}: {phone} · {t('fields.email', { defaultValue: 'Email' })}: {email}</p>
                                        {contactPerson && <p>Contact: {contactPerson}</p>}
                                        {otherDetails && <p className="text-[10px] italic">{otherDetails}</p>}
                                    </>
                                )}
                                {showTaxId && taxId && <p className="mt-1 font-bold text-slate-500">{t('fields.taxId', { defaultValue: 'Tax ID' })}: <span className="font-mono">{taxId}</span></p>}
                            </div>
                        </div>
                        <div className={`text-${headerLayout === 'center' ? 'center mt-6' : isArabic ? 'left' : 'right'}`}>
                            <h2 className="text-4.5xl font-black tracking-tighter text-slate-200 uppercase mb-1" style={{ color: `${themeColor}20` }}>{t('billing.invoice', { defaultValue: 'Invoice' })}</h2>
                            <div className={`flex items-center gap-2 mb-1 justify-${headerLayout === 'center' ? 'center' : isArabic ? 'start' : 'end'}`}>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('billing.invoiceNo', { defaultValue: 'No.' })}</span>
                                <span className="font-mono text-lg font-black text-slate-900 ltr-embed">{invoiceDisplayNumber || invoice.invoice_number}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-400">
                                {t('fields.date', { defaultValue: 'Date' })}: <span className="font-extrabold text-slate-700">{new Date(invoice.generated_at).toLocaleDateString(i18n.language)}</span>
                            </p>
                        </div>
                    </div>

                    {/* Patient Info */}
                    <div className="print-keep-together relative z-10 mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-8 print:grid-cols-2">
                        <div>
                            <h3 className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">{t('billing.billedTo', { defaultValue: 'Billed To' })}</h3>
                            <p className="text-[17px] font-extrabold text-slate-800 leading-tight mb-1">{invoice.patient_name || t('patient.walkIn', { defaultValue: 'Walk-in Patient' })}</p>
                            {showPatientMrn && <p className="text-xs font-semibold text-slate-500">MRN: <span className="font-extrabold text-slate-700">{invoice.mrn}</span></p>}
                        </div>
                        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{t('billing.paymentStatus', { defaultValue: 'Payment Status' })}</h3>
                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider
                                    ${invoice.invoice_status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 
                                      invoice.invoice_status === 'Partial' ? 'bg-amber-100 text-amber-800' : 
                                      invoice.invoice_status === 'Voided' ? 'bg-rose-100 text-rose-800' : 
                                      'bg-slate-200 text-slate-700'}`}>
                                    {t(`billing.status.${invoice.invoice_status}`, { defaultValue: invoice.invoice_status })}
                                </span>
                            </div>
                            {Number(invoice.balance_amount) > 0 && (
                                <div className="text-right">
                                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">{t('billing.amountDue', { defaultValue: 'Amount Due' })}</span>
                                    <span className="text-base font-extrabold text-rose-600 font-mono">{Number(invoice.balance_amount).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="print-table-region mb-8 relative z-10" tabIndex="0" role="region" aria-label={t('billing.invoiceItems', { defaultValue: 'Invoice line items' })}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b-2 text-slate-800" style={{ borderColor: themeColor }}>
                                    <th className="py-2 px-2 font-black uppercase tracking-wider text-xs text-start">{t('fields.description', { defaultValue: 'Description' })}</th>
                                    <th className="py-2 px-2 font-black uppercase tracking-wider text-xs text-end">{t('fields.unitPrice', { defaultValue: 'Unit Price' })}</th>
                                    <th className="py-2 px-2 font-black uppercase tracking-wider text-xs text-center">{t('fields.quantity', { defaultValue: 'Qty' })}</th>
                                    <th className="py-2 px-2 font-black uppercase tracking-wider text-xs text-end">{t('fields.total', { defaultValue: 'Total' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoice.items?.map((item) => (
                                    <tr key={item.item_id} className="hover:bg-slate-50/20">
                                        <td className={`${spacingClass} font-bold text-slate-800`}>{item.name}</td>
                                        <td className={`${spacingClass} text-end font-mono text-slate-500`}>{Number(item.price).toFixed(2)}</td>
                                        <td className={`${spacingClass} text-center font-mono text-slate-500`}>{item.quantity}</td>
                                        <td className={`${spacingClass} text-end font-mono font-black text-slate-800`}>{Number(item.total_amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                                {(!invoice.items || invoice.items.length === 0) && (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-slate-400 italic">{t('billing.noItems', { defaultValue: 'No line items' })}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals & Notes Section */}
                    <div className="print-keep-together relative z-10 flex flex-col justify-between items-start gap-6 border-t border-slate-100 pt-6 sm:flex-row print:flex-row">
                        {/* Custom Terms & Payment details */}
                        <div className="flex-1 max-w-sm text-xs text-slate-400">
                            {invoiceTerms && (
                                <>
                                    <h4 className="font-extrabold uppercase tracking-widest text-[9px] text-slate-400 mb-1">Notes & Terms</h4>
                                    <p className="whitespace-pre-wrap leading-relaxed font-medium bg-slate-50/30 p-2.5 rounded-lg border border-slate-100/50">{invoiceTerms}</p>
                                </>
                            )}
                        </div>

                        {/* Summary breakdown card */}
                        <div className="w-full bg-slate-50/30 border border-slate-200/50 rounded-xl p-3 space-y-2.5 sm:w-72 print:w-72">
                            <div className="flex justify-between text-xs font-semibold text-slate-500">
                                <span>{t('billing.subtotal', { defaultValue: 'Subtotal' })}</span>
                                <span className="font-mono ltr-embed">{Number(invoice.total_amount).toFixed(2)}</span>
                            </div>
                            {Number(invoice.discount_amount) > 0 && (
                                <div className="flex justify-between text-xs font-bold text-emerald-600">
                                    <span>{t('billing.discount', { defaultValue: 'Discount' })}</span>
                                    <span className="font-mono ltr-embed">-{Number(invoice.discount_amount).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm font-extrabold text-slate-800 border-t border-dashed pt-2">
                                <span>{t('fields.total', { defaultValue: 'Total' })}</span>
                                <span className="font-mono ltr-embed">{Number(invoice.total_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg p-1.5 px-2">
                                <span>{t('billing.amountPaid', { defaultValue: 'Amount Paid' })}</span>
                                <span className="font-mono ltr-embed">{Number(invoice.paid_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-100 pt-2">
                                <span>{t('billing.balanceDue', { defaultValue: 'Balance Due' })}</span>
                                <span className="font-mono ltr-embed">{Number(invoice.balance_amount).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-14 border-t border-slate-200 pt-6 text-center text-[10px] font-bold text-slate-400 tracking-wide uppercase">
                        <p>{t('billing.thankYou', { defaultValue: 'Thank you for choosing' })} {centerName}.</p>
                        <p className="mt-1 text-[9px] text-slate-400/80 font-semibold lowercase tracking-normal">{t('billing.questions', { defaultValue: 'For any questions regarding this invoice, please contact' })} {[email, phone].filter(Boolean).join(` ${t('common.or', { defaultValue: 'or' })} `)}.</p>
                        {documentIdentity.poweredBy && <p className="mt-2 text-[8px] font-semibold normal-case tracking-normal text-slate-300">{documentIdentity.poweredBy}</p>}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PrintInvoice;
