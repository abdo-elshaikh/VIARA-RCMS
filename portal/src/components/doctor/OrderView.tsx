import React from 'react';
import { Plus, RefreshCw, Send, ClipboardList } from 'lucide-react';
import { Field } from '../ui/FormElements';
import { inputClass } from '../../utils/designTokens';

const MODALITIES = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Fluoroscopy', 'PET/CT'];

const OrderView = ({ form, setForm, onSubmit, loading, t }) => {
    const emptyOrder = {
        patientMrn: '',
        modalityType: '',
        preferredDate: '',
        preferredTimeWindow: '',
        clinicalNotes: '',
        contactPhone: ''
    };
    
    const update = (field) => (event) => setForm(current => ({ ...current, [field]: field === 'patientMrn' ? event.target.value.toUpperCase() : event.target.value }));
    const timeWindows = [
        ['Morning (8am-12pm)', 'morning'],
        ['Afternoon (12pm-4pm)', 'afternoon'],
        ['Evening (4pm-7pm)', 'evening']
    ];
    
    return (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b1426] sm:p-7">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"><Plus size={19} /></span>
                    <div>
                        <h2 className="font-display font-semibold text-slate-950 dark:text-white">{t('doctor.order.title')}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('doctor.order.description')}</p>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="mt-7 space-y-5">
                    <Field label={t('doctor.order.patientMrn')} required>
                        <input value={form.patientMrn} onChange={update('patientMrn')} placeholder={t('doctor.order.mrnPlaceholder')} className={inputClass} required />
                        <span className="mt-1.5 block text-xs font-semibold text-slate-400">{t('doctor.order.mrnHint')}</span>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('doctor.order.modality')}>
                            <select value={form.modalityType} onChange={update('modalityType')} className={inputClass}>
                                <option value="">{t('doctor.order.selectModality')}</option>
                                {MODALITIES.map(item => <option key={item}>{item}</option>)}
                            </select>
                        </Field>
                        <Field label={t('doctor.order.date')}>
                            <input type="date" value={form.preferredDate} onChange={update('preferredDate')} min={new Date().toISOString().split('T')[0]} className={inputClass} />
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('doctor.order.time')}>
                            <select value={form.preferredTimeWindow} onChange={update('preferredTimeWindow')} className={inputClass}>
                                <option value="">{t('doctor.order.anyTime')}</option>
                                {timeWindows.map(([value, key]) => <option key={key} value={value}>{t(`doctor.order.${key}`)}</option>)}
                            </select>
                        </Field>
                        <Field label={t('doctor.order.contactPhone', { defaultValue: 'Contact phone' })}>
                            <input value={form.contactPhone} onChange={update('contactPhone')} placeholder={t('doctor.order.contactPhonePlaceholder', { defaultValue: 'Optional phone for scheduling' })} className={inputClass} />
                        </Field>
                    </div>
                    <Field label={t('doctor.order.notes')} required>
                        <textarea value={form.clinicalNotes} onChange={update('clinicalNotes')} placeholder={t('doctor.order.notesPlaceholder')} rows={5} className={`${inputClass} h-auto py-3`} />
                    </Field>
                    <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row">
                        <button type="button" onClick={() => setForm(emptyOrder)} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900/50">{t('doctor.order.clear')}</button>
                        <button type="submit" disabled={loading} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-900 text-sm font-black text-white shadow-md shadow-primary-900/20 transition hover:from-primary-500 hover:to-primary-800 disabled:opacity-60">
                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                            {loading ? t('doctor.order.submitting') : t('doctor.order.submit')}
                        </button>
                    </div>
                </form>
            </div>

            <aside className="rounded-2xl border border-slate-200/50 bg-slate-950 p-5 text-white shadow-sm dark:border-white/10">
                <ClipboardList className="text-primary-300" size={26} />
                <h3 className="font-display mt-4 text-lg font-semibold">{t('doctor.orderChecklistTitle', { defaultValue: 'Order checklist' })}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                    <li>{t('doctor.orderChecklistMrn', { defaultValue: 'Confirm the patient MRN is already registered at the center.' })}</li>
                    <li>{t('doctor.orderChecklistClinical', { defaultValue: 'Include clinical indication, symptoms, and urgency.' })}</li>
                    <li>{t('doctor.orderChecklistScheduling', { defaultValue: 'Preferred date and time window help reception schedule faster.' })}</li>
                </ul>
            </aside>
        </section>
    );
};

export default OrderView;
