import { useState, useRef, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Building2, ChevronDown, Check, MapPin, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    selectCurrentUser,
    selectActiveBranchId,
    setActiveBranch
} from '../../store/authSlice';

export default function BranchSwitcher({ className = '' }) {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'ar';
    const dispatch = useDispatch();

    const user = useSelector(selectCurrentUser);
    const activeBranchId = useSelector(selectActiveBranchId);

    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    const branches = useMemo(() => {
        if (!user || !Array.isArray(user.branches)) return [];
        return user.branches;
    }, [user]);

    const activeBranch = useMemo(() => {
        if (!branches.length) return null;
        return branches.find(b => b.id === activeBranchId) || null;
    }, [branches, activeBranchId]);

    const canSwitch = branches.length > 1 || Boolean(user?.is_org_admin || user?.role === 'Developer');

    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('pointerdown', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handleOutsideClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!activeBranch && !branches.length) {
        return null;
    }

    const hasUnsavedChanges = () => {
        if (typeof window !== 'undefined' && window.__VIARA_HAS_DIRTY_FORM__) return true;
        const dirtyInputs = document.querySelectorAll('input[data-dirty="true"], textarea[data-dirty="true"], form[data-dirty="true"]');
        return dirtyInputs.length > 0;
    };

    const handleSelectBranch = (branch) => {
        if (branch.id === activeBranchId) {
            setIsOpen(false);
            return;
        }

        if (hasUnsavedChanges()) {
            const confirmMsg = isRtl
                ? 'تنبيه: توجد تعديلات غير محفوظة في النموذج الحالي. هل ترغب بالتأكيد في تبديل الفرع؟ قد يتم فقدان التغييرات غير المحفوظة.'
                : 'Warning: You have unsaved changes in the current form. Are you sure you want to switch branches? Unsaved changes may be lost.';
            if (!window.confirm(confirmMsg)) {
                setIsOpen(false);
                return;
            }
        }

        dispatch(setActiveBranch(branch.id));
        setIsOpen(false);
        const branchDisplayName = (isRtl && branch.name_ar) ? branch.name_ar : branch.name;
        toast.success(
            isRtl
                ? `تم التبديل إلى ${branchDisplayName}`
                : `Switched active branch to ${branchDisplayName}`,
            { icon: '🏢' }
        );
    };

    const displayName = activeBranch
        ? ((isRtl && activeBranch.name_ar) ? activeBranch.name_ar : activeBranch.name)
        : (isRtl ? 'اختر الفرع' : 'Select a branch');

    if (!canSwitch) {
        // Static branch badge for single-branch staff
        return (
            <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs ${className}`}
                title={isRtl ? `الفرع المخصص: ${displayName}` : `Assigned Branch: ${displayName}`}
            >
                <Building2 size={13} className="text-primary-600 dark:text-primary-400 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-[160px]">{displayName}</span>
                {activeBranch?.code && (
                    <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-400">
                        {activeBranch.code}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={`relative ${className}`} ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs hover:shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title={isRtl ? 'تبديل فرع العمل' : 'Switch active facility branch'}
            >
                <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 shrink-0">
                    <Building2 size={12} />
                </div>
                <div className="flex items-center gap-1 min-w-0 text-start">
                    <span className="truncate max-w-[110px] sm:max-w-[150px] font-bold text-[12px]">
                        {displayName}
                    </span>
                    {activeBranch?.code && (
                        <span className="hidden sm:inline-block text-[10px] font-mono px-1 py-0.2 rounded bg-primary-100/60 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                            {activeBranch.code}
                        </span>
                    )}
                </div>
                <ChevronDown
                    size={13}
                    className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-primary-600' : ''}`}
                />
            </button>

            {isOpen && (
                <div
                    role="menu"
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className="absolute start-0 top-full mt-2 w-64 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in-50 zoom-in-95 duration-150"
                >
                    <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span>{isRtl ? 'الفروع المصرح بها' : 'Authorized Branches'}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {branches.length}
                            </span>
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-0.5 py-0.5">
                        {branches.map((branch) => {
                            const isSelected = branch.id === activeBranch?.id;
                            const itemDisplayName = (isRtl && branch.name_ar) ? branch.name_ar : branch.name;
                            return (
                                <button
                                    key={branch.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleSelectBranch(branch)}
                                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-start text-xs font-semibold transition-colors duration-150 ${
                                        isSelected
                                            ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-bold'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-lg shrink-0 ${
                                                isSelected
                                                    ? 'bg-primary-600 text-white shadow-2xs'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                            }`}
                                        >
                                            <MapPin size={12} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate">{itemDisplayName}</span>
                                                {branch.is_main && (
                                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 shrink-0 font-bold">
                                                        {isRtl ? 'الرئيسي' : 'HQ'}
                                                    </span>
                                                )}
                                            </div>
                                            {branch.city && (
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-normal">
                                                    {branch.city}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500">
                                            {branch.code}
                                        </span>
                                        {isSelected && (
                                            <Check size={14} className="text-primary-600 dark:text-primary-400 ms-1" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
