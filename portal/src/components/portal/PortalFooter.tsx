import { Link } from "react-router-dom";
import { Activity, Clock, Mail, MapPin, Phone } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useCenterSettings } from "@/hooks/use-center-settings";

export function PortalFooter() {
  const year = new Date().getFullYear();
  const { t } = useLang();
  const { centerName, phone, email, address, hours } = useCenterSettings();

  return (
    <footer className="border-t border-border bg-surface-alt">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
              <Activity className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-normal">{centerName}</span>
          </div>
          <p className="mt-4 max-w-md rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-muted-foreground shadow-soft">
            {t(
              "footer.tagline",
              "Diagnostic imaging access for patients, referring doctors, and center teams.",
            )}
          </p>
          <div className="mt-6 flex flex-col gap-3 text-sm font-medium text-[#475467]">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex items-center gap-2 transition hover:text-foreground"
              >
                <Phone className="h-4 w-4 text-primary" />
                {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-2 transition hover:text-foreground"
              >
                <Mail className="h-4 w-4 text-primary" />
                {email}
              </a>
            )}
            {address && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {address}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {hours || t("form.hoursValue", "Working hours available through the center")}
            </span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {t("footer.services", "Imaging Services")}
          </h4>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-muted-foreground">
            <li>{t("svc.mri", "MRI Imaging")}</li>
            <li>{t("svc.ct", "CT Scanning")}</li>
            <li>{t("svc.xray", "Digital X-Ray")}</li>
            <li>{t("svc.us", "Ultrasound")}</li>
            <li>{t("svc.lab", "Lab Diagnostics")}</li>
            <li>{t("svc.cardiac", "Cardiac Workup")}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {t("footer.access", "Portals & Access")}
          </h4>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-muted-foreground">
            <li>
              <Link to="/patient/login" className="transition hover:text-foreground">
                {t("footer.patient", "Patient Portal")}
              </Link>
            </li>
            <li>
              <Link to="/doctor/login" className="transition hover:text-foreground">
                {t("footer.doctor", "Referring Doctors")}
              </Link>
            </li>
            <li>
              <Link to="/patient/login" className="transition hover:text-foreground">
                {t("footer.patientSignIn", "Patient Sign In")}
              </Link>
            </li>
            <li>
              <Link to="/doctor/login" className="transition hover:text-foreground">
                {t("footer.doctorSignIn", "Doctor Sign In")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            © {year} {centerName}. {t("footer.rights", "All rights reserved.")}
          </p>
          <p className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {t("footer.secure", "Secure diagnostic portal")}
          </p>
        </div>
      </div>
    </footer>
  );
}
