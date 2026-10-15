import { useState, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight, Edit3, Layers, MapPin, Plus, Server, ShieldAlert, Trash2 } from 'lucide-react';
import { getModalityIcon } from './clinicalIcons';

const sameId = (left, right) => String(left ?? '') === String(right ?? '');

const statusDot = {
  Active: 'bg-emerald-500',
  'Under Maintenance': 'bg-amber-500 animate-pulse',
  'Out of Service': 'bg-rose-500',
};

const statusStyle = {
  Active: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  'Under Maintenance': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  'Out of Service': 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
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
}) => {
  const modalityScrollRef = useRef(null);
  const [showInspector] = useState(true);

  const scrollModalities = (direction) => {
    if (modalityScrollRef.current) {
      const isRtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl';
      const factor = isRtl ? -1 : 1;
      const amount = (direction === 'left' ? -260 : 260) * factor;
      modalityScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const selectedMachine = machines.find((m) => sameId(m.id, selectedMachineId));

  const SELECT_STYLE = "h-8 min-w-[130px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs outline-none transition focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70 sm:p-4">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Server size={14} />
          </span>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {t('settings.clinical.machinesTitle', { defaultValue: 'Modality Units & Equipment' })}
            </h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {visibleMachines.length}/{machines.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={machineStatusFilter}
            onChange={(e) => onMachineStatusFilterChange(e.target.value)}
            className={SELECT_STYLE}
          >
            <option value="All">{t('settings.clinical.allMachineStatuses', { defaultValue: 'All Statuses' })}</option>
            <option value="Active">{t('settings.clinical.status.active', { defaultValue: 'Active Units' })}</option>
            <option value="Attention">{t('settings.clinical.status.attention', { defaultValue: 'Needs Attention' })}</option>
            <option value="Under Maintenance">{t('settings.clinical.status.underMaintenance', { defaultValue: 'Under Maintenance' })}</option>
            <option value="Out of Service">{t('settings.clinical.status.outOfService', { defaultValue: 'Out of Service' })}</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={SELECT_STYLE}
          >
            <option value="all">{t('settings.clinical.allCategories', { defaultValue: 'All Modalities' })}</option>
            {categoriesList.map((category) => (
              <option key={category} value={category}>
                {category} ({machinesByCategory[category]?.length || 0})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onAddMachine}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 active:scale-[0.98] dark:bg-emerald-500 dark:text-slate-950"
          >
            <Plus size={14} />
            <span>{t('settings.clinical.addMachine', { defaultValue: 'Add Unit' })}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Machine Selector Bar with RTL Arrow Flip */}
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => scrollModalities('left')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Scroll Left"
        >
          <ChevronLeft size={16} className="rtl:rotate-180" />
        </button>

        <div
          ref={modalityScrollRef}
          className="flex flex-1 items-center gap-2 overflow-x-auto scroll-smooth py-1 px-0.5"
          style={{ scrollbarWidth: 'none' }}
        >
          <button
            type="button"
            onClick={() => onSelectMachine('all')}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              selectedMachineId === 'all'
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {selectedMachineId === 'all' ? <Check size={14} className="stroke-[3]" /> : <Layers size={14} />}
            <span>{t('settings.clinical.allMachines', { defaultValue: 'All Modalities' })}</span>
            <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold ${selectedMachineId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              {machines.length}
            </span>
          </button>

          {visibleMachines.map((machine) => {
            const Icon = getModalityIcon(machine.machineType || machine.category);
            const isSelected = sameId(selectedMachineId, machine.id);
            const count = examCountsByMachine[machine.id] || 0;
            const status = machine.status || 'Active';
            const isMaintenance = status !== 'Active';

            return (
              <div
                key={machine.id}
                onClick={() => onSelectMachine(isSelected ? 'all' : machine.id)}
                className={`group flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/30 dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                    : isMaintenance
                    ? 'border-amber-200 bg-amber-50/70 text-amber-950 hover:border-amber-300 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200'
                    : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-start whitespace-nowrap">
                  {isSelected ? (
                    <Check size={14} className="shrink-0 text-white stroke-[3]" />
                  ) : (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot[status] || 'bg-slate-400'}`} />
                  )}
                  <Icon size={14} className={`shrink-0 ${isSelected ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span className={`font-black ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{machine.name}</span>
                  <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {count}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 ms-1 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEditMachine(machine); }}
                    className={`p-1 rounded-md transition ${isSelected ? 'text-emerald-100 hover:text-white hover:bg-emerald-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    title="Edit Unit"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteMachine(machine.id); }}
                    className={`p-1 rounded-md transition ${isSelected ? 'text-rose-200 hover:text-white hover:bg-emerald-700' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                    title="Delete Unit"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollModalities('right')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Scroll Right"
        >
          <ChevronRight size={16} className="rtl:rotate-180" />
        </button>
      </div>

      {/* Selected Machine Quick Inspector Drawer */}
      {selectedMachine && showInspector && (
        <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/70 p-3 shadow-2xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-black text-xs shadow-xs">
                {selectedMachine.machineType?.slice(0, 2) || 'EQ'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="truncate font-black text-xs text-slate-900 dark:text-white">{selectedMachine.name}</h4>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusStyle[selectedMachine.status || 'Active']}`}>
                    {selectedMachine.status || 'Active'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {selectedMachine.roomNumber && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} className="text-slate-400" />
                      <span>{t('settings.clinical.machines.room', { defaultValue: 'Room' })} {selectedMachine.roomNumber}</span>
                    </span>
                  )}
                  {selectedMachine.location && <span>{selectedMachine.location}</span>}
                  {selectedMachine.model && <span>{selectedMachine.manufacturer} {selectedMachine.model}</span>}
                  {selectedMachine.serialNumber && <span className="font-mono text-[10px]">SN: {selectedMachine.serialNumber}</span>}
                </div>
              </div>
            </div>

            {/* Status Quick Switcher Dropdown */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('settings.clinical.statusLabel', { defaultValue: 'Status' })}:</span>
                <select
                  value={selectedMachine.status || 'Active'}
                  onChange={(e) => onStatusChange(selectedMachine, e.target.value)}
                  className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-2xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="Active">{t('settings.clinical.status.active', { defaultValue: 'Active' })}</option>
                  <option value="Under Maintenance">{t('settings.clinical.status.underMaintenance', { defaultValue: 'Under Maintenance' })}</option>
                  <option value="Out of Service">{t('settings.clinical.status.outOfService', { defaultValue: 'Out of Service' })}</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => onEditMachine(selectedMachine)}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Edit3 size={12} />
                <span>{t('settings.clinical.configure', { defaultValue: 'Configure' })}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {visibleMachines.length === 0 && (
        <div className="p-6 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
          <ShieldAlert size={24} className="mx-auto mb-2 text-slate-400" />
          <p>{t('settings.clinical.emptyMachines', { defaultValue: 'No modality units match current filters.' })}</p>
        </div>
      )}
    </section>
  );
};

export default MachineExplorer;
