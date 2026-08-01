import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { CalendarCheck, CheckCircle2, Loader2, Phone, UserRound } from 'lucide-react';

interface AppointmentService {
  name: string;
}

export interface AppointmentFields {
  name: string;
  phone: string;
  service: string;
  date: string;
}

interface AppointmentFormProps {
  services?: AppointmentService[];
  onSubmit: (values: AppointmentFields) => void | Promise<void>;
  isSubmitting?: boolean;
  submitted?: boolean;
  onReset?: () => void;
  text?: Record<string, any>;
  showIntro?: boolean;
  compact?: boolean;
  initialService?: string;
}

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
};

export const AppointmentForm = ({ services = [], onSubmit, isSubmitting = false, submitted = false, onReset, text, showIntro = true, compact = false, initialService }: AppointmentFormProps) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<AppointmentFields>({
    defaultValues: { name: '', phone: '', service: initialService || services[0]?.name || '', date: '' },
  });

  useEffect(() => {
    const service = initialService || services[0]?.name;
    if (service) {
      reset((values) => ({ ...values, service }));
    }
  }, [initialService, services, reset]);

  if (submitted) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center px-4 py-10 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-300">
          <CheckCircle2 className="h-10 w-10" />
        </span>
        <p className="font-display mt-6 text-2xl font-bold text-slate-900 dark:text-white">{text?.received || 'Request received'}</p>
        <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-300">{text?.followUp ? text.followUp('') : 'Our team will contact you shortly.'}</p>
        <button type="button" onClick={onReset} className="mt-8 min-h-12 rounded-xl border border-primary-600/30 bg-primary-600/10 px-6 text-sm font-bold text-primary-800 transition hover:bg-primary-600/20 dark:text-primary-300">
          {text?.bookAnother || 'Book another appointment'}
        </button>
      </div>
    );
  }

  const fieldClass = `${compact ? 'mt-1.5 min-h-11 rounded-lg px-3' : 'mt-2 min-h-12 rounded-xl px-4'} w-full border border-border bg-surface text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-primary-300 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/10`;
  const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-200 text-start';
  const errorClass = 'mt-1.5 block text-xs font-semibold text-rose-500 dark:text-rose-400 text-start';

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label={text?.aria || 'Appointment request form'} className="text-start">
      {showIntro && <div className="mb-6">
        <p className="text-[10.5px] font-bold uppercase tracking-[.16em] text-primary-700 dark:text-primary-300">{text?.eyebrow || 'Appointment request'}</p>
        <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{text?.desc || 'Share your preferred visit details and the center will confirm availability.'}</p>
      </div>}

      <div className={`grid ${compact ? 'gap-3.5 sm:grid-cols-2' : 'gap-5'}`}>
        <label className={labelClass}>
          <span className="flex items-center gap-2 text-foreground"><UserRound className="h-4 w-4 text-primary-600 dark:text-primary-300" />{text?.name || 'Full name'}</span>
          <input
            {...register('name', {
              required: text?.errors?.name || 'Full name is required.',
              minLength: { value: 3, message: text?.errors?.name || 'Full name is required.' },
            })}
            autoComplete="name"
            placeholder={text?.namePlaceholder || 'Jane Doe'}
            className={fieldClass}
          />
          {errors.name && <span className={errorClass}>{errors.name.message}</span>}
        </label>

        <label className={labelClass}>
          <span className="flex items-center gap-2 text-foreground"><Phone className="h-4 w-4 text-primary-600 dark:text-primary-300" />{text?.phone || 'Phone number'}</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            {...register('phone', {
              required: text?.errors?.phone || 'Valid phone number required.',
              pattern: { value: /^[\d\s+()-]{8,}$/, message: text?.errors?.phone || 'Valid phone number required.' },
            })}
            placeholder={text?.phonePlaceholder || '010 0000 0000'}
            className={fieldClass}
            dir="ltr"
          />
          {errors.phone && <span className={errorClass}>{errors.phone.message}</span>}
        </label>

        <div className={`grid ${compact ? 'contents' : 'gap-5 sm:grid-cols-2'}`}>
          <label className={labelClass}>
            {text?.service || 'Service'}
            <select {...register('service', { required: true })} className={fieldClass}>
              {services.map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            {text?.date || 'Preferred date'}
            <input
              type="date"
              min={today()}
              {...register('date', {
                required: text?.errors?.date || 'Choose a preferred date.',
                validate: (value) => value >= today() || text?.errors?.date || 'Choose a date from today onward.',
              })}
              className={fieldClass}
            />
            {errors.date && <span className={errorClass}>{errors.date.message}</span>}
          </label>
        </div>

        <button type="submit" disabled={isSubmitting} className={`group inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary-600 to-primary-900 px-6 text-sm font-bold text-white shadow-lg shadow-primary-900/20 transition hover:-translate-y-0.5 hover:from-primary-500 hover:to-primary-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary-600/20 disabled:pointer-events-none disabled:opacity-65 ${compact ? 'min-h-11 rounded-lg sm:col-span-2' : 'mt-2 min-h-14 rounded-2xl'}`}>
          {isSubmitting ? (
            <><Loader2 className="h-4.5 w-4.5 animate-spin" />{text?.submitting || 'Sending request…'}</>
          ) : (
            <><CalendarCheck className="h-4.5 w-4.5" />{text?.submit || 'Request appointment'}</>
          )}
        </button>
      </div>
    </form>
  );
};
