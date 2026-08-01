import { Activity, AlertTriangle, Download, Microscope, Plus, Server, Upload } from 'lucide-react';

const Stat = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const toneClasses = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition-colors dark:border-slate-800 dark:bg-slate-900">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone] || toneClasses.slate}`}>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-5 tracking-tight text-slate-900 dark:text-white">{value}</span>
        <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </span>
    </div>
  );
};

const HeaderButton = ({ children, onClick, primary = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${
      primary
        ? 'bg-cyan-700 text-white shadow-sm shadow-cyan-900/10 hover:bg-cyan-600 focus:ring-cyan-500 active:scale-[0.98]'
        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

const ClinicalHeader = ({
  t,
  metrics,
  maintenanceMachines,
  onFilterMaintenance,
  onExport,
  onImport,
  onAddMachine,
  onAddExam,
}) => (
  <header className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-700 text-white shadow-sm">
            <Microscope size={20} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              {t('settings.clinical.eyebrow', 'Clinical operations')}
            </p>
            <h2 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
              {t('settings.clinical.title', 'Machines & examinations')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {t(
                'settings.clinical.description',
                'Manage machine availability and the examination catalog used by scheduling.'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
        <HeaderButton onClick={onExport}>
          <Download size={16} />
          {t('settings.clinical.export', 'Export')}
        </HeaderButton>
        <HeaderButton onClick={onImport}>
          <Upload size={16} />
          {t('settings.clinical.import', 'Import')}
        </HeaderButton>
        <HeaderButton onClick={onAddMachine}>
          <Server size={16} />
          {t('settings.clinical.addMachine', 'Machine')}
        </HeaderButton>
        <HeaderButton onClick={onAddExam} primary>
          <Plus size={16} strokeWidth={2.5} />
          {t('settings.clinical.addExam', 'Procedure')}
        </HeaderButton>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat icon={Server} label={t('settings.clinical.metrics.machines', 'machines')} value={metrics.machines} />
      <Stat icon={Activity} label={t('settings.clinical.metrics.activeMachines', 'active machines')} value={metrics.activeMachines} tone="emerald" />
      <Stat icon={Microscope} label={t('settings.clinical.metrics.exams', 'procedures')} value={metrics.exams} tone="cyan" />
      <Stat icon={AlertTriangle} label={t('settings.clinical.metrics.contrastExams', 'contrast procedures')} value={metrics.contrastExams} tone="amber" />
    </div>

    {maintenanceMachines.length > 0 && (
      <button
        type="button"
        onClick={onFilterMaintenance}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-left text-sm text-amber-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50 dark:focus:ring-offset-slate-950"
      >
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <AlertTriangle size={15} />
          </span>
          <span className="truncate font-medium">
            {t('settings.clinical.maintenanceNotice', '{{count}} machine(s) need attention before scheduling.', {
              count: maintenanceMachines.length,
            })}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
          {t('settings.clinical.viewMaintenance', 'View')}
        </span>
      </button>
    )}
  </header>
);

export default ClinicalHeader;
