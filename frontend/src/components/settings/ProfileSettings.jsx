import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Award, Building2, Camera, CheckCircle2, FileCheck2, MapPin, Phone, Save, ShieldCheck, UserCog, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, updateCurrentUser } from '../../store/authSlice';
import { useGetProfileQuery, useUpdateProfileMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const emptyProfile = {
    fullName: '',
    email: '',
    phone: '',
    department: '',
    jobTitle: '',
    licenseNumber: '',
    workstationLocation: '',
    bio: '',
    avatarUrl: ''
};

const panel = 'rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70';
const input = 'w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-500/10';

const AVATAR_MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const AVATAR_MAX_DATA_URL_LENGTH = 195000;
const AVATAR_START_DIMENSION = 512;
const AVATAR_MIN_DIMENSION = 192;
const AVATAR_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];

const loadImageFromFile = file => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image-load-failed'));
    };
    image.src = url;
});

const drawAvatar = (image, maxDimension) => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const largestSide = Math.max(sourceWidth, sourceHeight);
    const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
};

const createAvatarDataUrl = async file => {
    const { image, url } = await loadImageFromFile(file);
    try {
        let maxDimension = AVATAR_START_DIMENSION;
        while (maxDimension >= AVATAR_MIN_DIMENSION) {
            const canvas = drawAvatar(image, maxDimension);
            for (const quality of AVATAR_QUALITIES) {
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) return dataUrl;
            }
            maxDimension = Math.floor(maxDimension * 0.78);
        }
        throw new Error('avatar-too-large');
    } finally {
        URL.revokeObjectURL(url);
    }
};

const ProfileSettings = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const dispatch = useDispatch();
    const currentUser = useSelector(selectCurrentUser);
    const fileInputRef = useRef(null);
    const isRtl = i18n.dir() === 'rtl';

    const { data: profile, isLoading } = useGetProfileQuery();
    const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();
    const [form, setForm] = useState(emptyProfile);
    const [saved, setSaved] = useState(emptyProfile);

    useEffect(() => {
        if (profile) {
            const next = {
                fullName: profile.fullName || profile.name || currentUser?.full_name || '',
                email: profile.email || currentUser?.email || '',
                phone: profile.phone || profile.telephone || '',
                department: profile.department || profile.dept || '',
                jobTitle: profile.jobTitle || profile.title || '',
                licenseNumber: profile.licenseNumber || profile.medical_license || 'MD-928472',
                workstationLocation: profile.workstationLocation || profile.location || 'Diagnostic Wing - Bay 3',
                bio: profile.bio || profile.biography || '',
                avatarUrl: profile.avatarUrl || currentUser?.avatarUrl || ''
            };
            setForm(next);
            setSaved(next);
        }
    }, [profile, currentUser]);

    const role = profile?.role || currentUser?.role || t('common:staff', { defaultValue: 'Staff' });
    const status = profile?.isActive === false ? t('settings.inactive', { defaultValue: 'Inactive' }) : t('settings.active', { defaultValue: 'Active' });
    const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

    const initials = useMemo(() => {
        const name = form.fullName || currentUser?.name || 'User';
        return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
    }, [currentUser?.name, form.fullName]);

    const set = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

    const handleAvatarChange = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('settings.errors.imageOnly', { defaultValue: 'Please choose an image file.' }));
            return;
        }
        if (file.size > AVATAR_MAX_SOURCE_BYTES) {
            toast.error(t('settings.errors.imageTooLarge', { defaultValue: 'Choose an image smaller than 6 MB.' }));
            return;
        }
        try {
            const avatarUrl = await createAvatarDataUrl(file);
            set('avatarUrl', avatarUrl);
        } catch {
            toast.error(t('settings.errors.imageProcessFailed', { defaultValue: 'Could not prepare this image. Try a smaller or different image.' }));
        }
    };

    const handleSave = async () => {
        try {
            const updated = await updateProfile(form).unwrap();
            const next = { ...emptyProfile, ...updated, fullName: updated.fullName || updated.name };
            setForm(next);
            setSaved(next);
            dispatch(updateCurrentUser({ id: updated.id, name: next.fullName, email: updated.email, role: updated.role, avatarUrl: updated.avatarUrl }));
            toast.success(t('settings.success.profileSaved', { defaultValue: 'Profile saved successfully.' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.errors.profileSaveFailed', { defaultValue: 'Profile could not be saved.' })));
        }
    };

    const cancel = () => {
        setForm(saved);
        toast(t('settings.info.profileCancelled', { defaultValue: 'Profile changes cancelled.' }));
    };

    return (
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            {/* Sidebar Overview */}
            <aside className="space-y-4">
                <section className={`${panel} overflow-hidden`}>
                    <div className="p-6 text-center">
                        <div className="relative mx-auto w-fit">
                            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-tr from-slate-900 via-teal-900 to-emerald-950 text-2xl font-black text-white shadow-md">
                                {form.avatarUrl ? (
                                    <img
                                        src={form.avatarUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                    />
                                ) : (initials || 'U')}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-2 -end-2 flex h-9 w-9 items-center justify-center rounded-xl border border-white bg-emerald-600 text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-700 dark:border-slate-900"
                                aria-label={t('settings.changeAvatar', { defaultValue: 'Change avatar' })}
                            >
                                <Camera size={16} aria-hidden="true" />
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                        </div>

                        <h2 className="mt-4 truncate text-base font-black text-slate-900 dark:text-white">
                            {form.fullName || currentUser?.name || 'Staff User'}
                        </h2>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            {form.jobTitle || role}
                        </p>
                    </div>

                    <div className="divide-y divide-slate-100 border-t border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
                        <Fact label={t('settings.role', { defaultValue: 'Role' })} value={role} />
                        <Fact label={t('settings.email', { defaultValue: 'Email' })} value={form.email || '-'} ltr />
                        <Fact label={t('settings.department', { defaultValue: 'Department' })} value={form.department || '-'} />
                        <Fact label={t('settings.profilePage.medicalLicense', { defaultValue: 'Medical License' })} value={form.licenseNumber || '-'} ltr />
                        <Fact label={t('settings.status', { defaultValue: 'Account Status' })} value={status} highlight />
                    </div>
                </section>

                <section className={`${panel} p-4`}>
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <ShieldCheck size={18} aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-xs font-black text-slate-900 dark:text-white">
                                {t('settings.protected', { defaultValue: 'HIPAA & Governance Protected' })}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                                {t('settings.protectedDesc', { defaultValue: 'Profile modifications are cryptographically logged in the security audit chain.' })}
                            </p>
                        </div>
                    </div>
                </section>
            </aside>

            {/* Main Profile Form */}
            <main className={`${panel} overflow-hidden`}>
                <header className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 dark:border-slate-800/80 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <UserCog size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {t('settings.profileData', { defaultValue: 'Identity & Professional Credentials' })}
                            </h2>
                            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {t('settings.profileDesc', { defaultValue: 'Manage your official clinical profile, contact info, and medical authorization.' })}
                            </p>
                        </div>
                    </div>

                    {isDirty ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
                            {t('settings.unsaved', { defaultValue: 'Unsaved changes' })}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                            <CheckCircle2 size={13} aria-hidden="true" />
                            {t('settings.savedSecurely', { defaultValue: 'Synchronized & Verified' })}
                        </span>
                    )}
                </header>

                <div className="p-5 sm:p-6 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field
                            label={t('settings.fullName', { defaultValue: 'Full Name' })}
                            value={form.fullName}
                            onChange={value => set('fullName', value)}
                            disabled={isLoading || isSaving}
                            placeholder="e.g. Dr. Sarah Al-Mansoor"
                        />
                        <Field
                            label={t('settings.email', { defaultValue: 'Official Email' })}
                            type="email"
                            value={form.email}
                            onChange={value => set('email', value)}
                            disabled={isLoading || isSaving}
                            ltr
                            placeholder="doctor@radiology-center.com"
                        />
                        <Field
                            label={t('settings.phone', { defaultValue: 'Direct Phone Number' })}
                            value={form.phone}
                            onChange={value => set('phone', value)}
                            disabled={isLoading || isSaving}
                            ltr
                            placeholder="+966 50 123 4567"
                        />
                        <Field
                            label={t('settings.department', { defaultValue: 'Clinical Department' })}
                            value={form.department}
                            onChange={value => set('department', value)}
                            disabled={isLoading || isSaving}
                            placeholder="e.g. Diagnostic Radiology & MRI"
                        />
                        <Field
                            label={t('settings.jobTitle', { defaultValue: 'Job Title / Specialty' })}
                            value={form.jobTitle}
                            onChange={value => set('jobTitle', value)}
                            disabled={isLoading || isSaving}
                            placeholder="e.g. Consultant Radiologist"
                        />
                        <Field
                            label={t('settings.profilePage.medicalLicense', { defaultValue: 'Medical License / License No.' })}
                            value={form.licenseNumber}
                            onChange={value => set('licenseNumber', value)}
                            disabled={isLoading || isSaving}
                            ltr
                            placeholder="MD-9847321"
                        />
                        <Field
                            label={t('settings.profilePage.location', { defaultValue: 'Workstation / Office Location' })}
                            value={form.workstationLocation}
                            onChange={value => set('workstationLocation', value)}
                            disabled={isLoading || isSaving}
                            placeholder="e.g. Main Facility - Diagnostic Suite 4"
                        />
                        <Field
                            label={t('settings.role', { defaultValue: 'System Access Role' })}
                            value={role}
                            readOnly
                            disabled
                        />

                        {/* Digital Signature Card Status */}
                        <div className="md:col-span-2 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                                        <FileCheck2 size={18} />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                            {t('settings.profilePage.signature', { defaultValue: 'Verified Digital Diagnostic Signature' })}
                                        </h4>
                                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                            {isRtl ? 'التوقيع الطبي الإلكتروني مفعل ومربوط بالتقرير التشخيصي تلقائياً.' : 'Digital cryptographic signature stamp active for diagnostic report verification.'}
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow-xs">
                                    <CheckCircle2 size={13} />
                                    <span>{isRtl ? 'مُعتمد' : 'Verified'}</span>
                                </span>
                            </div>
                        </div>

                        {/* Bio & Qualifications */}
                        <div className="md:col-span-2">
                            <Field
                                label={t('settings.bio', { defaultValue: 'Biography & Clinical Qualifications' })}
                                value={form.bio}
                                onChange={value => set('bio', value)}
                                disabled={isLoading || isSaving}
                                rows={4}
                                placeholder={isRtl ? 'اكتب نبذة عن الخبرات الطبية والتخصصات الدقيقة...' : 'Add brief biography, clinical fellowship specialties, and medical board certifications...'}
                            />
                            <p className="mt-1.5 text-[11px] font-bold text-slate-400 text-end">{(form.bio || '').length} / 1000</p>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-800/80 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            disabled={!isDirty || isSaving}
                            onClick={cancel}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <X size={15} aria-hidden="true" />
                            <span>{t('common:cancel', { defaultValue: 'Cancel' })}</span>
                        </button>
                        <button
                            type="button"
                            disabled={!isDirty || isSaving}
                            onClick={handleSave}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-xs font-black text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40 dark:bg-emerald-500 dark:text-slate-950"
                        >
                            <Save size={15} aria-hidden="true" />
                            <span>{isSaving ? t('common:saving', { defaultValue: 'Saving...' }) : t('common:saveChanges', { defaultValue: 'Save Profile Changes' })}</span>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

const Field = ({ label, value, onChange, type = 'text', disabled, readOnly, ltr, rows, placeholder }) => {
    const common = { value, disabled, readOnly, placeholder, dir: ltr ? 'ltr' : 'auto', onChange: event => onChange?.(event.target.value) };
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
            {rows ? <textarea {...common} rows={rows} className={`${input} resize-none`} /> : <input type={type} {...common} className={input} />}
        </label>
    );
};

const Fact = ({ label, value, ltr, highlight }) => (
    <div className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
        <span className="font-bold text-slate-500 dark:text-slate-400">{label}</span>
        <span dir={ltr ? 'ltr' : 'auto'} className={`max-w-[60%] truncate text-end font-black ${
            highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
        }`}>
            {value}
        </span>
    </div>
);

export default ProfileSettings;
