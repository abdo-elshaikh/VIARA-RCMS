import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  AlertTriangle,
  Search,
  CheckCircle2,
  Lock,
  Building2,
  Calendar,
  User,
  Activity,
  FileCheck,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { PortalHeader } from "../components/portal/layout/PortalHeader";
import { PortalFooter } from "../components/portal/layout/PortalFooter";
import { useGetPublicCenterSettingsQuery } from "../store/api";
import { resolvePortalIdentity } from "../lib/portal-identity";

interface VerificationResult {
  verified: boolean;
  status: string;
  orderNumber: string;
  patientMasked: string;
  mrn: string;
  examType: string;
  modality: string;
  studyDate: string;
  finalizedAt: string;
  radiologist: string;
  radiologistRole: string;
  centerName: string;
  branchName: string;
  verificationHash: string;
  integrityConfirmed: boolean;
  error?: string;
}

export const PublicReportVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");

  const initialCode =
    searchParams.get("code") || searchParams.get("hash") || searchParams.get("order") || "";
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(Boolean(initialCode));
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: centerSettings } = useGetPublicCenterSettingsQuery();
  const identity = resolvePortalIdentity({ settings: centerSettings, language: i18n.language });

  const verifyCode = async (targetCode: string) => {
    const trimmed = targetCode.trim();
    if (!trimmed) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await fetch(`/api/public/reports/verify/${encodeURIComponent(trimmed)}`);
      const data = await response.json();

      if (response.ok && data.verified) {
        setResult(data);
      } else {
        setErrorMsg(
          data.error ||
            (isRtl
              ? "لم يتم العثور على تقرير معتمد بهذا الرمز."
              : "No verified report found matching this code."),
        );
      }
    } catch {
      setErrorMsg(
        isRtl
          ? "تعذر الاتصال بخادم التحقق. يرجى المحاولة لاحقاً."
          : "Unable to reach verification server. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const initialVerifyRef = useRef(verifyCode);

  useEffect(() => {
    if (initialCode) {
      initialVerifyRef.current(initialCode);
    }
  }, [initialCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      verifyCode(code.trim());
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return "—";
    try {
      return new Date(isoStr).toLocaleString(isRtl ? "ar-EG" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-foreground dark:bg-slate-950">
      <PortalHeader onBook={() => navigate("/portal/login")} onLogin={() => navigate("/")} />

      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Header Banner */}
          <div className="text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 shadow-sm ring-8 ring-primary-50 dark:bg-primary-950/60 dark:text-primary-300 dark:ring-primary-950/30">
              <ShieldCheck className="h-9 w-9" />
            </div>
            <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {isRtl
                ? "التحقق من صحة التقرير الطبي الرقمي"
                : "Diagnostic Report Authenticity Verification"}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {isRtl
                ? "خدمة التحقق الفوري والمشفر من صحة تقارير الأشعة المعتمدة ومطابقتها للسجل الطبي الرسمي."
                : "Instant cryptographic verification of finalized radiology reports against the official PACS archive."}
            </p>
          </div>

          {/* Search / Input Box */}
          <form onSubmit={handleSubmit} className="mt-8">
            <div className="relative flex items-center">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={
                  isRtl
                    ? "أدخل رمز التحقق (Hash) أو رقم الطلب..."
                    : "Enter verification hash code or Order number..."
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 ps-12 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:ring-primary-900/30"
              />
              <Search className="absolute start-4 h-5 w-5 text-slate-400" />
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="absolute end-2 rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-primary-800 disabled:opacity-50"
              >
                {loading
                  ? isRtl
                    ? "جارٍ التحقق..."
                    : "Verifying..."
                  : isRtl
                    ? "تحقق الآن"
                    : "Verify"}
              </button>
            </div>
          </form>

          {/* Verification Result Card */}
          {result && (
            <div className="mt-8 overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl dark:border-emerald-900/40 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-200">
              {/* Card Header */}
              <div className="border-b border-emerald-100 bg-emerald-50/70 p-6 dark:border-emerald-950/50 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-emerald-950 dark:text-emerald-200">
                        {isRtl
                          ? "وثيقة طبية معتمدة ومطابقة للأصل"
                          : "Authenticated & Certified Medical Report"}
                      </h2>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {isRtl
                          ? "تم التحقق من التوقيع الرقمي بنجاح 100%"
                          : "Cryptographic signature confirmed intact"}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <Lock className="h-3.5 w-3.5" />
                    {result.status}
                  </span>
                </div>
              </div>

              {/* Card Body - Metadata Grid */}
              <div className="p-6 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-primary-600" />
                      {isRtl ? "الفحص التشخيصي" : "Examination"}
                    </span>
                    <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                      {result.examType}
                    </p>
                    <span className="mt-1 inline-block rounded-md bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-800 dark:bg-primary-950 dark:text-primary-300">
                      {result.modality}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary-600" />
                      {isRtl ? "المركز الطبي المُصدر" : "Issuing Facility"}
                    </span>
                    <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                      {result.centerName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {result.branchName}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-primary-600" />
                      {isRtl ? "المريض (حماية الخصوصية)" : "Patient (Privacy Masked)"}
                    </span>
                    <p className="mt-1 font-mono text-base font-extrabold text-slate-900 dark:text-white">
                      {result.patientMasked}
                    </p>
                    <p className="text-xs font-mono font-semibold text-slate-500">
                      MRN: {result.mrn} • Order: {result.orderNumber}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                      <FileCheck className="h-3.5 w-3.5 text-primary-600" />
                      {isRtl ? "طبيب الأشعة المعتمد" : "Reporting Radiologist"}
                    </span>
                    <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                      {result.radiologist}
                    </p>
                    <p className="text-xs font-medium text-slate-500">{result.radiologistRole}</p>
                  </div>
                </div>

                {/* Finalization Timestamp & Cryptographic Hash */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-950/60 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Calendar className="h-3.5 w-3.5" />
                      {isRtl ? "تاريخ الاعتماد الرسمي:" : "Officially Signed At:"}
                    </span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {formatDate(result.finalizedAt)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      {isRtl
                        ? "بصمة التشفير الرقمية (SHA-256 Digest)"
                        : "Cryptographic Digital Hash (SHA-256)"}
                    </span>
                    <p className="mt-1 font-mono text-[11px] font-bold text-primary-700 dark:text-primary-400 break-all leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      {result.verificationHash}
                    </p>
                  </div>
                </div>

                {/* Footer Legal Assurance */}
                <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {isRtl
                    ? "شهادة التحقق هذه صادرة آلياً من نظام VIARA وتؤكد أن النسخة المطبوعة مطابقة تماماً للملف الإلكتروني المعتمد والمحفوظ في أرشيف المستشفى دون أي تحريف."
                    : "This certificate is automatically generated by VIARA to confirm that the printed paper matches the immutable encrypted report on file in the hospital archive."}
                </p>

                {/* Portal Access CTA */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/patient/login")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-primary-800"
                  >
                    <span>
                      {isRtl
                        ? "تسجيل دخول المريض لعرض كامل الملف"
                        : "Login to Patient Portal for Full Records"}
                    </span>
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setCode("");
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <span>{isRtl ? "فحص تقرير آخر" : "Verify Another Document"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {errorMsg && (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 animate-in fade-in duration-150">
              <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
              <h3 className="mt-2 text-base font-bold">
                {isRtl ? "فشل التحقق من التقرير" : "Verification Failed"}
              </h3>
              <p className="mt-1 text-xs">{errorMsg}</p>
            </div>
          )}
        </div>
      </main>

      <PortalFooter />
    </div>
  );
};

export default PublicReportVerify;
