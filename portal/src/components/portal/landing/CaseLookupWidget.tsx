import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  Printer,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLookupPublicCaseStatusMutation } from '@/store/api';

type WorkflowState = 'completed' | 'current' | 'pending';

interface CaseLookupResult {
  found: boolean;
  completed?: boolean;
  case?: {
    examType?: string;
    modality?: string | null;
    studyDate?: string | null;
    lastUpdatedAt?: string | null;
    status?: { code: string; phase?: string; label?: string; progress: number };
    workflow?: Array<{ code: string; state: WorkflowState; at?: string | null }>;
  };
  estimate?: {
    estimatedCompletionAt?: string | null;
    remainingMinutes?: number;
    delayed?: boolean;
    confidence?: 'high' | 'moderate' | 'standard';
  };
  report?: {
    available?: boolean;
    access?: string;
    accessToken?: string;
    expiresInSeconds?: number;
  };
}

const statusLabels: Record<string, { ar: string; en: string }> = {
  scheduled: { ar: 'تم جدولة الموعد', en: 'Appointment scheduled' },
  arrived: { ar: 'تم تسجيل الوصول', en: 'Visit checked in' },
  preparation: { ar: 'جارٍ التحضير للفحص', en: 'Preparing for imaging' },
  imaging: { ar: 'الفحص جارٍ الآن', en: 'Imaging in progress' },
  awaiting_report: { ar: 'اكتمل التصوير وبانتظار التقرير', en: 'Imaging complete, awaiting report' },
  reporting: { ar: 'جارٍ إعداد التقرير', en: 'Report in progress' },
  typing: { ar: 'تم إعداد التقرير للمراجعة', en: 'Report prepared for review' },
  review: { ar: 'التقرير قيد المراجعة النهائية', en: 'Report under final review' },
  approval: { ar: 'بانتظار التوقيع النهائي', en: 'Awaiting final signature' },
  completed: { ar: 'التقرير النهائي جاهز', en: 'Final report ready' },
};

const workflowLabels: Record<string, { ar: string; en: string }> = {
  scheduled: { ar: 'الموعد', en: 'Scheduled' },
  preparation: { ar: 'التحضير', en: 'Preparation' },
  imaging: { ar: 'التصوير', en: 'Imaging' },
  reporting: { ar: 'التقرير', en: 'Reporting' },
  completed: { ar: 'جاهز', en: 'Ready' },
};

export const CaseLookupWidget = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const locale = isRtl ? 'ar-EG' : 'en-GB';
  const reduceMotion = useReducedMotion();
  const [identifier, setIdentifier] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [reportAction, setReportAction] = useState<'preview' | 'print' | 'download' | 'share' | null>(null);
  const [reportAccessError, setReportAccessError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [lookupCase, { data: rawResult, isLoading, error, reset }] = useLookupPublicCaseStatusMutation();
  const caseResult = rawResult as CaseLookupResult | undefined;

  const currentCase = caseResult?.case;
  const currentStatus = currentCase?.status;
  const finalized = Boolean(caseResult?.found && (caseResult.completed || caseResult.report?.available || currentStatus?.code === 'completed'));
  const progress = Math.min(100, Math.max(0, Number(currentStatus?.progress || 0)));

  const formatDateTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const remainingLabel = useMemo(() => {
    const minutes = Number(caseResult?.estimate?.remainingMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (minutes < 60) return isRtl ? `حوالي ${minutes} دقيقة` : `About ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!remainder) return isRtl ? `حوالي ${hours} ساعة` : `About ${hours} hr`;
    return isRtl ? `حوالي ${hours} ساعة و${remainder} دقيقة` : `About ${hours} hr ${remainder} min`;
  }, [caseResult?.estimate?.remainingMinutes, isRtl]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const value = identifier.trim();
    if (!value) return;
    reset();
    setHasSearched(true);
    setReportAccessError(null);
    try {
      await lookupCase({ mrn: value }).unwrap();
    } catch {
      // The mutation state renders the appropriate failure message.
    }
  };

  const refreshStatus = () => {
    const value = identifier.trim();
    if (value) lookupCase({ mrn: value });
  };

  const openPublicReport = async (action: 'preview' | 'print' | 'download' | 'share') => {
    const accessToken = caseResult?.report?.accessToken;
    if (!accessToken || reportAction) return;

    const popup = action === 'preview' || action === 'print' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    setReportAction(action);
    setReportAccessError(null);
    setShareNotice(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const shareUrl = `${baseUrl}/public/final-report/${encodeURIComponent(accessToken)}`;

      if (action === 'share') {
        const copyShareUrl = async () => {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            return;
          }
          const input = document.createElement('textarea');
          input.value = shareUrl;
          input.setAttribute('readonly', '');
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          input.remove();
        };
        const shareData = {
          title: isRtl ? 'التقرير التشخيصي النهائي' : 'Final diagnostic report',
          text: isRtl ? 'رابط آمن ومؤقت لمعاينة التقرير النهائي.' : 'A secure, temporary link to the final diagnostic report.',
          url: shareUrl,
        };
        if (navigator.share) {
          try {
            await navigator.share(shareData);
            setShareNotice(isRtl ? 'تمت مشاركة التقرير.' : 'Report shared.');
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            await copyShareUrl();
            setShareNotice(isRtl ? 'تم نسخ رابط التقرير.' : 'Report link copied.');
          }
        } else {
          await copyShareUrl();
          setShareNotice(isRtl ? 'تم نسخ رابط التقرير.' : 'Report link copied.');
        }
        return;
      }

      const response = await fetch(`${baseUrl}/public/final-report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'download'
          ? { accessToken, format: 'pdf', disposition: 'attachment' }
          : { accessToken }),
      });
      if (!response.ok) throw new Error('REPORT_ACCESS_FAILED');

      if (action === 'download') {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'Diagnostic-Report.pdf';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }

      const html = await response.text();
      const printScript = '<script>window.addEventListener("load",function(){window.setTimeout(function(){window.print();},300);});</script>';
      const outputHtml = action === 'print'
        ? (html.match(/<\/body>/i) ? html.replace(/<\/body>/i, `${printScript}</body>`) : `${html}${printScript}`)
        : html;
      const url = URL.createObjectURL(new Blob([outputHtml], { type: 'text/html;charset=utf-8' }));

      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.click();
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (_error) {
      if (popup && !popup.closed) popup.close();
      setReportAccessError(isRtl
        ? 'تعذر فتح التقرير الآن. أعد الاستعلام ثم حاول مرة أخرى.'
        : 'The report could not be opened. Refresh the status and try again.');
    } finally {
      setReportAction(null);
    }
  };

  useEffect(() => {
    if (!hasSearched || !caseResult?.found || finalized) return undefined;
    const timer = window.setInterval(() => {
      const value = identifier.trim();
      if (value) lookupCase({ mrn: value });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [caseResult?.found, finalized, hasSearched, identifier, lookupCase]);

  const localizedStatus = currentStatus
    ? statusLabels[currentStatus.code]?.[isRtl ? 'ar' : 'en'] || currentStatus.label
    : null;

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl">
      <div className="border-b border-border bg-[#F3F9F7] px-5 pb-6 pt-7 text-center dark:bg-primary-soft/15 sm:px-8 sm:pt-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="h-4 w-4" />{isRtl ? 'استعلام آمن عن الحالة' : 'Secure status lookup'}</span>
        <h2 className="mx-auto mt-2 max-w-xl text-2xl font-bold text-[#0B2348] dark:text-white sm:text-3xl">{isRtl ? 'تابع حالة الفحص والتقرير' : 'Track your scan and report'}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
          {isRtl ? 'أدخل الرقم الطبي أو رقم الطلب لعرض المرحلة الحالية والوقت المتوقع.' : 'Enter your medical record or order number to see the current stage and expected completion time.'}
        </p>
      </div>

      <div className="p-5 sm:p-8">
        <form onSubmit={handleSearch} className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (hasSearched) setHasSearched(false);
              }}
              placeholder={isRtl ? 'الرقم الطبي أو رقم الطلب' : 'Medical record or order number'}
              aria-label={isRtl ? 'الرقم الطبي أو رقم الطلب' : 'Medical record or order number'}
              className="w-full rounded-xl border border-border bg-background py-3.5 pe-4 ps-11 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button type="submit" disabled={isLoading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
            {isLoading && !caseResult ? <><Loader2 className="h-4 w-4 animate-spin" />{isRtl ? 'جاري التحقق...' : 'Checking...'}</> : <>{isRtl ? 'تحقق من الحالة' : 'Check status'}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></>}
          </button>
        </form>

        <AnimatePresence mode="wait" initial={false}>
          {hasSearched && (error || caseResult) && (
            <motion.div key={error ? 'error' : caseResult?.found ? 'result' : 'empty'} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.28 }} className="mx-auto mt-6 max-w-2xl">
              {error ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
                  <AlertCircle className="mx-auto h-7 w-7 text-amber-600" />
                  <p className="mt-2 text-sm font-bold text-[#0B2348] dark:text-white">{isRtl ? 'تعذر التحقق من الرقم حالياً' : 'We could not verify this number'}</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-muted-foreground">{isRtl ? 'تأكد من الرقم وحاول مرة أخرى، أو استخدم بوابة المريض للوصول الكامل.' : 'Check the number and try again, or use the patient portal for complete access.'}</p>
                </div>
              ) : caseResult?.found && currentCase && currentStatus ? (
                <div className="overflow-hidden rounded-2xl border border-[#DCE8E5] bg-[#F8FBFA] dark:border-border dark:bg-background">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${finalized ? 'bg-emerald-500/10 text-emerald-700' : 'bg-[#E4F5EF] text-primary dark:bg-primary-soft'}`}><FileText className="h-5 w-5" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#0B2348] dark:text-white">{currentCase.examType || currentCase.modality || (isRtl ? 'فحص تشخيصي' : 'Diagnostic study')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{currentCase.modality || (isRtl ? 'خدمة تصوير تشخيصي' : 'Diagnostic imaging')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${finalized ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                          {finalized ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          {localizedStatus}
                        </span>
                        {!finalized && <button type="button" onClick={refreshStatus} disabled={isLoading} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-primary transition hover:border-primary/40 disabled:opacity-50 dark:bg-surface" aria-label={isRtl ? 'تحديث الحالة' : 'Refresh status'} title={isRtl ? 'تحديث الحالة' : 'Refresh status'}><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /></button>}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                        <span className="text-[#0B2348] dark:text-white">{isRtl ? 'التقدم الحالي' : 'Current progress'}</span>
                        <span className="text-primary" dir="ltr">{progress}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#DDEAE7] dark:bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                        <motion.div initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full bg-primary" />
                      </div>
                    </div>

                    <ol className="mt-5 grid grid-cols-5 gap-1" aria-label={isRtl ? 'مراحل الفحص والتقرير' : 'Exam and report stages'}>
                      {(currentCase.workflow || []).map((step) => (
                        <li key={step.code} className="min-w-0 text-center">
                          <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border ${step.state === 'completed' ? 'border-primary bg-primary text-white' : step.state === 'current' ? 'border-primary bg-white text-primary ring-4 ring-primary/10 dark:bg-surface' : 'border-[#CCDAD7] bg-white text-muted-foreground dark:border-border dark:bg-surface'}`}>
                            {step.state === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                          </span>
                          <span className={`mt-1.5 block truncate text-[9px] font-semibold sm:text-[10px] ${step.state === 'current' ? 'text-primary' : 'text-muted-foreground'}`}>{workflowLabels[step.code]?.[isRtl ? 'ar' : 'en'] || step.code}</span>
                        </li>
                      ))}
                    </ol>

                    {!finalized && caseResult.estimate && (
                      <div className={`mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${caseResult.estimate.delayed ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-primary/15 bg-white dark:border-border dark:bg-surface'}`}>
                        <div className="flex items-start gap-3">
                          <CalendarClock className={`mt-0.5 h-5 w-5 shrink-0 ${caseResult.estimate.delayed ? 'text-amber-600' : 'text-primary'}`} />
                          <div>
                            <p className="text-xs font-bold text-[#0B2348] dark:text-white">{caseResult.estimate.delayed ? (isRtl ? 'تجاوز الوقت المتوقع' : 'Past the expected time') : (isRtl ? 'الوقت المتوقع للتقرير النهائي' : 'Expected final report time')}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatDateTime(caseResult.estimate.estimatedCompletionAt) || (isRtl ? 'جارٍ تحديث التقدير' : 'Updating estimate')}</p>
                          </div>
                        </div>
                        {remainingLabel && !caseResult.estimate.delayed && <span className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary">{remainingLabel}</span>}
                      </div>
                    )}

                    {finalized && (
                      <div className="mt-5 border-t border-[#DCE8E5] pt-5 dark:border-border">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-[#0B2348] dark:text-white">{isRtl ? 'التقرير النهائي معتمد وجاهز' : 'Final report is signed and ready'}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{isRtl ? 'يمكنك معاينة التقرير أو تنزيله بصيغة PDF أو طباعته أو مشاركة رابط مؤقت.' : 'Preview, download as PDF, print, or share a temporary link to the signed report.'}</p>
                          </div>
                          {currentCase.lastUpdatedAt && <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(currentCase.lastUpdatedAt)}</span>}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                          <button type="button" onClick={() => openPublicReport('preview')} disabled={Boolean(reportAction) || !caseResult.report?.accessToken} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60">{reportAction === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}{isRtl ? 'معاينة' : 'Preview'}</button>
                          <button type="button" onClick={() => openPublicReport('download')} disabled={Boolean(reportAction) || !caseResult.report?.accessToken} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-bold text-[#0B2348] transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60 dark:bg-surface dark:text-white">{reportAction === 'download' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Download className="h-4 w-4 text-primary" />}{isRtl ? 'تنزيل PDF' : 'Download PDF'}</button>
                          <button type="button" onClick={() => openPublicReport('print')} disabled={Boolean(reportAction) || !caseResult.report?.accessToken} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-bold text-[#0B2348] transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60 dark:bg-surface dark:text-white">{reportAction === 'print' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Printer className="h-4 w-4 text-primary" />}{isRtl ? 'طباعة' : 'Print'}</button>
                          <button type="button" onClick={() => openPublicReport('share')} disabled={Boolean(reportAction) || !caseResult.report?.accessToken} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 text-xs font-bold text-primary transition hover:border-primary/50 hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60">{reportAction === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}{isRtl ? 'مشاركة' : 'Share'}</button>
                        </div>
                        {shareNotice && <p role="status" className="mt-3 text-xs font-semibold text-primary">{shareNotice}</p>}
                        {reportAccessError && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-300">{reportAccessError}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center">
                  <AlertCircle className="mx-auto h-7 w-7 text-amber-500" />
                  <p className="mt-2 text-sm font-bold text-foreground">{isRtl ? 'لا توجد حالة متاحة لهذا الرقم' : 'No status is available for this number'}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row">
          <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" />{isRtl ? 'يُفتح التقرير فقط بعد نجاح الاستعلام عن الحالة.' : 'The report opens only after a successful case-status lookup.'}</span>
          <span className="font-bold text-primary">{isRtl ? 'وصول مباشر مؤقت' : 'Temporary direct access'}</span>
        </div>
      </div>
    </div>
  );
};

export default CaseLookupWidget;
