import { Edit3, Layers, MapPin, Plus, Server, Trash2 } from 'lucide-react';

import { getModalityIcon } from './clinicalIcons';

const sameId = (left, right) => String(left ?? '') === String(right ?? '');

const statusStyles = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50',
  'Under Maintenance': 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
  'Out of Service': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
};

const Control = ({ value, onChange, children, label }) => (
  <label className="min-w-0">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-auto"
    >
      {children}
    </select>
  </label>
);

const IconButton = ({ children, onClick, label, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`flex h-8 w-8 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
      danger
        ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
    }`}
  >
    {children}
  </button>
);

const MachineCard = ({ machine, isSelected, examCount, onSelect, onEdit, onDelete, onStatusChange, t }) => {
  const Icon = getModalityIcon(machine.machineType || machine.category);
  const status = machine.status || 'Active';
  const detailText = [
    machine.roomNumber && `${t('settings.clinical.machines.room', 'Room')} ${machine.roomNumber}`,
    machine.model,
  ].filter(Boolean).join(' \u00b7 ');

  return (
    <article
      className={`group rounded-xl border bg-white p-3 transition dark:bg-slate-900 ${
        isSelected
          ? 'border-cyan-600 shadow-sm ring-1 ring-cyan-600 dark:border-cyan-500 dark:ring-cyan-500'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <Icon size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{machine.name}</span>
            <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
              {machine.machineType || '-'}{detailText ? ` \u00b7 ${detailText}` : ''}
            </span>
            {machine.location ? (
              <span className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{machine.location}</span>
              </span>
            ) : null}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton onClick={onEdit} label={t('settings.clinical.editMachine', 'Edit machine')}>
            <Edit3 size={15} />
          </IconButton>
          <IconButton onClick={onDelete} label={t('settings.clinical.deleteMachine', 'Delete machine')} danger>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className={`inline-flex items-center rounded-md px-2 py-1 font-medium ring-1 ring-inset ${statusStyles[status] || statusStyles['Out of Service']}`}>
            {t(`settings.clinical.statuses.${status}`, status)}
          </span>
          <span className="truncate">{t('settings.clinical.procedureCount', '{{count}} procedures', { count: examCount })}</span>
        </div>
        <Control value={status} onChange={onStatusChange} label={t('settings.clinical.machines.status', 'Operational status')}>
          <option value="Active">{t('settings.clinical.status.active', 'Active')}</option>
          <option value="Under Maintenance">{t('settings.clinical.status.underMaintenance', 'Under maintenance')}</option>
          <option value="Out of Service">{t('settings.clinical.status.outOfService', 'Out of service')}</option>
        </Control>
      </div>
    </article>
  );
};

const MachineExplorer = ({
  t,
  machines,
  visibleMachines,
  categoriesList,
  selectedCategory,
  machineStatusFilter,
  selectedMachineId,
  examCountsByMachine,
  machinesByCategory,
  onCategoryChange,
  onMachineStatusFilterChange,
  onSelectMachine,
  onStatusChange,
  onEditMachine,
  onDeleteMachine,
  onAddMachine,
}) => (
  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
            <Server size={16} />
          </span>
          <h3 className="text-base font-bold text-slate-950 dark:text-white">{t('settings.clinical.machinesTitle', 'Machines')}</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('settings.clinical.machineVisibility', '{{visible}} of {{total}} machines shown', {
            visible: visibleMachines.length,
            total: machines.length,
          })}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:flex lg:flex-wrap lg:items-center">
        <Control value={machineStatusFilter} onChange={onMachineStatusFilterChange} label={t('settings.clinical.allMachineStatuses', 'All statuses')}>
          <option value="All">{t('settings.clinical.allMachineStatuses', 'All statuses')}</option>
          <option value="Active">{t('settings.clinical.status.active', 'Active')}</option>
          <option value="Attention">{t('settings.clinical.status.attention', 'Needs attention')}</option>
          <option value="Under Maintenance">{t('settings.clinical.status.underMaintenance', 'Under maintenance')}</option>
          <option value="Out of Service">{t('settings.clinical.status.outOfService', 'Out of service')}</option>
        </Control>
        <Control value={selectedCategory} onChange={onCategoryChange} label={t('settings.clinical.allCategories', 'All categories')}>
          <option value="all">{t('settings.clinical.allCategories', 'All categories')}</option>
          {categoriesList.map((category) => (
            <option key={category} value={category}>
              {category} ({machinesByCategory[category]?.length || 0})
            </option>
          ))}
        </Control>
        <button
          type="button"
          onClick={onAddMachine}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 active:scale-[0.98]"
        >
          <Plus size={16} />
          {t('settings.clinical.addMachine', 'Machine')}
        </button>
      </div>
    </div>

    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <button
        type="button"
        onClick={() => onSelectMachine('all')}
        className={`rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
          selectedMachineId === 'all'
            ? 'border-cyan-700 bg-cyan-700 text-white shadow-sm'
            : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:hover:border-slate-700'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selectedMachineId === 'all' ? 'bg-white/15' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <Layers size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t('settings.clinical.allMachines', 'All machines')}</span>
            <span className={`mt-1 block truncate text-xs ${selectedMachineId === 'all' ? 'text-cyan-100' : 'text-slate-500 dark:text-slate-400'}`}>
              {t('settings.clinical.machineCount', '{{count}} machine(s)', { count: machines.length })}
            </span>
          </span>
        </span>
      </button>

      {visibleMachines.map((machine) => (
        <MachineCard
          key={machine.id}
          machine={machine}
          isSelected={sameId(selectedMachineId, machine.id)}
          examCount={examCountsByMachine[machine.id] || 0}
          onSelect={() => onSelectMachine(machine.id)}
          onEdit={() => onEditMachine(machine)}
          onDelete={() => onDeleteMachine(machine.id)}
          onStatusChange={(status) => onStatusChange(machine, status)}
          t={t}
        />
      ))}
    </div>
  </section>
);

export default MachineExplorer;
