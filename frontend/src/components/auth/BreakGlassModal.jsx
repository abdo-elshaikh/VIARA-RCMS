import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRequestBreakGlassMutation } from '../../store/api';
import { setAccessToken, updateCurrentUser } from '../../store/authSlice';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const BreakGlassModal = ({ isOpen, onClose }) => {
    const [reason, setReason] = useState('');
    const [requestBreakGlass, { isLoading }] = useRequestBreakGlassMutation();
    const dispatch = useDispatch();
    const { t } = useTranslation('system');

    useEffect(() => { if (!isOpen) setReason(''); }, [isOpen]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const response = await requestBreakGlass({ reason: reason.trim() }).unwrap();
            dispatch(updateCurrentUser({
                elevatedPermissions: response.elevatedPermissions,
                breakGlassExpiry: new Date(response.expiresAt).getTime(),
            }));
            dispatch(setAccessToken(response.token));
            toast.success(response.message);
            onClose();
        } catch (error) {
            toast.error(error?.data?.error || t('breakGlass.error'));
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('breakGlass.title')} size="sm">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><ShieldAlert size={20} /></span>
                    <div><p className="text-sm font-bold text-red-900">{t('breakGlass.protocol')}</p><p className="mt-1 text-sm leading-6 text-red-800/80">{t('breakGlass.description')}</p></div>
                </div>
                <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">{t('breakGlass.reason')} <span className="text-red-500">*</span></span>
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('breakGlass.placeholder')} className="h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10" required minLength={10} autoFocus />
                    <span className="mt-1.5 block text-xs text-slate-500">{t('breakGlass.minimum')}</span>
                </label>
                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                    <Button type="button" variant="ghost" onClick={onClose}>{t('breakGlass.cancel')}</Button>
                    <Button type="submit" variant="danger" loading={isLoading} disabled={reason.trim().length < 10}>{isLoading ? t('breakGlass.processing') : t('breakGlass.submit')}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default BreakGlassModal;
