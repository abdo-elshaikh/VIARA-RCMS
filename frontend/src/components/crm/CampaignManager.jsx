import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarDays, CheckCircle2, Megaphone, PauseCircle, Play, Plus, Search, Send, Square, Tag, UserPlus, Users, X } from 'lucide-react';
import {
    useAddSegmentMemberMutation,
    useCreateCampaignMutation,
    useCreateSegmentMutation,
    useGetCampaignsQuery,
    useGetPatientsQuery,
    useGetSegmentsQuery,
    useUpdateCampaignStatusMutation,
} from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
import { useTranslation } from 'react-i18next';

const emptyCampaign = { name: '', messageSubject: '', messageBody: '', targetSegment: '', channel: 'SMS', budget: '', startDate: '', endDate: '' };
const emptySegment = { name: '', description: '' };
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-pink-600 focus:ring-4 focus:ring-pink-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const CampaignManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`marketing.campaigns.${key}`, options);
    const isArabic = i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const user = useSelector(selectCurrentUser);
    const effectivePermissions = getEffectivePermissions(user);
    const canManage = ['Developer', 'Admin'].includes(user?.role) || effectivePermissions.has('MANAGE_CRM');
    const { data: campaigns = [], isLoading, isError, refetch, isFetching } = useGetCampaignsQuery();
    const { data: segments = [], isLoading: segmentsLoading, refetch: refetchSegments } = useGetSegmentsQuery();
    const [createCampaign, { isLoading: isCreating }] = useCreateCampaignMutation();
    const [createSegment, { isLoading: isCreatingSegment }] = useCreateSegmentMutation();
    const [addSegmentMember, { isLoading: isAddingMember }] = useAddSegmentMemberMutation();
    const [updateStatus, { isLoading: isUpdatingStatus }] = useUpdateCampaignStatusMutation();

    const [showNew, setShowNew] = useState(false);
    const [showSegment, setShowSegment] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(emptyCampaign);
    const [segmentForm, setSegmentForm] = useState(emptySegment);

    // Segment member assignment state
    const [activeSegmentForAdd, setActiveSegmentForAdd] = useState(null);
    const [patientSearch, setPatientSearch] = useState('');
    const { data: patientsData } = useGetPatientsQuery(
        { limit: 20, q: patientSearch.trim() || undefined },
        { skip: !activeSegmentForAdd }
    );
    const patientOptions = Array.isArray(patientsData)
        ? patientsData
        : Array.isArray(patientsData?.data)
            ? patientsData.data
            : [];

    const summary = useMemo(() => ({
        total: campaigns.length,
        active: campaigns.filter(campaign => campaign.status === 'Active').length,
        sent: campaigns.reduce((total, campaign) => total + Number(campaign.sent_count || 0), 0),
        failed: campaigns.reduce((total, campaign) => total + Number(campaign.failed_count || 0), 0),
        budget: campaigns.reduce((total, campaign) => total + Number(campaign.budget || 0), 0),
    }), [campaigns]);

    const visibleCampaigns = useMemo(() => {
        const q = search.trim().toLowerCase();
        return campaigns.filter(campaign => {
            if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
            return !q || [campaign.name, campaign.message_subject, campaign.message_body, campaign.channel, campaign.status, campaign.segment_name, campaign.creator_name].filter(Boolean).join(' ').toLowerCase().includes(q);
        });
    }, [campaigns, search, statusFilter]);

    const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const updateSegment = (field, value) => setSegmentForm(current => ({ ...current, [field]: value }));
    const closeCampaignForm = () => { setShowNew(false); setForm(emptyCampaign); };
    const closeSegmentForm = () => { setShowSegment(false); setSegmentForm(emptySegment); };

    const handleCreate = async event => {
        event.preventDefault();
        if (!canManage) return;
        if (form.endDate && form.startDate && form.endDate < form.startDate) {
            toast.error(copy('dateError'));
            return;
        }
        if (form.messageBody.trim().length < 10) {
            toast.error(copy('messageRequired'));
            return;
        }
        try {
            await createCampaign({
                ...form,
                messageSubject: form.messageSubject.trim() || undefined,
                messageBody: form.messageBody.trim(),
                targetSegment: form.targetSegment || undefined,
                budget: form.budget ? Number(form.budget) : undefined,
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
            }).unwrap();
            toast.success(copy('createSuccess'));
            closeCampaignForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const handleSegmentCreate = async event => {
        event.preventDefault();
        if (!canManage) return;
        try {
            await createSegment({ name: segmentForm.name.trim(), description: segmentForm.description.trim() || undefined }).unwrap();
            toast.success(copy('segmentSuccess'));
            closeSegmentForm();
            refetchSegments();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('segmentError')));
        }
    };

    const handleAddMember = async (segmentId, patientId) => {
        try {
            await addSegmentMember({ segmentId, patientId }).unwrap();
            toast.success(isArabic ? 'تمت إضافة المريض للشريحة بنجاح' : 'Patient added to segment successfully');
            setActiveSegmentForAdd(null);
            setPatientSearch('');
            refetchSegments();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر إضافة المريض للشريحة' : 'Failed to add patient to segment'));
        }
    };

    const handleStatusUpdate = async (id, status) => {
        if (!canManage) return;
        try {
            const updated = await updateStatus({ id, status }).unwrap();
            if (status === 'Active' && typeof updated.scheduled_count === 'number') {
                toast.success(copy('activateSuccess', { count: updated.scheduled_count, audience: updated.audience_count || updated.scheduled_count }));
            } else {
                toast.success(copy('statusSuccess', { status: copy(`statuses.${status}`) }));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, copy('statusError')));
        }
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : copy('notSet');
    const formatMoney = value => {
        const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(value || 0));
        return formatted.replace(/\s+/g, '\u00A0');
    };

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label={copy('summaryLabel')}>
                <Metric icon={Megaphone} label={copy('total')} value={summary.total} tone="pink" />
                <Metric icon={Play} label={copy('active')} value={summary.active} tone="emerald" />
                <Metric icon={Send} label={copy('sent')} value={summary.sent} tone="blue" />
                <Metric icon={AlertTriangle} label={copy('failed')} value={summary.failed} tone="rose" />
                <Metric icon={CalendarDays} label={copy('budget')} value={formatMoney(summary.budget)} tone="blue" />
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300"><Megaphone size={19} /></span>
                        <div>
                            <h2 className="font-black text-slate-900 dark:text-white">{copy('title')}</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy('description')}</p>
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_auto_auto_auto]">
                        <label className="relative">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        <label>
                            <span className="sr-only">{copy('filterStatus')}</span>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allStatuses')}</option>
                                {['Draft', 'Active', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{copy('refresh')}</button>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowSegment(value => !value)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-4 text-sm font-bold text-pink-800 hover:bg-pink-100 dark:border-pink-900 dark:bg-pink-400/10 dark:text-pink-200"
                            >
                                <Users size={16} />
                                {showSegment ? (isArabic ? 'إغلاق الشرائح' : copy('closeSegment')) : (isArabic ? 'إدارة الشرائح والمجموعات' : copy('newSegment'))}
                            </button>
                        )}
                        {canManage && <button type="button" onClick={() => setShowNew(value => !value)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-pink-700 px-4 text-sm font-bold text-white hover:bg-pink-800"><Plus size={16} />{showNew ? copy('closeForm') : copy('newCampaign')}</button>}
                    </div>
                </header>

                {showSegment && canManage && (
                    <div className="border-b border-pink-100 bg-pink-50/40 p-5 space-y-5 dark:border-pink-900 dark:bg-pink-400/10 animate-in fade-in">
                        {/* New Segment Form */}
                        <form onSubmit={handleSegmentCreate} className="grid gap-4 md:grid-cols-[minmax(200px,.5fr)_minmax(240px,1fr)_auto]">
                            <Field label={copy('segmentName')}>
                                <input required maxLength={100} value={segmentForm.name} onChange={event => updateSegment('name', event.target.value)} placeholder={isArabic ? 'مثال: مرضى الفحص الدوري' : 'e.g. Regular Check-up'} className={inputClass} />
                            </Field>
                            <Field label={copy('segmentDescription')}>
                                <input value={segmentForm.description} onChange={event => updateSegment('description', event.target.value)} placeholder={isArabic ? 'وصف الفئة المستهدفة...' : 'Target group description...'} className={inputClass} />
                            </Field>
                            <div className="flex items-end gap-2">
                                <button type="button" onClick={closeSegmentForm} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800">{copy('cancel')}</button>
                                <button type="submit" disabled={isCreatingSegment} className="min-h-11 rounded-xl bg-pink-700 px-5 text-sm font-bold text-white disabled:opacity-50 hover:bg-pink-800">{isCreatingSegment ? copy('saving') : copy('saveSegment')}</button>
                            </div>
                        </form>

                        {/* Existing Segments List & Member Assignment */}
                        <div className="border-t border-pink-100/80 pt-4 dark:border-pink-900/80">
                            <h4 className="text-xs font-black uppercase tracking-wider text-pink-900 dark:text-pink-200 mb-3 flex items-center gap-2">
                                <Users size={15} />
                                <span>{isArabic ? 'الشرائح المستهدفة الحالية وإسناد المرضى' : 'Active Segments & Member Assignment'}</span>
                                <span className="rounded-full bg-pink-200/80 px-2 py-0.5 text-[10px] text-pink-800 dark:bg-pink-900/60 dark:text-pink-200 font-mono">
                                    {segments.length}
                                </span>
                            </h4>

                            {segments.length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                                    {isArabic ? 'لم يتم إنشاء أي شرائح بعد. أنشئ شريحة أولاً لتصنيف المرضى.' : 'No segments created yet. Create one above.'}
                                </p>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {segments.map((seg) => {
                                        const isAddingToThis = activeSegmentForAdd === seg.segment_id;
                                        return (
                                            <div
                                                key={seg.segment_id}
                                                className="rounded-xl border border-pink-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h5 className="text-sm font-black text-slate-900 dark:text-white">{seg.name}</h5>
                                                        {seg.description && (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{seg.description}</p>
                                                        )}
                                                    </div>
                                                    <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-[11px] font-black text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 whitespace-nowrap">
                                                        {seg.member_count || 0} {isArabic ? 'مريض' : 'members'}
                                                    </span>
                                                </div>

                                                <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                                    {!isAddingToThis ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveSegmentForAdd(seg.segment_id);
                                                                setPatientSearch('');
                                                            }}
                                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-700 hover:text-pink-800 dark:text-pink-300"
                                                        >
                                                            <UserPlus size={13} />
                                                            <span>{isArabic ? 'إضافة مريض للشريحة' : 'Add Patient to Segment'}</span>
                                                        </button>
                                                    ) : (
                                                        <div className="space-y-2 animate-in fade-in">
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    value={patientSearch}
                                                                    onChange={(e) => setPatientSearch(e.target.value)}
                                                                    placeholder={isArabic ? 'بحث بالاسم أو MRN...' : 'Search name or MRN...'}
                                                                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveSegmentForAdd(null)}
                                                                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>

                                                            {patientOptions.length > 0 && (
                                                                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/90 p-1 dark:border-slate-700 dark:bg-slate-800/90">
                                                                    {patientOptions.slice(0, 5).map(p => {
                                                                        const pId = p.patient_id || p.id;
                                                                        const pName = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.patient_name || 'Patient';
                                                                        return (
                                                                            <button
                                                                                key={pId}
                                                                                type="button"
                                                                                disabled={isAddingMember}
                                                                                onClick={() => handleAddMember(seg.segment_id, pId)}
                                                                                className="w-full text-start rounded-md px-2 py-1 text-[11px] font-bold transition flex items-center justify-between hover:bg-pink-100 dark:hover:bg-pink-950/50 text-slate-800 dark:text-slate-200"
                                                                            >
                                                                                <span className="truncate">{pName}</span>
                                                                                <span className="font-mono text-[10px] text-slate-400 ms-1">{p.mrn}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {showNew && canManage && (
                    <form onSubmit={handleCreate} className="grid gap-4 border-b border-pink-100 bg-pink-50/40 p-5 sm:grid-cols-2 xl:grid-cols-3 dark:border-pink-900 dark:bg-pink-400/10">
                        <Field label={copy('name')}><input required maxLength={150} value={form.name} onChange={event => updateForm('name', event.target.value)} placeholder={copy('namePlaceholder')} className={inputClass} /></Field>
                        <Field label={copy('targetSegment')}><select disabled={segmentsLoading} value={form.targetSegment} onChange={event => updateForm('targetSegment', event.target.value)} className={inputClass}><option value="">{copy('allOptedIn')}</option>{segments.map(segment => <option key={segment.segment_id} value={segment.segment_id}>{copy('segmentOption', { name: segment.name, count: segment.member_count || 0 })}</option>)}</select></Field>
                        <Field label={copy('channel')}><select required value={form.channel} onChange={event => updateForm('channel', event.target.value)} className={inputClass}>{['SMS', 'Email', 'WhatsApp'].map(channel => <option key={channel} value={channel}>{copy(`channels.${channel}`)}</option>)}</select></Field>
                        <Field label={copy('budgetInput')}><input type="number" min="0" step="0.01" value={form.budget} onChange={event => updateForm('budget', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('startDate')}><input type="date" value={form.startDate} onChange={event => updateForm('startDate', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('endDate')}><input type="date" min={form.startDate || undefined} value={form.endDate} onChange={event => updateForm('endDate', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('subject')}><input maxLength={200} value={form.messageSubject} onChange={event => updateForm('messageSubject', event.target.value)} placeholder={copy('subjectPlaceholder')} className={inputClass} /></Field>
                        <Field label={copy('message')}><textarea required minLength={10} maxLength={1600} rows={5} value={form.messageBody} onChange={event => updateForm('messageBody', event.target.value)} placeholder={copy('messagePlaceholder')} className={`${inputClass} min-h-32 resize-y leading-6 xl:col-span-2`} /></Field>
                        <Preview copy={copy} form={form} />
                        <p className="rounded-xl border border-pink-100 bg-white/70 px-3.5 py-3 text-xs font-semibold leading-5 text-slate-600 sm:col-span-2 xl:col-span-3 dark:border-pink-900 dark:bg-slate-950/50 dark:text-slate-300">{copy('activationNote')}</p>
                        <div className="flex flex-col-reverse gap-2 border-t border-pink-100 pt-4 sm:col-span-2 sm:flex-row sm:justify-end xl:col-span-3 dark:border-pink-900"><button type="button" onClick={closeCampaignForm} disabled={isCreating} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">{copy('cancel')}</button><button type="submit" disabled={isCreating} className="min-h-11 rounded-xl bg-pink-700 px-5 text-sm font-bold text-white hover:bg-pink-800 disabled:opacity-50">{isCreating ? copy('saving') : copy('saveCampaign')}</button></div>
                    </form>
                )}

                {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : visibleCampaigns.length === 0 ? (
                    <Empty
                        title={copy(campaigns.length ? 'filteredEmpty' : 'empty')}
                        description={copy(campaigns.length ? 'filteredEmptyDescription' : 'emptyDescription')}
                        actionLabel={canManage && !campaigns.length ? copy('newCampaign') : null}
                        onAction={canManage && !campaigns.length ? () => setShowNew(true) : null}
                    />
                ) : <div className="grid gap-4 p-4 xl:grid-cols-2">{visibleCampaigns.map(campaign => <CampaignCard key={campaign.campaign_id} campaign={campaign} copy={copy} formatDate={formatDate} formatMoney={formatMoney} canManage={canManage} onStatus={handleStatusUpdate} updating={isUpdatingStatus} />)}</div>}
            </section>
        </div>
    );
};

const toneClass = { pink: 'bg-pink-50 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300', emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300', blue: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' };
const statusClass = { Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', Completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', Cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300', Draft: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' };
const Metric = ({ icon: Icon, label, value, tone }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p><span className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${toneClass[tone]}`}><Icon size={17} /></span></div><p className="mt-2 font-mono text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">{value}</p></article>;
const Field = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>{children}</label>;
const Preview = ({ copy, form }) => {
    const body = form.messageBody.trim() || copy('messagePreviewEmpty');
    const subject = form.messageSubject.trim() || form.name.trim() || copy('subjectPreviewEmpty');
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 xl:col-span-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">{copy('preview')}</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{copy(`channels.${form.channel}`)}</span>
            </div>
            {form.channel === 'Email' && <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{subject}</p>}
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{body}</p>
            <p className="mt-3 text-[11px] font-bold text-slate-400">{copy('messageHelp', { count: form.messageBody.length })}</p>
        </div>
    );
};
const CampaignCard = ({ campaign, copy, formatDate, formatMoney, canManage, onStatus, updating }) => {
    const snippet = campaign.message_body || campaign.name;
    return (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-pink-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">{campaign.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className={`rounded-full px-2.5 py-1 ${statusClass[campaign.status] || statusClass.Draft}`}>{copy(`statuses.${campaign.status || 'Draft'}`)}</span>
                        <span className="inline-flex items-center gap-1 text-slate-500"><Tag size={12} />{copy(`channels.${campaign.channel}`)}</span>
                    </div>
                </div>
                {canManage && (
                    <div className="flex gap-1">
                        {campaign.status === 'Draft' && <IconButton label={copy('activate')} onClick={() => onStatus(campaign.campaign_id, 'Active')} disabled={updating}><Play size={16} /></IconButton>}
                        {campaign.status === 'Active' && <IconButton label={copy('complete')} onClick={() => onStatus(campaign.campaign_id, 'Completed')} disabled={updating}><Square size={16} /></IconButton>}
                        {!['Completed', 'Cancelled'].includes(campaign.status) && <IconButton label={copy('cancelCampaign')} onClick={() => onStatus(campaign.campaign_id, 'Cancelled')} disabled={updating}><PauseCircle size={16} /></IconButton>}
                    </div>
                )}
            </div>
            <p className="mt-4 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300">{snippet}</p>
            <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 dark:border-slate-800">
                <Info label={copy('audience')} value={campaign.segment_name || copy('allOptedIn')} icon={Users} />
                <Info label={copy('delivery')} value={copy('deliverySummary', { queued: campaign.queued_count || 0, sent: campaign.sent_count || 0, failed: campaign.failed_count || 0 })} icon={Send} />
                <Info label={copy('budget')} value={formatMoney(campaign.budget)} />
                <Info label={copy('timeline')} value={`${formatDate(campaign.start_date)} - ${formatDate(campaign.end_date)}`} icon={CalendarDays} />
                <Info label={copy('createdBy')} value={campaign.creator_name || copy('system')} />
                <Info label={copy('skipped')} value={campaign.skipped_count || 0} />
            </dl>
        </article>
    );
};
const IconButton = ({ label, onClick, disabled, children }) => <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50 dark:hover:bg-pink-400/10 dark:hover:text-pink-300">{children}</button>;
const Info = ({ label, value, icon: Icon }) => <div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">{Icon && <Icon size={14} />}{value}</dd></div>;
const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label }) => <div role="alert" className="p-12 text-center text-sm font-bold text-red-500">{label}</div>;
const Empty = ({ title, description, actionLabel, onAction, icon: Icon = Megaphone }) => (
    <div className="p-12 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300">
            <Icon size={28} />
        </div>
        <p className="text-base font-black text-slate-800 dark:text-white">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
        {actionLabel && onAction && (
            <button
                type="button"
                onClick={onAction}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-pink-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-pink-800 transition"
            >
                <Plus size={15} />
                <span>{actionLabel}</span>
            </button>
        )}
    </div>
);

export default CampaignManager;
