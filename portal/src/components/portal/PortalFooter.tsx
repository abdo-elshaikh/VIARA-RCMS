import { Link } from "react-router-dom";
import { Activity, Clock, Mail, MapPin, Phone, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useCenterSettings } from "@/hooks/use-center-settings";

export function PortalFooter() {
  const year = new Date().getFullYear();
  const { t } = useLang();
  const { centerName, phone, email, address, hours, logoUrl } = useCenterSettings();

  return (
    <footer className="relative overflow-hidden border-t border-border bg-surface-alt/50 pt-16 transition-colors">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-primary/20 to-transparent opacity-30 blur-[100px] dark:opacity-20" />

      <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-12 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4 lg:pr-8">
          <Link to="/" className="inline-flex items-center gap-3 transition-transform hover:scale-[1.02]">
            {logoUrl ? (
              <img src={logoUrl} alt={centerName} className="h-10 w-10 rounded-xl border border-primary/20 bg-surface shadow-sm" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-md shadow-primary/20">
                <Activity className="h-5 w-5" strokeWidth={2.5} />
              </span>
            )}
            <span className="text-xl font-bold tracking-tight text-foreground">{centerName}</span>
          </Link>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {t(
              "footer.tagline",
              "Diagnostic imaging access for patients, referring doctors, and center teams.",
            )}
          </p>
          <div className="mt-8 flex flex-col gap-4 text-sm font-medium">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="group flex items-center gap-3 text-muted-foreground transition-colors hover:text-primary"
              >
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Phone className="h-4 w-4" />
                </div>
                {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="group flex items-center gap-3 text-muted-foreground transition-colors hover:text-primary"
              >
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Mail className="h-4 w-4" />
                </div>
                {email}
              </a>
            )}
            {address && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <span>{address}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 lg:col-start-6">
          <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {t("footer.services", "Imaging Services")}
          </h4>
          <ul className="mt-6 flex flex-col gap-3.5 text-sm font-medium text-muted-foreground">
            {["svc.mri", "svc.ct", "svc.xray", "svc.us", "svc.lab", "svc.cardiac"].map((key) => {
              const labels: Record<string, string> = {
                "svc.mri": "MRI Imaging",
                "svc.ct": "CT Scanning",
                "svc.xray": "Digital X-Ray",
                "svc.us": "Ultrasound",
                "svc.lab": "Lab Diagnostics",
                "svc.cardiac": "Cardiac Workup",
              };
              return (
                <li key={key} className="flex items-center gap-2.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                  <span>{t(key, labels[key])}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {t("footer.access", "Portals & Access")}
          </h4>
          <ul className="mt-6 flex flex-col gap-3.5 text-sm font-medium text-muted-foreground">
            {[
              { to: "/patient/login", key: "footer.patient", label: "Patient Portal" },
              { to: "/doctor/login", key: "footer.doctor", label: "Referring Doctors" },
              { to: "/patient/login", key: "footer.patientSignIn", label: "Patient Sign In" },
              { to: "/doctor/login", key: "footer.doctorSignIn", label: "Doctor Sign In" },
            ].map((link) => (
              <li key={link.key}>
                <Link to={link.to} className="group flex items-center gap-2 transition-colors hover:text-primary">
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  <span className="-translate-x-3 transition-transform group-hover:translate-x-0">{t(link.key, link.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative border-t border-border/60 bg-surface/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p className="flex items-center gap-1 font-medium">
            © {year} <span className="font-semibold text-foreground">{centerName}</span>. {t("footer.rights", "All rights reserved.")}
          </p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              {t("footer.secure", "Secure diagnostic portal")}
            </span>
            {hours && (
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-sm sm:flex">
                <Clock className="h-3 w-3" />
                {hours}
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
