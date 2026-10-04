import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetAppointmentsQuery,
    useGetQueueQuery,
    useGetInvoicesQuery,
    useTransitionQueueMutation,
    useUpdateAppointmentMutation,
    useCreateInvoiceMutation,
    useDeliverResultMutation,
    useRequestDeferredReportMutation,
    useDeferReportForImagesMutation,
} from '../store/api';
import {
    buildScheduleSummary,
    canTransitionQueue,
    getNextStageAfterPayment,
    isActionableCashierItem,
} from '../components/reception/receptionLogic';
import { getErrorMessage } from '../utils/getErrorMessage';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

/**
 * Centralizes all reception data fetching, polling, and derived state.
 * Provides a unified `refreshWorkspace()` that refreshes all four data sources.
 *
 * @param {{ selectedDate: string, canViewAppointments?: boolean, canViewQueue?: boolean, canViewInvoices?: boolean }} params
 * @returns {{
 *   appointments: array,
 *   queueItems: array,
 *   queueKpis: object,
 *   patientList: object,
 *   invoices: array,
 *   cashierPending: array,
 *   scheduleSummary: object,
 *   appLoading: boolean,
 *   isPatListLoading: boolean,
 *   isRefreshing: boolean,
 *   refreshWorkspace: () => Promise<void>,
 *   createAppointmentInvoice: (appointment: object) => Promise<void>,
 *   deliverFinalResult: (exam: object) => Promise<void>,
 *   moveQueue: (item: object, toStage: string, reason?: string) => Promise<void>,
 *   dataErrors: array,
 *   isDeliveringResult: boolean,
 * }}
 */
export const useReceptionData = ({
    selectedDate,
    canViewAppointments = false,
    canViewQueue = false,
    canViewInvoices = false,
}) => {
    const { t } = useTranslation('reception');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pickupTarget, setPickupTarget] = useState(null);
    // Queries
    const {
        data: appointments,
        isLoading: isAppointmentsLoading,
        isFetching: isAppointmentsFetching,
        isError: isAppointmentsError,
        error: appointmentsError,
        refetch: refetchAppointments,
    } = useGetAppointmentsQuery({ date: selectedDate }, {
        pollingInterval: 30_000,
        skip: !canViewAppointments,
    });

    const {
        data: queueResponse,
        isLoading: isQueueLoading,
        isFetching: isQueueFetching,
        isError: isQueueError,
        error: queueError,
        refetch: refetchQueue,
    } = useGetQueueQuery({ date: selectedDate, includeDelivered: 'true', limit: 500 }, {
        pollingInterval: 15_000,
        skip: !canViewQueue,
    });

    const {
        data: rawInvoices,
        isLoading: isInvoicesLoading,
        isFetching: isInvoicesFetching,
        isError: isInvoicesError,
        error: invoicesError,
        refetch: refetchInvoices,
    } = useGetInvoicesQuery({ appointmentDate: selectedDate, limit: 500 }, {
        pollingInterval: 30_000,
        skip: !canViewInvoices,
    });

    const appLoading = (canViewAppointments && isAppointmentsLoading)
        || (canViewQueue && isQueueLoading)
        || (canViewInvoices && isInvoicesLoading);
    // Mutations
    const [transitionQueue] = useTransitionQueueMutation();
    const [updateAppointment] = useUpdateAppointmentMutation();
    const [createInvoice] = useCreateInvoiceMutation();
    const [deliverResult, { isLoading: isDeliveringResult }] = useDeliverResultMutation();
    const [requestDeferredReport, { isLoading: isRequestingReport }] = useRequestDeferredReportMutation();
    const [deferReportForImages, { isLoading: isDeferringReport }] = useDeferReportForImagesMutation();
    // Derived state
    const invoices = useMemo(() => rawInvoices || [], [rawInvoices]);
    const queueItems = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const queueKpis = useMemo(() => queueResponse?.kpis || {}, [queueResponse?.kpis]);
    const cashierPending = useMemo(
        () => {
            const matchedExamIds = new Set();
            const list = [];

            // 1. Check active queue items
            (queueItems || []).forEach((item) => {
                const invoice = invoices.find(inv => (item.exam_id && inv.exam_id === item.exam_id) || (item.appointment_id && inv.appointment_id === item.appointment_id));
                if (isActionableCashierItem(item, invoice)) {
                    list.push(item);
                    if (item.exam_id) matchedExamIds.add(item.exam_id);
                    if (item.appointment_id) matchedExamIds.add(item.appointment_id);
                }
            });

            // 2. Also check any invoices for today with an outstanding balance (e.g. newly added supplies on an exam)
            (invoices || []).forEach((inv) => {
                if (inv.invoice_status === 'Voided' || Number(inv.balance_amount || 0) <= 0.005) return;
                const matchExam = inv.exam_id && matchedExamIds.has(inv.exam_id);
                const matchAppt = inv.appointment_id && matchedExamIds.has(inv.appointment_id);
                if (matchExam || matchAppt) return;

                const appt = (appointments || []).find(a => (inv.appointment_id && a.appointment_id === inv.appointment_id) || (inv.exam_id && a.exam_id === inv.exam_id));
                list.push({
                    exam_id: inv.exam_id || inv.appointment_id,
                    appointment_id: inv.appointment_id || inv.exam_id,
                    patient_id: inv.patient_id,
                    patient_name: inv.patient_name || (appt ? appt.patient_name : null),
                    mrn: inv.mrn || (appt ? appt.mrn : null),
                    exam_type_name: inv.items?.[0]?.description || appt?.exam_type_name || 'فحص طبي',
                    modality_name: appt?.machine_name || appt?.modality_name || '',
                    priority: appt?.priority || 'Routine',
                    queue_stage: appt?.queue_stage || 'Payment Pending',
                    waiting_minutes: 0,
                    invoice: inv
                });
                if (inv.exam_id) matchedExamIds.add(inv.exam_id);
                if (inv.appointment_id) matchedExamIds.add(inv.appointment_id);
            });

            return list;
        },
        [queueItems, invoices, appointments]
    );
    const scheduleSummary = useMemo(
        () => buildScheduleSummary(appointments || [], queueItems),
        [appointments, queueItems]
    );
    const dataErrors = useMemo(() => [
        canViewAppointments && isAppointmentsError && { source: 'appointments', error: appointmentsError },
        canViewQueue && isQueueError && { source: 'queue', error: queueError },
        canViewInvoices && isInvoicesError && { source: 'invoices', error: invoicesError },
    ].filter(Boolean), [
        appointmentsError, canViewAppointments, canViewInvoices, canViewQueue,
        invoicesError, isAppointmentsError, isInvoicesError, isQueueError, queueError,
    ]);
    // Handlers
    const refreshWorkspace = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const refreshers = [];
            if (canViewAppointments) refreshers.push(refetchAppointments());
            if (canViewQueue) refreshers.push(refetchQueue());
            if (canViewInvoices) refreshers.push(refetchInvoices());
            const results = await Promise.all(refreshers);
            const failed = results.some((result) => result.error);
            if (failed) toast.error(t('command.refreshFailed', 'Some reception data could not be refreshed.'));
            else toast.success(t('command.refreshed', 'Reception workspace refreshed.'));
        } finally {
            setIsRefreshing(false);
        }
    }, [canViewAppointments, canViewInvoices, canViewQueue, refetchAppointments, refetchInvoices, refetchQueue, t]);

    const moveQueue = useCallback(async (item, toStage, reason) => {
        const examId = item?.exam_id || item?.examId;
        const appointmentId = item?.appointment_id || item?.appointmentId;
        const fromStage = item?.queue_stage || item?.queueStage;

        if (isValidUuid(examId) && !fromStage) {
            toast.error(t('toast.queueStageUnknown', 'Refresh the reception queue before changing this exam status.'));
            return;
        }

        if (fromStage && !canTransitionQueue(fromStage, toStage)) {
            toast.error(t('toast.invalidQueueTransition', {
                defaultValue: 'Invalid queue transition from {{from}} to {{to}}.',
                from: t(`queue.stages.${fromStage}`, { defaultValue: fromStage }),
                to: t(`queue.stages.${toStage}`, { defaultValue: toStage })
            }));
            return;
        }

        if (!isValidUuid(examId)) {
            if (toStage === 'Arrived' && isValidUuid(appointmentId)) {
                try {
                    await updateAppointment({ id: appointmentId, status: 'Checked-in' }).unwrap();
                    await Promise.all([refetchAppointments(), refetchQueue()]);
                    toast.success(t('toast.queueMoved', { stage: t('status.Checked-in', { defaultValue: 'Checked-in' }) }));
                } catch (error) {
                    toast.error(getErrorMessage(error, t('toast.queueFailed')));
                }
                return;
            }

            toast.error(t('toast.queueMissingExam', 'This appointment does not have a valid examination record. Refresh and try again.'));
            return;
        }

        try {
            await transitionQueue({ examId, toStage, reason }).unwrap();
            toast.success(t('toast.queueMoved', { stage: t(`queue.stages.${toStage}`, { defaultValue: toStage }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.queueFailed')));
            // The action may have failed because another receptionist already
            // changed this case. Refresh so the operator sees the real state.
            await Promise.all([refetchAppointments(), refetchQueue()]).catch(() => undefined);
        }
    }, [refetchAppointments, refetchQueue, t, transitionQueue, updateAppointment]);

    const createAppointmentInvoice = useCallback(async (appointment) => {
        try {
            await createInvoice({ appointmentId: appointment.appointment_id }).unwrap();
            toast.success(t('toast.invoiceCreated'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.invoiceFailed')));
        }
    }, [createInvoice, t]);

    const confirmPickup = useCallback(async (recipientName) => {
        if (!pickupTarget) return false;
        const imagesOnly = pickupTarget.queue_stage === 'Images Ready';
        try {
            await deliverResult({
                examId: pickupTarget.exam_id,
                deliveryMethod: 'Physical Pickup',
                resultType: imagesOnly ? 'Images' : 'Report',
                deliveryStatus: 'Picked Up',
                recipientName,
                acknowledgedByName: recipientName,
                notes: imagesOnly
                    ? t('pickup.imagesDeliveryNote', { defaultValue: 'Images-only physical pickup at reception; no report requested' })
                    : t('pickup.deliveryNote'),
            }).unwrap();
            toast.success(imagesOnly
                ? t('toast.imagesPickupRecorded', { defaultValue: 'Image pickup recorded successfully.' })
                : t('toast.pickupRecorded'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.pickupFailed')));
            return false;
        }
    }, [deliverResult, pickupTarget, t]);

    const requestReport = useCallback(async (exam) => {
        if (!exam?.exam_id) return false;
        try {
            await requestDeferredReport({
                examId: exam.exam_id,
                source: 'Reception'
            }).unwrap();
            toast.success(t('toast.reportRequested', { defaultValue: 'The examination was sent to the reporting queue.' }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.reportRequestFailed', { defaultValue: 'Failed to request the report.' })));
            return false;
        }
    }, [requestDeferredReport, t]);

    const deferReport = useCallback(async (exam, reason) => {
        if (!exam?.exam_id) return false;
        try {
            await deferReportForImages({
                examId: exam.exam_id,
                reason: reason || 'Patient requested images only'
            }).unwrap();
            toast.success(t('toast.reportDeferred', { defaultValue: 'تم تحويل الحالة لاستلام أفلام فقط والصور جاهزة للتسليم.' }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.reportDeferFailed', { defaultValue: 'تعذر تحويل الحالة لاستلام أفلام.' })));
            return false;
        }
    }, [deferReportForImages, t]);

    return {
        // Data
        appointments,
        queueItems,
        queueKpis,
        invoices,
        cashierPending,
        scheduleSummary,
        dataErrors,
        hasDataError: dataErrors.length > 0,
        // Loading
        appLoading,
        isWorkspaceFetching: (canViewAppointments && isAppointmentsFetching)
            || (canViewQueue && isQueueFetching)
            || (canViewInvoices && isInvoicesFetching),
        isRefreshing,
        isDeliveringResult,
        isRequestingReport,
        isDeferringReport,
    // Handlers
        refreshWorkspace,
        moveQueue,
        createAppointmentInvoice,
        confirmPickup,
        requestReport,
        deferReport,
        // Pickup dialog
        pickupTarget,
        setPickupTarget,
    };
};
