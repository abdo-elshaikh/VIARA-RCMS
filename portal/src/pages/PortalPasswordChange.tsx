import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/store';
import { useChangePasswordMutation } from '../store/api';
import { logOut, selectCurrentUser } from '../store/authSlice';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, Eye, EyeOff } from 'lucide-react';

const PortalPasswordChange = () => {
    const { t } = useTranslation('auth');
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const user = useAppSelector(selectCurrentUser);
    const [changePassword] = useChangePasswordMutation();

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        setSuccess('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError(t('passwordsDoNotMatch', 'New passwords do not match'));
            setIsSubmitting(false);
            return;
        }

        if (formData.newPassword.length < 8) {
            setError(t('passwordTooShort', 'New password must be at least 8 characters'));
            setIsSubmitting(false);
            return;
        }

        try {
            await changePassword({
                currentPassword: formData.currentPassword,
                newPassword: formData.newPassword
            }).unwrap();
            setSuccess(t('passwordChanged', 'Password changed. Redirecting you to sign in again.'));
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            const loginPath = user?.role === 'Doctor' ? '/doctor/login' : '/patient/login';
            dispatch(logOut());
            navigate(loginPath, { replace: true });
        } catch (err: any) {
            setError(err?.data?.message || t('changePasswordError', 'Failed to change password'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
                <div className="flex items-center justify-center mb-6">
                    <LockKeyhole className="h-8 w-8 text-blue-600" />
                </div>
                <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
                    {t('changePasswordTitle', 'Change Your Password')}
                </h1>
                <p className="text-sm text-center text-gray-600 dark:text-slate-400 mb-6">
                    {t('changePasswordDesc', 'Please set a new password to continue.')}
                </p>

                {error && (
                    <div role="alert" className="mb-4 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        {error}
                    </div>
                )}
                {success && (
                    <div role="status" aria-live="polite" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('currentPassword', 'Current Password')}
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                name="currentPassword"
                                value={formData.currentPassword}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 pe-10 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent(!showCurrent)}
                                aria-label={showCurrent ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                                className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-gray-500 dark:text-slate-400"
                            >
                                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('newPassword', 'New Password')}
                        </label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                name="newPassword"
                                value={formData.newPassword}
                                onChange={handleChange}
                                required
                                minLength={8}
                                className="w-full px-3 py-2 pe-10 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(!showNew)}
                                aria-label={showNew ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
                                className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-gray-500 dark:text-slate-400"
                            >
                                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('confirmNewPassword', 'Confirm New Password')}
                        </label>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                            minLength={8}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {isSubmitting ? t('changing', 'Changing...') : t('changePassword', 'Change Password')}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PortalPasswordChange;
