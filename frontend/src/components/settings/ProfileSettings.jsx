import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, CheckCircle2, Save, ShieldCheck, UserCog, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, updateCurrentUser } from '../../store/authSlice';
import { useGetProfileQuery, useUpdateProfileMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const emptyProfile = { fullName: '', email: '', phone: '', department: '', jobTitle: '', bio: '', avatarUrl: '' };
const panel = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50';
const input = 'w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:focus:border-cyan-500 dark:focus:ring-cyan-500/10';

const ProfileSettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const dispatch = useDispatch();
    const currentUser = useSelector(selectCurrentUser);
    const fileInputRef = useRef(null);
    const { data: profile, isLoading } = useGetProfileQuery();
    const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();
    const [form, setForm] = useState(emptyProfile);
    const [saved, setSaved] = useState(emptyProfile);

    useEffect(() => {
        if (profile) {
            const next = {
                fullName: profile.fullName || profile.name || '',
                email: profile.email || '',
                phone: profile.phone || '',
                department: profile.department || '',
                jobTitle: profile.jobTitle || '',
                bio: profile.bio || '',
                avatarUrl: profile.avatarUrl || ''
            };
            setForm(next);
            setSaved(next);
        }
    }, [profile]);

    const role = profile?.role || currentUser?.role || 'Staff';
    const status = profile?.isActive === false ? t('settings.inactive', 'Inactive') : t('settings.active', 'Active');
    const isDirty = JSON.stringify(form) !== JSON.stringify(saved);
    const initials = useMemo(() => {
        const name = form.fullName || currentUser?.name || 'User';
        return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
    }, [currentUser?.name, form.fullName]);
    const set = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

    const handleAvatarChange = event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('settings.errors.imageOnly', 'Please choose an image file.'));
            return;
        }
        if (file.size > 180000) {
            toast.error(t('settings.errors.imageTooLarge', 'Choose an image smaller than 180 KB.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => set('avatarUrl', reader.result);
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        try {
            const updated = await updateProfile(form).unwrap();
            const next = { ...emptyProfile, ...updated, fullName: updated.fullName || updated.name };
            setForm(next);
            setSaved(next);
            dispatch(updateCurrentUser({ id: updated.id, name: next.fullName, email: updated.email, role: updated.role, avatarUrl: updated.avatarUrl }));
            toast.success(t('settings.success.profileSaved', 'Profile saved.'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.errors.profileSaveFailed', 'Profile could not be saved.')));
        }
    };

    const cancel = () => {
        setForm(saved);
        toast(t('settings.info.profileCancelled', 'Profile changes cancelled.'));
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="space-y-4">
                <section className={`${panel} overflow-hidden`}>
                    <div className="p-5 text-center">
                        <div className="relative mx-auto w-fit">
                            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-2xl font-black text-white dark:bg-slate-100 dark:text-slate-950">
                                {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" /> : (initials || 'U')}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-2 -end-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white bg-teal-700 text-white transition-colors hover:bg-teal-800 dark:border-slate-900"
                                aria-label={t('settings.changeAvatar', 'Change avatar')}
                            >
                                <Camera size={15} aria-hidden="true" />
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                        </div>
                        <h2 className="mt-4 truncate text-base font-black text-slate-950 dark:text-white">{form.fullName || currentUser?.name || 'User'}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{form.jobTitle || role}</p>
                    </div>
                    <div className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                        <Fact label={t('settings.role', 'Role')} value={role} />
                        <Fact label={t('settings.email', 'Email')} value={form.email || '-'} />
                        <Fact label={t('settings.department', 'Department')} value={form.department || '-'} />
                        <Fact label={t('settings.status', 'Account')} value={status} />
                    </div>
                </section>

                <section className={`${panel} p-4`}>
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                            <ShieldCheck size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-sm font-black text-slate-950 dark:text-white">{t('settings.protected', 'Protected profile')}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.protectedDesc', 'Changes are saved to your authenticated account.')}</p>
                        </div>
                    </div>
                </section>
            </aside>

            <main className={`${panel} overflow-hidden`}>
                <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <UserCog size={17} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.profileData', 'Profile data')}</h2>
                            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.profileDesc', 'Edit your public staff profile and contact information.')}</p>
                        </div>
                    </div>
                    {isDirty ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60">
                            {t('settings.unsaved', 'Unsaved changes')}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60">
                            <CheckCircle2 size={13} aria-hidden="true" />
                            {t('settings.savedSecurely', 'Securely synchronized')}
                        </span>
                    )}
                </header>

                <div className="p-4 sm:p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('settings.fullName', 'Full name')} value={form.fullName} onChange={value => set('fullName', value)} disabled={isLoading || isSaving} />
                        <Field label={t('settings.email', 'Email')} type="email" value={form.email} onChange={value => set('email', value)} disabled={isLoading || isSaving} ltr />
                        <Field label={t('settings.phone', 'Phone')} value={form.phone} onChange={value => set('phone', value)} disabled={isLoading || isSaving} ltr />
                        <Field label={t('settings.department', 'Department')} value={form.department} onChange={value => set('department', value)} disabled={isLoading || isSaving} />
                        <Field label={t('settings.jobTitle', 'Job title')} value={form.jobTitle} onChange={value => set('jobTitle', value)} disabled={isLoading || isSaving} />
                        <Field label={t('settings.role', 'Role')} value={role} readOnly disabled />
                        <div className="md:col-span-2">
                            <Field label={t('settings.bio', 'Bio')} value={form.bio} onChange={value => set('bio', value)} disabled={isLoading || isSaving} rows={4} />
                            <p className="mt-1.5 text-xs text-slate-400">{(form.bio || '').length} / 1000</p>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button type="button" disabled={!isDirty || isSaving} onClick={cancel} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">
                            <X size={15} aria-hidden="true" />
                            {t('common:cancel', 'Cancel')}
                        </button>
                        <button type="button" disabled={!isDirty || isSaving} onClick={handleSave} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500">
                            <Save size={15} aria-hidden="true" />
                            {isSaving ? t('common:saving', 'Saving...') : t('common:saveChanges', 'Save changes')}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

const Field = ({ label, value, onChange, type = 'text', disabled, readOnly, ltr, rows }) => {
    const common = { value, disabled, readOnly, dir: ltr ? 'ltr' : 'auto', onChange: event => onChange?.(event.target.value) };
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
            {rows ? <textarea {...common} rows={rows} className={`${input} resize-none`} /> : <input type={type} {...common} className={input} />}
        </label>
    );
};

const Fact = ({ label, value }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="max-w-[60%] truncate text-end text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
    </div>
);

export default ProfileSettings;
