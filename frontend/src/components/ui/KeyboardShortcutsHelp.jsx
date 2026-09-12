import { useState } from 'react';
import { Command } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectIsAuthenticated } from '../../store/authSlice';
import Modal from './Modal';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';

const KeyboardShortcutsHelp = ({ renderTrigger = null, showFloatingButton = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const { t, i18n } = useTranslation('system');
    const isArabic = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('ar');

    // Open on '?' keypress when authenticated
    useKeyboardShortcut('?', () => { if (isAuthenticated) setIsOpen(true); }, { ignoreInputs: true });

    if (!isAuthenticated) return null;

    const shortcutSections = [
        {
            category: isArabic ? 'التنقل العام' : 'Global Navigation',
            items: [
                { keys: ['?'], label: isArabic ? 'عرض دليل اختصارات لوحة المفاتيح' : 'Show keyboard shortcuts modal' },
                { keys: ['Ctrl', 'K'], label: isArabic ? 'البحث الشامل الفوري (المرضى، الأجهزة، الشاشات)' : 'Global quick search (Patients, Modalities, Pages)' },
                { keys: ['Alt', 'D'], label: isArabic ? 'الانتقال السريع للوحة التحكم الرئيسية' : 'Jump to Main Dashboard' },
                { keys: ['Esc'], label: isArabic ? 'إغلاق النوافذ المنبثقة والقوائم الجانبية النشطة' : 'Close active modal, drawer, or dialog' }
            ]
        },
        {
            category: isArabic ? 'التقارير الطبية وسير العمل' : 'Clinical & Reporting',
            items: [
                { keys: ['Ctrl', 'S'], label: isArabic ? 'حفظ مسودة التقرير الطبي / الإعدادات فوراً' : 'Quick save report draft / settings' },
                { keys: ['Ctrl', 'Enter'], label: isArabic ? 'اعتماد وتوقيع التقرير الطبي إلكترونياً' : 'Finalize & Electronically sign report' },
                { keys: ['Ctrl', 'Space'], label: isArabic ? 'إدراج قالب تقرير أو عبارة سريرية جاهزة' : 'Insert template or macro snippet' }
            ]
        },
        {
            category: isArabic ? 'مستعرض صور الأشعة PACS' : 'PACS DICOM Diagnostic Viewer',
            items: [
                { keys: ['W'], label: isArabic ? 'أداة ضبط التباين والإضاءة (Window / Level)' : 'Window / Level contrast tool' },
                { keys: ['Z'], label: isArabic ? 'أداة التكبير والتصغير (Zoom)' : 'Zoom in / out tool' },
                { keys: ['P'], label: isArabic ? 'أداة تحريك الصورة (Pan)' : 'Pan image tool' },
                { keys: ['M'], label: isArabic ? 'أداة قياس المسافات (Ruler)' : 'Distance measurement tool' },
                { keys: ['A'], label: isArabic ? 'أداة قياس الزوايا (Angle)' : 'Angle measurement tool' },
                { keys: ['F'], label: isArabic ? 'تبديل وضع ملء الشاشة' : 'Toggle Fullscreen view' },
                { keys: ['Space'], label: isArabic ? 'تشغيل / إيقاف تحريك مقاطع الفحص (Cine Loop)' : 'Play / Pause Cine loop animation' }
            ]
        }
    ];

    return (
        <>
            {renderTrigger
                ? renderTrigger({
                    open: () => setIsOpen(true),
                    label: t('shortcuts.open', { defaultValue: 'Show keyboard shortcuts' }),
                    title: t('shortcuts.buttonTitle', { defaultValue: 'Keyboard shortcuts (?)' })
                })
                : showFloatingButton && (
                    <button
                        type="button"
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-5 end-5 z-40 hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--VIARA-accent-dark)] bg-[var(--VIARA-accent)] text-white shadow-lg shadow-[rgba(var(--VIARA-accent-rgb),0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--VIARA-accent-dark)] sm:flex"
                        aria-label={t('shortcuts.open', { defaultValue: 'Show keyboard shortcuts' })}
                        title={t('shortcuts.buttonTitle', { defaultValue: 'Keyboard shortcuts (?)' })}
                    >
                        <Command size={18} />
                    </button>
                )}
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={t('shortcuts.title', { defaultValue: 'Keyboard shortcuts' })} size="lg">
                <div className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
                    {shortcutSections.map((section) => (
                        <section key={section.category}>
                            <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                {section.category}
                            </h4>
                            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40">
                                {section.items.map(({ keys, label }) => (
                                    <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                            {label}
                                        </span>
                                        <div className="flex shrink-0 gap-1.5">
                                            {keys.map((key) => (
                                                <kbd
                                                    key={key}
                                                    className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
                <p className="mt-6 rounded-xl border border-[rgba(var(--VIARA-accent-rgb),0.18)] bg-[var(--VIARA-accent-soft)] p-3.5 text-xs font-medium leading-relaxed text-[var(--VIARA-accent-dark)] dark:text-emerald-300">
                    <strong>{isArabic ? 'تلميح:' : 'Tip:'}</strong> {isArabic ? 'اضغط على مفتاح ؟ (Shift + /) في أي وقت لفتح هذه النافذة.' : 'Press ? (Shift + /) at any time to open this shortcut reference.'}
                </p>
            </Modal>
        </>
    );
};

export default KeyboardShortcutsHelp;
