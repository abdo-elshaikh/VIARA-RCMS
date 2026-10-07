import React, { useState, useRef, useEffect } from 'react';
import { Activity, AlertTriangle, ChevronDown, Download, Microscope, Plus, Server, Sparkles, Upload } from 'lucide-react';

const FactBadge = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    emerald: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300',
    cyan: 'text-sky-700 bg-sky-500/10 border-sky-500/20 dark:text-sky-300',
    amber: 'text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-300',
    slate: 'text-slate-700 bg-slate-100/80 border-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700'
  };

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xs backdrop-blur-md ${tones[tone] || tones.slate}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="font-mono text-base font-black text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
};

const HeaderButton = ({ children, onClick, primary = false, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
      primary
        ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-500 active:scale-[0.98]'
        : 'border border-slate-200/80 bg-white/90 text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800'
    } ${className}`}
  >
    {children}
  </button>
);

const ClinicalHeader = ({
  t,
  metrics,
  maintenanceMachines,
  onFilterMaintenance,
  onExportMachines,
  onExportExams,
  onImport,
  onAddMachine,
  onAddExam,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const exportRef = useRef(null);
  const importRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
      if (importRef.current && !importRef.current.contains(e.target)) {
        setShowImportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
      <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
      <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4 sm:items-center min-w-0">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
            <Microscope size={26} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
              <Sparkles size={11} />
              <span>{t('settings.clinical.badge', { defaultValue: 'Clinical Modalities & Catalog' })}</span>
            </span>
            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
              {t('settings.clinical.title', { defaultValue: 'Clinical Operations & Catalog' })}
            </h1>
            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
              {t('settings.clinical.description', { defaultValue: 'Configure modality units, procedures, anatomies, and contrast rules.' })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Export Dropdown Menu */}
          <div className="relative" ref={exportRef}>
            <HeaderButton onClick={() => setShowExportMenu(!showExportMenu)}>
              <Download size={14} />
              <span>{t('settings.clinical.export', { defaultValue: 'Export CSV' })}</span>
              <ChevronDown size={12} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </HeaderButton>

            {showExportMenu && (
              <div className="absolute end-0 top-full mt-1 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    onExportMachines?.();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <Server size={14} className="text-teal-600 dark:text-teal-400" />
                  <span>{t('settings.clinical.exportMachines', { defaultValue: 'Export Machines' })}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExportMenu(false);
                    onExportExams?.();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <Microscope size={14} className="text-sky-600 dark:text-sky-400" />
                  <span>{t('settings.clinical.exportExams', { defaultValue: 'Export Procedures' })}</span>
                </button>
              </div>
            )}
          </div>

          {/* Import Dropdown Menu */}
          <div className="relative" ref={importRef}>
            <HeaderButton onClick={() => setShowImportMenu(!showImportMenu)}>
              <Upload size={14} />
              <span>{t('settings.clinical.import', { defaultValue: 'Import CSV' })}</span>
              <ChevronDown size={12} className={`transition-transform ${showImportMenu ? 'rotate-180' : ''}`} />
            </HeaderButton>

            {showImportMenu && (
              <div className="absolute end-0 top-full mt-1 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportMenu(false);
                    onImport?.('machines');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <Server size={14} className="text-teal-600 dark:text-teal-400" />
                  <span>{t('settings.clinical.importMachines', { defaultValue: 'Import Machines' })}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportMenu(false);
                    onImport?.('exams');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <Microscope size={14} className="text-sky-600 dark:text-sky-400" />
                  <span>{t('settings.clinical.importExams', { defaultValue: 'Import Procedures' })}</span>
                </button>
              </div>
            )}
          </div>

          <HeaderButton onClick={onAddMachine}>
            <Server size={14} />
            {t('settings.clinical.addMachine', { defaultValue: '+ Machine' })}
          </HeaderButton>
          <HeaderButton onClick={onAddExam} primary>
            <Plus size={14} strokeWidth={2.5} />
            {t('settings.clinical.addExam', { defaultValue: '+ Procedure' })}
          </HeaderButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FactBadge icon={Server} label={t('settings.clinical.metrics.machines', { defaultValue: 'Total Machines' })} value={metrics.machines} />
        <FactBadge icon={Activity} label={t('settings.clinical.metrics.activeMachines', { defaultValue: 'Online / Active' })} value={metrics.activeMachines} tone="emerald" />
        <FactBadge icon={Microscope} label={t('settings.clinical.metrics.exams', { defaultValue: 'Exam Catalog' })} value={metrics.exams} tone="cyan" />
        <FactBadge icon={AlertTriangle} label={t('settings.clinical.metrics.contrastExams', { defaultValue: 'Contrast Required' })} value={metrics.contrastExams} tone="amber" />
      </div>

      {maintenanceMachines.length > 0 && (
        <button
          type="button"
          onClick={onFilterMaintenance}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-300"
        >
          <div className="flex items-center gap-2.5 font-black">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {t('settings.clinical.maintenanceAlert', {
                defaultValue: '{{count}} machine(s) require maintenance attention.',
                count: maintenanceMachines.length
              })}
            </span>
          </div>
          <span className="font-bold underline text-[11px]">{t('settings.clinical.filterAttention', { defaultValue: 'Filter List' })}</span>
        </button>
      )}
    </header>
  );
};

export default ClinicalHeader;
