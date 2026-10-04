import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGetInvoiceQuery, useGetVisitsStatementQuery, useGetCenterSettingsQuery } from '../../store/api';
import { Loader2 } from 'lucide-react';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { useTrialWatermark } from '../../hooks/useTrialWatermark';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import {
    PRINT_ACCENTS,
    PRINT_FONTS,
    getPageDimensions,
    buildPrintStyles,
    printCopy,
    printOptionLabels,
    resolvePageRule,
    getFontStack,
    formatMoney,
} from './printTheme';
import {
    PrintSidebar,
    PrintStage,
    PrintField,
    PrintSegmented,
    PrintSelectField,
    PrintTextInput,
    PrintTextArea,
    PrintToggle,
} from './PrintControls';
import {
    PrintDocument,
    DocIdentityHeader,
    DocSectionHead,
    DocMetaCell,
    DocPill,
    DocFooter,
} from './PrintDocument';
import '../../styles/printDocuments.css';

const INVOICE_EXTRA_COPY = {
    en: {
        invoiceNumber: 'Invoice number', header: 'Header layout',
        classic: 'Classic', centered: 'Centered', terms: 'Notes and terms',
        termsHint: 'Add payment details or notes', center: 'Show center details',
        tax: 'Show tax number', mrn: 'Show patient file number', watermark: 'Paid watermark',
        print: 'Print invoice', contact: 'Contact', paid: 'PAID',
        paymentsHistory: 'Show payment history',
        caseType: 'Case type',
        policyNo: 'Policy No.',
        cardNo: 'Card No.',
        insuranceCoverage: 'Insurance coverage',
        patientPayable: 'Patient payable',
        paymentHistory: 'Payment history',
        paymentDate: 'Date',
        paymentMethod: 'Method',
        paymentRef: 'Reference / Auth',
        paymentAmount: 'Amount',
        selfPay: 'Self-Pay / Direct',
        insuranceTag: 'Insurance / Corporate',
    },
    ar: {
        invoiceNumber: 'رقم الفاتورة', header: 'تخطيط الترويسة',
        classic: 'تقليدي', centered: 'في المنتصف', terms: 'ملاحظات وشروط',
        termsHint: 'أضف تفاصيل الدفع أو ملاحظات', center: 'إظهار بيانات المركز',
        tax: 'إظهار الرقم الضريبي', mrn: 'إظهار رقم ملف المريض', watermark: 'علامة مدفوع',
        print: 'طباعة الفاتورة', contact: 'للتواصل', paid: 'مدفوع',
        paymentsHistory: 'إظهار سجل الدفعات',
        caseType: 'نوع الحالة',
        policyNo: 'رقم الوثيقة',
        cardNo: 'رقم الكارنيه',
        insuranceCoverage: 'تغطية التأمين',
        patientPayable: 'المطلوب من المريض',
        paymentHistory: 'سجل الدفعات والتحصيل',
        paymentDate: 'التاريخ',
        paymentMethod: 'وسيلة الدفع',
        paymentRef: 'المرجع / كود العملية',
        paymentAmount: 'المبلغ',
        selfPay: 'حساب خاص (سداد مباشر)',
        insuranceTag: 'تأمين / تعاقد جهة',
    },
};

const formatPaymentMethod = (method, isArabic) => {
    const m = String(method || '').trim();
    if (/card/i.test(m)) return isArabic ? 'بطاقة بنكية / فيزا' : 'Card / POS';
    if (/wallet/i.test(m)) return isArabic ? 'محفظة إلكترونية' : 'Digital Wallet';
    if (/bank/i.test(m)) return isArabic ? 'حوالة / تحويل بنكي' : 'Bank Transfer';
    if (/cash/i.test(m)) return isArabic ? 'نقدي (كاش)' : 'Cash';
    return m;
};

const statusTone = (status) => {
    if (status === 'Paid') return 'success';
    if (status === 'Partial') return 'warn';
    if (status === 'Voided') return 'danger';
    return 'neutral';
};

const PrintInvoice = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isStatement = id === 'statement';
    const patientId = searchParams.get('patientId');
    const appointmentIds = searchParams.get('appointmentIds');

    const { t, i18n } = useTranslation('common');
    const { data: invData, isLoading: invLoading, isError: invError } = useGetInvoiceQuery(id, { skip: isStatement || !id });
    const { data: stmtData, isLoading: stmtLoading, isError: stmtError } = useGetVisitsStatementQuery(
        { patientId, appointmentIds },
        { skip: !isStatement || !patientId }
    );
    const invoice = isStatement ? stmtData : invData;
    const isDataLoading = isStatement ? stmtLoading : invLoading;
    const isDataError = isStatement ? stmtError : invError;
    const { data: settings, isLoading: settingsLoading } = useGetCenterSettingsQuery();

    const [paperSize, setPaperSize] = useState('A4');
    const [orientation, setOrientation] = useState('portrait');
    const [showTaxId, setShowTaxId] = useState(true);
    const [showCenterInfo, setShowCenterInfo] = useState(true);
    const [showPatientMrn, setShowPatientMrn] = useState(true);
    const [showPaymentsHistory, setShowPaymentsHistory] = useState(true);
    const [invoiceDisplayNumber, setInvoiceDisplayNumber] = useState('');

    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [headerLayout, setHeaderLayout] = useState('classic');
    const [showWatermark, setShowWatermark] = useState(true);
    const [invoiceTerms, setInvoiceTerms] = useState('');
    const [tableSpacing, setTableSpacing] = useState('normal');
    const trialWatermark = useTrialWatermark();

    const isArabic = i18n.language.startsWith('ar');
    const copy = { ...printCopy(isArabic), ...(isArabic ? INVOICE_EXTRA_COPY.ar : INVOICE_EXTRA_COPY.en) };

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

    if (isDataLoading || settingsLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
    if (isDataError || !invoice) return <div className="p-8 text-center font-bold text-red-500">{t('errors.loadFailed', { defaultValue: 'Failed to load details' })}</div>;

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

    const pageDimensions = getPageDimensions(paperSize, orientation);
    const fontStack = getFontStack(fontFamily);
    const handlePrint = () => printWhenReady();

    const isInsuranceCase = Number(invoice.insurance_covered_amount || 0) > 0 || Boolean(invoice.provider_name);
    const balance = Number(invoice.balance_amount);

    return (
        <div className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'} style={{ '--print-accent': themeColor }}>
            <style>
                {buildPrintStyles({
                    pageRule: resolvePageRule({ size: paperSize, orientation }),
                    margin: '0.5in',
                    extraCss: `
                        .invoice-container {
                            box-shadow: none !important;
                            margin: 0 !important;
                            width: 100% !important;
                            min-height: 0 !important;
                            max-width: none !important;
                            border: 0 !important;
                            border-radius: 0 !important;
                        }
                    `,
                })}
            </style>

            <PrintSidebar
                title={copy.customize}
                onPrint={handlePrint}
                printLabel={copy.print}
                onClose={() => window.close()}
                closeLabel={copy.close}
            >
                <PrintField label={copy.language}>
                    <LanguageToggle variant="default" className="w-full justify-center" />
                </PrintField>

                <PrintField label={copy.paper}>
                    <PrintSegmented
                        options={printOptionLabels(['A4', 'A5', 'Letter'].map(size => ({ value: size, en: size, ar: size })), isArabic)}
                        value={paperSize}
                        onChange={setPaperSize}
                        ariaLabel={copy.paper}
                    />
                </PrintField>

                <PrintField label={copy.orientation}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'portrait', en: copy.portrait, ar: copy.portrait },
                            { value: 'landscape', en: copy.landscape, ar: copy.landscape },
                        ], isArabic)}
                        value={orientation}
                        onChange={setOrientation}
                        columns={2}
                        ariaLabel={copy.orientation}
                    />
                </PrintField>

                <PrintTextInput
                    label={copy.invoiceNumber}
                    value={invoiceDisplayNumber}
                    onChange={setInvoiceDisplayNumber}
                    placeholder="INV-000123"
                />

                <PrintSelectField
                    label={copy.accent}
                    value={themeColor}
                    onChange={setThemeColor}
                    options={printOptionLabels(PRINT_ACCENTS, isArabic)}
                />

                <PrintSelectField
                    label={copy.typography}
                    value={fontFamily}
                    onChange={setFontFamily}
                    options={printOptionLabels(PRINT_FONTS, isArabic)}
                />

                <PrintSelectField
                    label={copy.header}
                    value={headerLayout}
                    onChange={setHeaderLayout}
                    options={printOptionLabels([
                        { value: 'classic', en: copy.classic, ar: copy.classic },
                        { value: 'center', en: copy.centered, ar: copy.centered },
                    ], isArabic)}
                />

                <PrintField label={copy.density}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'compact', en: copy.compact, ar: copy.compact },
                            { value: 'normal', en: copy.normal, ar: copy.normal },
                            { value: 'cozy', en: copy.cozy, ar: copy.cozy },
                        ], isArabic)}
                        value={tableSpacing}
                        onChange={setTableSpacing}
                        ariaLabel={copy.density}
                    />
                </PrintField>

                <PrintTextArea
                    label={copy.terms}
                    value={invoiceTerms}
                    onChange={setInvoiceTerms}
                    placeholder={copy.termsHint}
                />

                <PrintField label={copy.sections}>
                    <PrintToggle checked={showCenterInfo} onChange={setShowCenterInfo} label={copy.center} />
                    <PrintToggle checked={showTaxId} onChange={setShowTaxId} label={copy.tax} />
                    <PrintToggle checked={showPatientMrn} onChange={setShowPatientMrn} label={copy.mrn} />
                    <PrintToggle checked={showPaymentsHistory} onChange={setShowPaymentsHistory} label={copy.paymentsHistory} />
                    <PrintToggle checked={showWatermark} onChange={setShowWatermark} label={copy.watermark} />
                </PrintField>
            </PrintSidebar>

            <PrintStage>
                <PrintDocument
                    className="invoice-container print-sheet shadow-lg border border-slate-200/50 rounded-md"
                    scale={{ sheet: true, density: tableSpacing }}
                    style={{
                        width: pageDimensions.width,
                        minHeight: pageDimensions.height,
                        ...getSheetPreviewVariables(pageDimensions),
                        fontFamily: fontStack
                    }}
                    watermark={trialWatermark || (invoice.invoice_status === 'Paid' && showWatermark ? copy.paid : null)}
                >
                    <DocIdentityHeader
                        align={headerLayout === 'center' ? 'center' : 'start'}
                        logoUrl={showCenterInfo ? logoUrl : null}
                        centerName={centerName}
                        branchName={showCenterInfo ? branchName : null}
                        contact={showCenterInfo ? [
                            address,
                            [phone && `${t('fields.phone', { defaultValue: 'Phone' })}: ${phone}`, email && `${t('fields.email', { defaultValue: 'Email' })}: ${email}`].filter(Boolean).join(' · '),
                            contactPerson && `${copy.contact}: ${contactPerson}`,
                            otherDetails,
                        ] : []}
                        taxLine={showTaxId && taxId ? (
                            <>{t('fields.taxId', { defaultValue: 'Tax ID' })}: <span className="font-mono">{taxId}</span></>
                        ) : null}
                        title={invoice.is_statement ? (isArabic ? 'كشف حساب فواتير وزيارات' : 'Visits Billing Statement') : t('billing.invoice', { defaultValue: 'Invoice' })}
                        titleMeta={
                            <div className={`flex flex-col gap-0.5 ${headerLayout === 'center' ? 'items-center' : 'items-end'} text-slate-500`}>
                                <div className="flex items-center gap-2">
                                    <span className="pd-label font-black uppercase tracking-widest text-slate-400">{t('billing.invoiceNo', { defaultValue: 'No.' })}</span>
                                    <span className="pd-value font-mono font-black text-slate-900 ltr-embed">{invoiceDisplayNumber || invoice.invoice_number}</span>
                                </div>
                                <p className="pd-micro font-bold text-slate-400">
                                    {t('fields.date', { defaultValue: 'Date' })}: <span className="font-extrabold text-slate-700 ltr-embed">{new Date(invoice.generated_at).toLocaleDateString(i18n.language)}</span>
                                </p>
                                <div className="mt-1"><DocPill tone={statusTone(invoice.invoice_status)}>{t(`billing.status.${invoice.invoice_status}`, { defaultValue: invoice.invoice_status })}</DocPill></div>
                            </div>
                        }
                    />

                    {/* Billed to + case summary */}
                    <div className="pd-block print-keep-together relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
                        <div className="pd-card pd-soft p-3">
                            <DocSectionHead label={t('billing.billedTo', { defaultValue: 'Billed To' })} />
                            <p className="pd-title font-black leading-tight text-slate-900">
                                {invoice.patient_name || t('patient.walkIn', { defaultValue: 'Walk-in Patient' })}
                            </p>
                            <div className="pd-micro mt-1.5 space-y-0.5 font-semibold text-slate-600">
                                {showPatientMrn && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">MRN</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">{invoice.mrn}</span>
                                    </div>
                                )}
                                {invoice.is_statement && invoice.selected_visits_count != null && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{isArabic ? 'الزيارات المحددة' : 'Selected visits'}</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">
                                            {isArabic ? `${invoice.selected_visits_count} زيارات` : `Selected visits: ${invoice.selected_visits_count}`}
                                        </span>
                                    </div>
                                )}
                                <div className="pd-row">
                                    <span className="text-slate-400">{copy.caseType}</span>
                                    <span className="font-bold text-slate-800">
                                        {isInsuranceCase ? (invoice.provider_name || copy.insuranceTag) : copy.selfPay}
                                    </span>
                                </div>
                                {isInsuranceCase && invoice.policy_number && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{copy.policyNo}</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">{invoice.policy_number}</span>
                                    </div>
                                )}
                                {isInsuranceCase && invoice.member_number && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{copy.cardNo}</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">{invoice.member_number}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="pd-card pd-soft flex flex-col justify-center p-3">
                            <DocSectionHead label={t('billing.paymentStatus', { defaultValue: 'Payment Status' })} />
                            {balance > 0 ? (
                                <div className="pd-row">
                                    <span className="pd-label text-slate-400">{t('billing.amountDue', { defaultValue: 'Amount Due' })}</span>
                                    <span className="pd-hero font-mono font-black text-rose-600 ltr-embed">{formatMoney(balance)}</span>
                                </div>
                            ) : (
                                <div className="pd-row">
                                    <span className="pd-label text-slate-400">{t('billing.amountDue', { defaultValue: 'Amount Due' })}</span>
                                    <DocPill tone="success">{copy.paid}</DocPill>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line items */}
                    <section className="pd-block relative z-10">
                        <DocSectionHead label={t('billing.invoiceItems', { defaultValue: 'Invoice line items' })} />
                        <div className="print-table-region">
                            <table className="pd-ledger">
                                <thead>
                                    <tr>
                                        <th>{t('fields.description', { defaultValue: 'Description' })}</th>
                                        <th className="pd-num">{t('fields.unitPrice', { defaultValue: 'Unit Price' })}</th>
                                        <th className="pd-num text-center">{t('fields.quantity', { defaultValue: 'Qty' })}</th>
                                        <th className="pd-num">{t('fields.total', { defaultValue: 'Total' })}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoice.items?.map((item) => (
                                        <tr key={item.item_id}>
                                            <td className="font-bold text-slate-800">{item.name || item.description}</td>
                                            <td className="pd-num text-slate-500">{formatMoney(item.price || item.unit_price)}</td>
                                            <td className="pd-num text-center text-slate-500">{item.quantity}</td>
                                            <td className="pd-num font-black text-slate-900">{formatMoney(item.total_amount)}</td>
                                        </tr>
                                    ))}
                                    {(!invoice.items || invoice.items.length === 0) && (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center text-slate-400 italic">{t('billing.noItems', { defaultValue: 'No line items' })}</td>
                                        </tr>
                                    )}
                                    <tr className="pd-total-row">
                                        <td colSpan={3} className="uppercase">{t('fields.total', { defaultValue: 'Total' })}</td>
                                        <td className="pd-num" style={{ color: 'var(--print-accent)' }}>{formatMoney(invoice.total_amount)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Totals + terms */}
                    <div className="pd-block print-keep-together relative z-10 flex flex-col justify-between items-start gap-4 sm:flex-row print:flex-row">
                        <div className="flex-1 max-w-sm">
                            {invoiceTerms && (
                                <>
                                    <DocSectionHead label={copy.terms} />
                                    <p className="pd-micro whitespace-pre-wrap rounded-lg border border-slate-200/70 bg-slate-50/70 p-2.5 font-medium leading-relaxed text-slate-600">{invoiceTerms}</p>
                                </>
                            )}
                        </div>

                        <div className="pd-totals w-full sm:w-72 print:w-72">
                            <div className="pd-row">
                                <span className="font-semibold text-slate-500">{t('billing.subtotal', { defaultValue: 'Subtotal' })}</span>
                                <span className="font-mono ltr-embed">{formatMoney(invoice.total_amount)}</span>
                            </div>
                            {Number(invoice.discount_amount) > 0 && (
                                <div className="pd-row font-bold text-emerald-700">
                                    <span>{t('billing.discount', { defaultValue: 'Discount' })}</span>
                                    <span className="font-mono ltr-embed">-{formatMoney(invoice.discount_amount)}</span>
                                </div>
                            )}
                            {Number(invoice.insurance_covered_amount) > 0 && (
                                <div className="pd-row font-bold text-blue-800">
                                    <span>{copy.insuranceCoverage}</span>
                                    <span className="font-mono ltr-embed">-{formatMoney(invoice.insurance_covered_amount)}</span>
                                </div>
                            )}
                            {(Number(invoice.insurance_covered_amount) > 0 || (invoice.patient_payable_amount !== undefined && Number(invoice.patient_payable_amount) !== Number(invoice.total_amount))) && (
                                <div className="pd-row font-black text-indigo-900">
                                    <span>{copy.patientPayable}</span>
                                    <span className="font-mono ltr-embed">{formatMoney(invoice.patient_payable_amount)}</span>
                                </div>
                            )}
                            <div className="pd-row font-bold text-emerald-700">
                                <span>{t('billing.amountPaid', { defaultValue: 'Amount Paid' })}</span>
                                <span className="font-mono ltr-embed">{formatMoney(invoice.paid_amount)}</span>
                            </div>
                            <div className="pd-row pd-grand">
                                <span>{t('billing.balanceDue', { defaultValue: 'Balance Due' })}</span>
                                <span className="font-mono ltr-embed">{formatMoney(balance)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Payment transactions history */}
                    {showPaymentsHistory && invoice.payments && invoice.payments.length > 0 && (
                        <section className="pd-block print-keep-together relative z-10">
                            <DocSectionHead label={copy.paymentHistory} />
                            <div className="print-table-region">
                                <table className="pd-ledger">
                                    <thead>
                                        <tr>
                                            <th>{copy.paymentDate}</th>
                                            <th>{copy.paymentMethod}</th>
                                            <th>{copy.paymentRef}</th>
                                            <th className="pd-num">{copy.paymentAmount}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoice.payments.map((p, idx) => (
                                            <tr key={p.payment_id || idx}>
                                                <td className="font-mono text-slate-500 ltr-embed">
                                                    {p.transaction_date ? new Date(p.transaction_date).toLocaleDateString(i18n.language) : '—'}
                                                </td>
                                                <td className="font-semibold text-slate-700">
                                                    {formatPaymentMethod(p.method || p.payment_method, isArabic)}
                                                    {p.receipt_number && <span className="pd-micro block font-mono text-slate-400">{p.receipt_number}</span>}
                                                </td>
                                                <td className="font-mono text-slate-600 ltr-embed">{p.payment_reference || '—'}</td>
                                                <td className="pd-num font-black text-slate-900">{formatMoney(p.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <DocFooter
                        cert={documentIdentity.poweredBy}
                        lines={[
                            `${t('billing.thankYou', { defaultValue: 'Thank you for choosing' })} ${centerName}.`,
                            t('billing.questions', { defaultValue: 'For any questions regarding this invoice, please contact' }) + ' ' + [email, phone].filter(Boolean).join(` ${t('common.or', { defaultValue: 'or' })} `) + '.'
                        ]}
                    />
                </PrintDocument>
            </PrintStage>
        </div>
    );
};

export default PrintInvoice;
