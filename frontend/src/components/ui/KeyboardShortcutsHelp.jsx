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
    const { t } = useTranslation('system');
    useKeyboardShortcut('?', () => { if (isAuthenticated) setIsOpen(true); });

    if (!isAuthenticated) return null;

    const shortcuts = [
        { category: t('shortcuts.groups.general'), items: [[['?'], t('shortcuts.items.show')], [['Esc'], t('shortcuts.items.close')], [['Ctrl', 'K'], t('shortcuts.items.search')]] },
        { category: t('shortcuts.groups.navigation'), items: [[['Ctrl', '/'], t('shortcuts.items.focus')]] },
    ];

    return (
        <>
            {renderTrigger
                ? renderTrigger({
                    open: () => setIsOpen(true),
                    label: t('shortcuts.open'),
                    title: t('shortcuts.buttonTitle')
                })
                : showFloatingButton && (
                    <button type="button" onClick={() => setIsOpen(true)} className="fixed bottom-5 end-5 z-40 hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--VIARA-accent-dark)] bg-[var(--VIARA-accent)] text-white shadow-lg shadow-[rgba(var(--VIARA-accent-rgb),0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--VIARA-accent-dark)] sm:flex" aria-label={t('shortcuts.open')} title={t('shortcuts.buttonTitle')}><Command size={18} /></button>
                )}
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={t('shortcuts.title')} size="default">
                <div className="space-y-6">
                    {shortcuts.map((section) => <section key={section.category}><h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{section.category}</h4><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{section.items.map(([keys, description]) => <div key={description} className="flex items-center justify-between gap-5 px-4 py-3"><span className="text-sm text-slate-600">{description}</span><div className="flex shrink-0 gap-1">{keys.map((key) => <kbd key={key} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 shadow-sm">{key}</kbd>)}</div></div>)}</div></section>)}
                </div>
                <p className="mt-6 rounded-xl border border-[rgba(var(--VIARA-accent-rgb),0.18)] bg-[var(--VIARA-accent-soft)] p-4 text-sm leading-6 text-[var(--VIARA-accent-dark)]"><strong>{t('shortcuts.tipLabel')}</strong> {t('shortcuts.tip')}</p>
            </Modal>
        </>
    );
};

export default KeyboardShortcutsHelp;
