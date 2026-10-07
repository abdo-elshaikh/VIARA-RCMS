import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/store";
import { api, useChangePasswordMutation, useGetPublicCenterSettingsQuery } from "../store/api";
import { logOut, selectCurrentUser } from "../store/authSlice";
import { useTranslation } from "react-i18next";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { getErrorMessage } from "../utils/getErrorMessage";
import { resolvePortalIdentity } from "../lib/portal-identity";
import { PortalAuthShell } from "../components/portal/layout/PortalAuthShell";

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordFieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  form?: string;
}

const hasLetterAndNumber = (value: string) => /(?=.*[A-Za-z])(?=.*\d)/.test(value);

const PortalPasswordChange = () => {
  const { t, i18n } = useTranslation("auth");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [changePassword] = useChangePasswordMutation();

  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const role = user?.role === "Doctor" ? "doctor" : "patient";
  const { data: publicSettings } = useGetPublicCenterSettingsQuery(undefined);
  const identity = resolvePortalIdentity({ settings: publicSettings || {}, language });
  const centerName = [identity.center.name, identity.branch.name].filter(Boolean).join(" · ");

  const [formData, setFormData] = useState<PasswordFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errors, setErrors] = useState<PasswordFieldErrors>({});
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.name as keyof PasswordFormState;
    setFormData((current) => ({ ...current, [name]: e.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  };

  const validate = (): boolean => {
    const next: PasswordFieldErrors = {};
    if (!formData.currentPassword) {
      next.currentPassword = t("currentPasswordRequired", "Enter your current password.");
    }
    if (!formData.newPassword) {
      next.newPassword = t("newPasswordRequired", "Enter a new password.");
    } else if (formData.newPassword.length < 8) {
      next.newPassword = t("passwordTooShort", "New password must be at least 8 characters.");
    } else if (!hasLetterAndNumber(formData.newPassword)) {
      next.newPassword = t(
        "passwordTooWeak",
        "Use at least 8 characters with letters and numbers.",
      );
    }
    if (formData.newPassword && formData.newPassword === formData.currentPassword) {
      next.newPassword = t(
        "passwordMatchesCurrent",
        "The new password must be different from the current password.",
      );
    }
    if (!formData.confirmPassword) {
      next.confirmPassword = t("confirmPasswordRequired", "Confirm the new password.");
    } else if (formData.confirmPassword !== formData.newPassword) {
      next.confirmPassword = t("passwordsDoNotMatch", "New passwords do not match");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setSuccess("");
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await changePassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      }).unwrap();
      setSuccess(t("passwordChanged", "Password changed. Redirecting you to sign in again."));
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const loginPath = user?.role === "Doctor" ? "/doctor/login" : "/patient/login";
      dispatch(api.util.resetApiState());
      dispatch(logOut());
      navigate(loginPath, { replace: true });
    } catch (err) {
      setErrors({
        form: getErrorMessage(err, t("changePasswordError", "Failed to change password")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-lg border border-[#DCE8E5] bg-[#F8FBFA] text-sm font-medium text-[#0B2348] outline-none transition placeholder:text-[#8A9AAD] hover:border-primary/35 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.06]";

  const renderPasswordField = ({
    id,
    name,
    label,
    value,
    onChange,
    show,
    toggleShow,
    autoComplete,
    error,
  }: {
    id: string;
    name: keyof PasswordFormState;
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    show: boolean;
    toggleShow: () => void;
    autoComplete: string;
    error?: string;
  }) => (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-[#0B2348] dark:text-white">
        {label}
      </label>
      <div className="relative mt-2">
        <LockKeyhole className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-primary" />
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          required
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass} ps-10 pe-12 text-left`}
          dir="ltr"
        />
        <button
          type="button"
          onClick={toggleShow}
          aria-label={
            show ? t("hidePassword", "Hide password") : t("showPassword", "Show password")
          }
          className="absolute inset-y-0 end-2 my-auto flex h-8 w-8 items-center justify-center rounded-md text-[#7A8CA0] transition hover:bg-[#EAF5F1] hover:text-primary dark:hover:bg-white/[0.07]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      )}
    </div>
  );

  return (
    <PortalAuthShell
      role={role}
      language={language}
      centerName={centerName}
      centerLogo={identity.center.logoUrl}
      centerInitials={identity.center.initials}
      title={t("changePasswordTitle", "Change Your Password")}
      subtitle={t("changePasswordDesc", "Please set a new password to continue.")}
      benefits={[]}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {errors.form && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}
        {success && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            {success}
          </div>
        )}

        {renderPasswordField({
          id: "current-password",
          name: "currentPassword",
          label: t("currentPassword", "Current Password"),
          value: formData.currentPassword,
          onChange: handleChange,
          show: showCurrent,
          toggleShow: () => setShowCurrent((value) => !value),
          autoComplete: "current-password",
          error: errors.currentPassword,
        })}

        {renderPasswordField({
          id: "new-password",
          name: "newPassword",
          label: t("newPassword", "New Password"),
          value: formData.newPassword,
          onChange: handleChange,
          show: showNew,
          toggleShow: () => setShowNew((value) => !value),
          autoComplete: "new-password",
          error: errors.newPassword,
        })}

        <div>
          <label
            htmlFor="confirm-new-password"
            className="block text-xs font-bold text-[#0B2348] dark:text-white"
          >
            {t("confirmNewPassword", "Confirm New Password")}
          </label>
          <input
            id="confirm-new-password"
            name="confirmPassword"
            type={showNew ? "text" : "password"}
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "confirm-new-password-error" : undefined}
            className={`${inputClass} px-3 text-left`}
            dir="ltr"
          />
          {errors.confirmPassword && (
            <p
              id="confirm-new-password-error"
              className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(8,120,95,0.2)] transition hover:-translate-y-0.5 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("changing", "Changing...")}
            </>
          ) : (
            t("changePassword", "Change Password")
          )}
        </button>
      </form>
    </PortalAuthShell>
  );
};

export default PortalPasswordChange;
