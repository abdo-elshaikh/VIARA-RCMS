import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock3, ShieldCheck, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import {
    useGetReceptionSupervisorAssignmentsQuery, useGetReceptionTeamShiftHistoryQuery,
    useGetShiftHandoverQuery, useCreateShiftHandoverMutation, useAcknowledgeShiftHandoverMutation,
    useGetReceptionSupervisedTasksQuery, useTransferReceptionSupervisedTaskMutation,
} from '../../store/api';

const TaskTransferCard = ({ task, targets, ar }) => {
    const say = (arabic, english) => ar ? arabic : english;
    const [targetUserId, setTargetUserId] = useState('');
    const [reason, setReason] = useState('');
    const [transfer, { isLoading }] = useTransferReceptionSupervisedTaskMutation();
    const submit = async (event) => {
        event.preventDefault();
        if (!targetUserId || targetUserId === task.employee_id) return;
        try {
            await transfer({ appointmentId: task.appointment_id, targetUserId, reason: reason.trim() }).unwrap();
            toast.success(say('تم تحويل المهمة.', 'Task transferred.'));
        } catch (error) { toast.error(getErrorMessage(error, say('تعذر تحويل المهمة.', 'Could not transfer task.'))); }
    };
    return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-black text-slate-900 dark:text-white">{task.modality_name || say('مهمة استقبال', 'Reception task')} · {task.room_number || task.desk_identifier || '—'}</p><p className="mt-1 text-xs text-slate-500">{say('المسندة إلى', 'Assigned to')}: {task.employee_name}</p></div><span className="text-xs font-bold text-amber-700 dark:text-amber-300">{task.status === 'In_Progress' ? say('قيد التنفيذ', 'In progress') : say('مستلمة', 'Claimed')}</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select required aria-label={say('تحويل المهمة إلى', 'Transfer task to')} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">{say('اختر المستلم', 'Choose recipient')}</option>{targets.filter((item) => item.userId !== task.employee_id).map((item) => <option key={item.userId} value={item.userId}>{item.name}</option>)}</select>
            <input aria-label={say('سبب التحويل', 'Transfer reason')} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={say('سبب التحويل (اختياري)', 'Reason (optional)')} className="rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
            <button type="submit" disabled={isLoading || !targetUserId} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{say('تحويل', 'Transfer')}</button>
        </div>
    </form>;
};

const SupervisedTasksPanel = ({ assignments, ar }) => {
    const say = (arabic, english) => ar ? arabic : english;
    const user = useSelector(selectCurrentUser);
    const userId = user?.user_id || user?.id || user?.userId;
    const { data: tasks = [], isLoading, isError, refetch } = useGetReceptionSupervisedTasksQuery(undefined, { skip: !assignments.some((item) => item.can_transfer_tasks), pollingInterval: 30000, skipPollingIfUnfocused: true });
    if (!assignments.some((item) => item.can_transfer_tasks)) return null;
    const targets = [
        ...(userId ? [{ userId, name: say('إليّ', 'To me') }] : []),
        ...assignments.filter((item) => item.can_transfer_tasks).map((item) => ({ userId: item.employee_id, name: item.employee_name })),
    ].filter((item, index, list) => list.findIndex((other) => other.userId === item.userId) === index);
    return <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
        <div><h3 className="text-base font-black text-slate-900 dark:text-white">{say('مهام الفريق القابلة للتحويل', 'Team tasks available for transfer')}</h3><p className="mt-1 text-xs text-slate-500">{say('يجب أن يكون المستلم قد فتح وردية الاستقبال، وتظل المهام خارج فريقك مخفية.', 'The recipient must have an open reception shift. Tasks outside your team are hidden.')}</p></div>
        {isLoading && <p className="text-sm text-slate-500">{say('جارٍ تحميل المهام…', 'Loading tasks…')}</p>}
        {isError && <p role="alert" className="text-sm text-rose-700">{say('تعذر تحميل مهام الفريق.', 'Could not load team tasks.')} <button type="button" onClick={refetch} className="underline">{say('إعادة المحاولة', 'Retry')}</button></p>}
        {!isLoading && !isError && !(Array.isArray(tasks) && tasks.length) && <p className="text-sm text-slate-500">{say('لا توجد مهام نشطة قابلة للتحويل حاليًا.', 'No active tasks are available for transfer.')}</p>}
        {(Array.isArray(tasks) ? tasks : []).map((task) => <TaskTransferCard key={task.appointment_id} task={task} targets={targets} ar={ar} />)}
    </section>;
};

const HandoverPanel = ({ shift, assignment, team, ar }) => {
    const say = (arabic, english) => ar ? arabic : english;
    const { data: handovers = [], isLoading, isError } = useGetShiftHandoverQuery(shift.session_id);
    const [createHandover, { isLoading: creating }] = useCreateShiftHandoverMutation();
    const [acknowledge, { isLoading: acknowledging }] = useAcknowledgeShiftHandoverMutation();
    const [notes, setNotes] = useState('');
    const [toUserId, setToUserId] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        try {
            await createHandover({ sessionId: shift.session_id, notes: notes.trim(),
                toUserId: toUserId || undefined, pendingTaskIds: [] }).unwrap();
            setNotes(''); setToUserId('');
            toast.success(say('تم إنشاء التسليم.', 'Handover created.'));
        } catch (error) { toast.error(getErrorMessage(error, say('تعذر إنشاء التسليم.', 'Could not create handover.'))); }
    };
    const confirm = async (handoverId) => {
        try {
            await acknowledge({ handoverId, acknowledged: true }).unwrap();
            toast.success(say('تم تأكيد التسليم.', 'Handover acknowledged.'));
        } catch (error) { toast.error(getErrorMessage(error, say('تعذر تأكيد التسليم.', 'Could not acknowledge handover.'))); }
    };
    return <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h4 className="text-sm font-black text-slate-900 dark:text-white">{say('تسليمات الوردية المفتوحة', 'Open shift handovers')}</h4>
        {isLoading && <p className="mt-2 text-xs text-slate-500">{say('جارٍ التحميل…', 'Loading…')}</p>}
        {isError && <p role="alert" className="mt-2 text-xs text-rose-700">{say('تعذر تحميل التسليمات.', 'Could not load handovers.')}</p>}
        {!isLoading && !isError && !(Array.isArray(handovers) && handovers.length) && <p className="mt-2 text-xs text-slate-500">{say('لا توجد تسليمات بعد.', 'No handovers yet.')}</p>}
        <div className="mt-2 space-y-2">{(Array.isArray(handovers) ? handovers : []).map((item) => <div key={item.handover_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800"><div><p className="font-bold text-slate-800 dark:text-slate-100">{item.to_user_name || say('دون مستلم محدد', 'No recipient selected')}</p><p className="text-slate-500">{item.notes || '—'}</p></div>{item.acknowledged_at ? <span className="font-bold text-emerald-700">{say('تم التأكيد', 'Acknowledged')}</span> : assignment.can_manage_handovers ? <button type="button" disabled={acknowledging} onClick={() => confirm(item.handover_id)} className="rounded-lg border border-teal-600 px-3 py-1.5 font-bold text-teal-700 disabled:opacity-50 dark:text-teal-300">{say('تأكيد الاستلام', 'Acknowledge')}</button> : <span className="text-amber-700">{say('بانتظار التأكيد', 'Pending')}</span>}</div>)}</div>
        {assignment.can_manage_handovers && <form onSubmit={submit} className="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">{say('المستلم (اختياري)', 'Recipient (optional)')}<select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">{say('دون مستلم محدد', 'No specific recipient')}</option>{team.filter((item) => item.employee_id !== assignment.employee_id).map((item) => <option key={item.employee_id} value={item.employee_id}>{item.employee_name}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">{say('ملاحظات التسليم', 'Handover notes')}<textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
            <button type="submit" disabled={creating} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{say('إنشاء تسليم', 'Create handover')}</button>
        </form>}
    </div>;
};

const ReceptionSupervisionProfile = () => {
    const { i18n } = useTranslation();
    const ar = i18n.language.startsWith('ar');
    const say = (arabic, english) => ar ? arabic : english;
    const { data: assignments = [], isLoading, isError, refetch } = useGetReceptionSupervisorAssignmentsQuery();
    const active = useMemo(() => (Array.isArray(assignments) ? assignments : [])
        .filter((item) => new Date(item.starts_at) <= new Date() && (!item.ends_at || new Date(item.ends_at) > new Date())), [assignments]);
    const [selectedId, setSelectedId] = useState(null);
    const selected = active.find((item) => item.employee_id === selectedId && item.can_view_shifts)
        || active.find((item) => item.can_view_shifts);
    const { data: shifts = [], isFetching: loadingShifts, isError: shiftsError } = useGetReceptionTeamShiftHistoryQuery(selected?.employee_id, { skip: !selected?.employee_id });

    return <section className="space-y-5" aria-label={say('إشرافي', 'My supervision')}>
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 dark:border-teal-900 dark:from-teal-950/40 dark:to-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white"><ShieldCheck size={21} className="text-teal-700" />{say('إشرافي على فريق الاستقبال', 'My reception supervision')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{say('هنا تظهر التكليفات والصلاحيات التي منحتها لك الإدارة. يمكنك متابعة ورديات أعضاء فريقك المصرح بهم فقط.', 'Your assigned team and capabilities appear here. You can review only the team members within your scope.')}</p>
        </div>
        {isError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{say('تعذر تحميل بيانات الإشراف.', 'Could not load supervision data.')} <button type="button" onClick={refetch} className="underline">{say('إعادة المحاولة', 'Retry')}</button></div>}
        {isLoading && <p className="text-sm text-slate-500">{say('جارٍ تحميل الفريق…', 'Loading team…')}</p>}
        {!isLoading && !isError && !active.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><Users className="mx-auto mb-2 text-slate-400" /><p className="text-sm text-slate-600 dark:text-slate-300">{say('ليس لديك تكليف إشرافي نشط حاليًا.', 'You have no active supervision assignment right now.')}</p></div>}
        <div className="grid gap-3 md:grid-cols-2">
            {active.map((item) => <button key={item.assignment_id} type="button" onClick={() => item.can_view_shifts && setSelectedId(item.employee_id)} className={`rounded-2xl border p-4 text-start transition ${selected?.assignment_id === item.assignment_id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'} ${item.can_view_shifts ? 'hover:border-teal-500' : 'cursor-default'}`}>
                <p className="text-xs font-bold text-teal-700 dark:text-teal-300">{say('عضو الفريق', 'Team member')}</p><h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">{item.employee_name}</h3>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                    {item.can_view_shifts && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800 dark:bg-sky-950 dark:text-sky-200">{say('عرض الورديات', 'View shifts')}</span>}
                    {item.can_manage_handovers && <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800 dark:bg-violet-950 dark:text-violet-200">{say('إدارة التسليم', 'Manage handovers')}</span>}
                    {item.can_transfer_tasks && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{say('تحويل المهام', 'Transfer tasks')}</span>}
                </div>
                {item.ends_at && <p className="mt-3 text-xs text-slate-500">{say('ينتهي التكليف', 'Assignment ends')}: {new Date(item.ends_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</p>}
            </button>)}
        </div>
        <SupervisedTasksPanel assignments={active} ar={ar} />
        {selected && <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><Clock3 size={18} />{say(`ورديات ${selected.employee_name}`, `${selected.employee_name}'s shifts`)}</h3><Link to="/reception" className="text-sm font-bold text-teal-700 underline-offset-2 hover:underline dark:text-teal-300">{say('الانتقال إلى عمل الاستقبال', 'Go to reception workspace')}</Link></div>
            {loadingShifts && <p className="mt-3 text-sm text-slate-500">{say('جارٍ تحميل الورديات…', 'Loading shifts…')}</p>}
            {shiftsError && <p role="alert" className="mt-3 text-sm text-rose-700">{say('تعذر عرض الورديات. قد يكون التكليف قد انتهى.', 'Could not load shifts. The assignment may have expired.')}</p>}
            {!loadingShifts && !shiftsError && (!Array.isArray(shifts) || !shifts.length) && <p className="mt-3 text-sm text-slate-500">{say('لا توجد ورديات مسجلة لهذا الموظف.', 'No recorded shifts for this employee.')}</p>}
            <div className="mt-3 space-y-2">{(Array.isArray(shifts) ? shifts : []).map((shift) => <div key={shift.session_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"><span className="font-semibold text-slate-800 dark:text-slate-100">{new Date(shift.started_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</span><span className={shift.status === 'Open' ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}>{shift.status === 'Open' ? say('مفتوحة', 'Open') : say('مغلقة', 'Closed')}</span></div>)}</div>
            {(Array.isArray(shifts) ? shifts : []).filter((shift) => shift.status === 'Open').map((shift) => <HandoverPanel key={shift.session_id} shift={shift} assignment={selected} team={active.filter((item) => item.can_manage_handovers)} ar={ar} />)}
        </div>}
    </section>;
};

export default ReceptionSupervisionProfile;
