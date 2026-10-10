import React, { FormEvent, ChangeEvent } from "react";
import { Plus, RefreshCw, Send, ClipboardList } from "lucide-react";
import { Field } from "../ui/FormElements";
import { inputClass } from "../../utils/designTokens";
import { todayLocalISO } from "../../utils/date";

const MODALITIES = ["MRI", "CT", "X-Ray", "Ultrasound", "Mammography", "Fluoroscopy", "PET/CT"];

export interface DoctorOrderFormState {
  patientMrn: string;
  modalityType: string;
  preferredDate: string;
  preferredTimeWindow: string;
  clinicalNotes: string;
  contactPhone: string;
}

export interface OrderViewProps {
  form: DoctorOrderFormState;
  setForm: React.Dispatch<React.SetStateAction<DoctorOrderFormState>>;
  onSubmit: (e: FormEvent) => void;
  loading?: boolean;
  t: any;
}

export const OrderView = ({ form, setForm, onSubmit, loading = false, t }: OrderViewProps) => {
  const emptyOrder: DoctorOrderFormState = {
    patientMrn: "",
    modalityType: "",
    preferredDate: "",
    preferredTimeWindow: "",
    clinicalNotes: "",
    contactPhone: "",
  };

  const update =
    (field: keyof DoctorOrderFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((current) => ({
        ...current,
        [field]: field === "patientMrn" ? event.target.value.toUpperCase() : event.target.value,
      }));

  const timeWindows: [string, string][] = [
    ["Morning (8am-12pm)", "morning"],
    ["Afternoon (12pm-4pm)", "afternoon"],
    ["Evening (4pm-7pm)", "evening"],
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plus size={19} />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-foreground">
              {t("doctor.order.title", "Create Order")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("doctor.order.description", "Submit study request")}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <Field label={t("doctor.order.patientMrn", "Patient MRN")} required>
            <input
              value={form.patientMrn}
              onChange={update("patientMrn")}
              placeholder={t("doctor.order.mrnPlaceholder", "MRN-1002")}
              className={inputClass}
              required
            />
            <span className="mt-1.5 block text-xs font-semibold text-muted-foreground">
              {t("doctor.order.mrnHint", "Medical record number")}
            </span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("doctor.order.modality", "Modality")}>
              <select
                value={form.modalityType}
                onChange={update("modalityType")}
                className={inputClass}
              >
                <option value="">{t("doctor.order.selectModality", "Select modality")}</option>
                {MODALITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("doctor.order.date", "Preferred Date")}>
              <input
                type="date"
                value={form.preferredDate}
                onChange={update("preferredDate")}
                min={todayLocalISO()}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("doctor.order.time", "Time Window")}>
              <select
                value={form.preferredTimeWindow}
                onChange={update("preferredTimeWindow")}
                className={inputClass}
              >
                <option value="">{t("doctor.order.anyTime", "Any time")}</option>
                {timeWindows.map(([value, key]) => (
                  <option key={key} value={value}>
                    {t(`doctor.order.${key}`, value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("doctor.order.contactPhone", "Contact Phone")}>
              <input
                value={form.contactPhone}
                onChange={update("contactPhone")}
                placeholder={t("doctor.order.contactPhonePlaceholder", "Optional phone")}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label={t("doctor.order.notes", "Clinical Indication & Notes")} required>
            <textarea
              value={form.clinicalNotes}
              onChange={update("clinicalNotes")}
              placeholder={t(
                "doctor.order.notesPlaceholder",
                "Enter clinical findings and indication...",
              )}
              rows={4}
              className={`${inputClass} h-auto py-3`}
              required
            />
          </Field>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row">
            <button
              type="button"
              onClick={() => setForm(emptyOrder)}
              className="h-11 flex-1 rounded-lg border border-border bg-surface text-sm font-bold text-foreground transition hover:bg-background"
            >
              {t("doctor.order.clear", "Clear")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex h-11 flex-[2] cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>
                {loading
                  ? t("doctor.order.submitting", "Submitting...")
                  : t("doctor.order.submit", "Submit Order")}
              </span>
            </button>
          </div>
        </form>
      </div>

      <aside className="rounded-xl border border-primary-900 bg-primary-900 p-5 text-white shadow-sm">
        <ClipboardList className="text-primary-200" size={26} />
        <h3 className="mt-4 text-base font-extrabold">
          {t("doctor.orderChecklistTitle", "Order Checklist")}
        </h3>
        <ul className="mt-4 space-y-3 text-xs leading-relaxed text-slate-300">
          <li>• {t("doctor.orderChecklistMrn", "Confirm patient MRN is registered.")}</li>
          <li>• {t("doctor.orderChecklistClinical", "Include symptoms and clinical urgency.")}</li>
          <li>
            •{" "}
            {t(
              "doctor.orderChecklistScheduling",
              "Preferred timing speeds up reception scheduling.",
            )}
          </li>
        </ul>
      </aside>
    </section>
  );
};

export default OrderView;
