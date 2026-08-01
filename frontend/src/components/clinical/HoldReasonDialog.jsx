import { useEffect, useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';

const HoldReasonDialog = ({ isOpen, patientName, isSaving, onClose, onConfirm }) => {
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
        <Modal isOpen={isOpen} onClose={onClose} title={t('common.holdTitle')} size="sm">
            <form onSubmit={submit} className="space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
                    <PauseCircle className="mt-0.5 shrink-0 text-amber-700" size={19} />
                    <div><p className="font-bold text-amber-950">{patientName || t('common.patientFallback')}</p><p className="mt-1 text-sm leading-6 text-amber-900/75">{t('common.holdDescription')}</p></div>
                </div>
                <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">{t('common.holdReason')}</span>
                    <textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} className={`w-full resize-y rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-4 ${attempted && !reason.trim() ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-cyan-600 focus:ring-cyan-100'}`} placeholder={t('common.holdPlaceholder')} aria-invalid={attempted && !reason.trim()} />
                    {attempted && !reason.trim() && <span className="mt-1.5 block text-xs font-semibold text-red-600">{t('common.holdRequired')}</span>}
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
                    <button type="submit" disabled={isSaving} className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">{t('common.confirmHold')}</button>
                </div>
            </form>
        </Modal>
    );
};

export default HoldReasonDialog;
