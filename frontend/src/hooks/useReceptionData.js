import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetAppointmentsQuery,
    useGetQueueQuery,
    useGetPatientsQuery,
    useGetInvoicesQuery,
    useTransitionQueueMutation,
    useUpdateAppointmentMutation,
    useCreateInvoiceMutation,
    useDeliverResultMutation,
} from '../store/api';
import {
    buildScheduleSummary,
    canTransitionQueue,
    getNextStageAfterPayment,
} from '../components/reception/receptionLogic';
import { getErrorMessage } from '../utils/getErrorMessage';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

/**
 * Centralizes all reception data fetching, polling, and derived state.
 * Provides a unified `refreshWorkspace()` that refreshes all four data sources.
 *
 * @param {{ selectedDate: string, canAccessCashierReconciliation: boolean }} params
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
 *   moveQueue: (item: object, toStage: string, reason?: string) => Promise<void>,
 *   confirmPickup: (recipientName: string) => Promise<boolean>,
 *   pickupTarget: object | null,
 *   setPickupTarget: (item: object | null) => void,
 * }}
 */
export const useReceptionData = ({ selectedDate }) => {
    const { t } = useTranslation('reception');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pickupTarget, setPickupTarget] = useState(null);
    // Queries
    const {
        data: appointments,
        isLoading: appLoading,
        refetch: refetchAppointments,
    } = useGetAppointmentsQuery({ date: selectedDate }, { pollingInterval: 30_000 });

    const {
        data: queueResponse,
        refetch: refetchQueue,
    } = useGetQueueQuery({ date: selectedDate, includeDelivered: 'true', limit: 200 }, { pollingInterval: 15_000 });

    const {
        data: patientList,
        isLoading: isPatListLoading,
        refetch: refetchPatients,
    } = useGetPatientsQuery({ limit: 500 }, { pollingInterval: 60_000 });

    const {
        data: rawInvoices,
        refetch: refetchInvoices,
    } = useGetInvoicesQuery(undefined, { pollingInterval: 30_000 });
    // Mutations
    const [transitionQueue] = useTransitionQueueMutation();
    const [updateAppointment] = useUpdateAppointmentMutation();
    const [createInvoice] = useCreateInvoiceMutation();
    const [deliverResult, { isLoading: isDeliveringResult }] = useDeliverResultMutation();
    // Derived state
    const invoices = useMemo(() => rawInvoices || [], [rawInvoices]);
    const queueItems = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const queueKpis = useMemo(() => queueResponse?.kpis || {}, [queueResponse?.kpis]);
    const cashierPending = useMemo(
        () => queueItems.filter((item) => {
            if (item.queue_stage === 'Payment Pending') return true;
            const invoice = invoices.find(inv => inv.exam_id === item.exam_id || inv.appointment_id === item.appointment_id);
            return invoice && invoice.invoice_status !== 'Voided' && Number(invoice.balance_amount || 0) > 0;
        }),
        [queueItems, invoices]
    );
    const scheduleSummary = useMemo(
        () => buildScheduleSummary(appointments || [], queueItems),
        [appointments, queueItems]
    );
    // Handlers
    const refreshWorkspace = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const results = await Promise.all([
                refetchAppointments(),
                refetchQueue(),
                refetchPatients(),
                refetchInvoices(),
            ]);
            const failed = results.some((result) => result.error);
            if (failed) toast.error(t('command.refreshFailed', 'Some reception data could not be refreshed.'));
            else toast.success(t('command.refreshed', 'Reception workspace refreshed.'));
        } finally {
            setIsRefreshing(false);
        }
    }, [refetchAppointments, refetchInvoices, refetchPatients, refetchQueue, t]);

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
        try {
            await deliverResult({
                examId: pickupTarget.exam_id,
                deliveryMethod: 'Physical Pickup',
                deliveryStatus: 'Picked Up',
                recipientName,
                acknowledgedByName: recipientName,
                notes: t('pickup.deliveryNote'),
            }).unwrap();
            toast.success(t('toast.pickupRecorded'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.pickupFailed')));
            return false;
        }
    }, [deliverResult, pickupTarget, t]);

    return {
        // Data
        appointments,
        queueItems,
        queueKpis,
        patientList,
        invoices,
        cashierPending,
        scheduleSummary,
        // Loading
        appLoading,
        isPatListLoading,
        isRefreshing,
        isDeliveringResult,
    // Handlers
        refreshWorkspace,
        moveQueue,
        createAppointmentInvoice,
        confirmPickup,
        // Pickup dialog
        pickupTarget,
        setPickupTarget,
    };
};
