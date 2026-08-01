import { useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';

const CancelReasonDialog = ({ isOpen, patientName, isSaving, onClose, onConfirm }) => {
    const { t } = useTranslation('clinicalQueues');
    const [reason, setReason] = useState('');
    const [attempted, setAttempted] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setReason('');
            setAttempted(false);
        }
    }, [isOpen]);

    const submit = (event) => {
        event.preventDefault();
        setAttempted(true);
        if (!reason.trim()) return;
        onConfirm(reason.trim());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('common.cancelTitle', { defaultValue: 'Cancel Examination' })} size="sm">
            <form onSubmit={submit} className="space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
                    <XCircle className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" size={19} />
                    <div>
                        <p className="font-bold text-rose-950 dark:text-rose-100">{patientName || t('common.patientFallback')}</p>
                        <p className="mt-1 text-sm leading-6 text-rose-900/75 dark:text-rose-300">{t('common.cancelDescription', { defaultValue: 'Please provide a reason for cancelling this examination. This action cannot be undone.' })}</p>
                    </div>
                </div>
                <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-300">{t('common.cancelReason', { defaultValue: 'Reason for cancellation' })}</span>
                    <textarea 
                        autoFocus 
                        value={reason} 
                        onChange={(event) => setReason(event.target.value)} 
                        rows={4} 
                        maxLength={500} 
                        className={`w-full resize-y rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-4 dark:bg-slate-900 dark:text-slate-100 ${attempted && !reason.trim() ? 'border-rose-400 focus:ring-rose-100 dark:focus:ring-rose-900/30' : 'border-slate-200 focus:border-rose-600 focus:ring-rose-100 dark:border-slate-700 dark:focus:border-rose-500 dark:focus:ring-rose-900/30'}`} 
                        placeholder={t('common.cancelPlaceholder', { defaultValue: 'e.g. Patient refused, Machine breakdown...' })} 
                        aria-invalid={attempted && !reason.trim()} 
                    />
                    {attempted && !reason.trim() && <span className="mt-1.5 block text-xs font-semibold text-rose-600 dark:text-rose-400">{t('common.cancelRequired', { defaultValue: 'A reason is required to cancel.' })}</span>}
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    <button type="submit" disabled={isSaving} className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{t('common.confirmCancelBtn', { defaultValue: 'Confirm Cancellation' })}</button>
                </div>
            </form>
        </Modal>
    );
};

export default CancelReasonDialog;
