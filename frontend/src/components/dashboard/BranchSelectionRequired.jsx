import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { setActiveBranch, logOut } from '../../store/authSlice';

export default function BranchSelectionRequired({ user }) {
    const dispatch = useDispatch();
    const { i18n } = useTranslation();
    const isArabic = i18n.language?.startsWith('ar');
    const branches = user.branches || [];
    return (
        <main className="min-h-screen flex items-center justify-center bg-[var(--VIARA-canvas)] p-4" dir={isArabic ? 'rtl' : 'ltr'}>
            <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900" aria-labelledby="branch-selection-title">
                <h1 id="branch-selection-title" className="text-xl font-bold text-slate-900 dark:text-white">
                    {isArabic ? 'اختر فرع العمل' : 'Choose your workspace branch'}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" role="status">
                    {branches.length
                        ? isArabic ? 'اختر أحد الفروع المتاحة لحسابك للمتابعة.' : 'Select one of your available branches to continue.'
                        : isArabic ? 'لا توجد عضوية فرع فعالة لحسابك. تواصل مع مسؤول المؤسسة.' : 'Your account has no active branch membership. Contact your organization administrator.'}
                </p>
                <div className="mt-5 grid gap-3">
                    {branches.map(branch => (
                        <button key={branch.id} type="button" className="ds-button ds-button-primary ds-button-md" onClick={() => dispatch(setActiveBranch(branch.id))}>
                            {isArabic ? branch.name_ar || branch.name || branch.code : branch.name || branch.name_ar || branch.code}
                        </button>
                    ))}
                </div>
                <button type="button" className="ds-button ds-button-secondary ds-button-md mt-5" onClick={() => dispatch(logOut())}>
                    {isArabic ? 'تسجيل الخروج' : 'Sign out'}
                </button>
            </section>
        </main>
    );
}
