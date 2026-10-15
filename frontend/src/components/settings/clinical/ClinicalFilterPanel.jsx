import { FilterX, Search, X } from 'lucide-react';

const ClinicalFilterPanel = ({
  t,
  query,
  selectedAnatomy,
  statusFilter,
  contrastFilter,
  sortBy,
  anatomiesList,
  onQueryChange,
  onAnatomyChange,
  onStatusFilterChange,
  onContrastFilterChange,
  onSortByChange,
  onClear,
}) => {
  const hasActiveFilters = query || selectedAnatomy !== 'all' || statusFilter !== 'All' || contrastFilter !== 'All';

  const SELECT_STYLE = "h-9 min-w-[130px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs outline-none transition focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
      {/* Compact Search Bar */}
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('settings.clinical.searchPlaceholder', { defaultValue: 'Search procedure, code, anatomy...' })}
          className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-800 shadow-2xs outline-none transition placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute end-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Anatomy Dropdown */}
      <select
        value={selectedAnatomy}
        onChange={(e) => onAnatomyChange(e.target.value)}
        className={SELECT_STYLE}
      >
        <option value="all">{t('settings.clinical.allAnatomies', { defaultValue: 'All Anatomy' })}</option>
        {anatomiesList.map((anatomy) => (
          <option key={anatomy} value={anatomy}>{anatomy}</option>
        ))}
      </select>

      {/* Status Dropdown */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className={SELECT_STYLE}
      >
        <option value="All">{t('settings.clinical.allStatuses', { defaultValue: 'All Status' })}</option>
        <option value="Active">{t('settings.clinical.activeOnly', { defaultValue: 'Active Only' })}</option>
        <option value="Inactive">{t('settings.clinical.inactiveOnly', { defaultValue: 'Inactive Only' })}</option>
      </select>

      {/* Contrast Dropdown */}
      <select
        value={contrastFilter}
        onChange={(e) => onContrastFilterChange(e.target.value)}
        className={SELECT_STYLE}
      >
        <option value="All">{t('settings.clinical.anyContrast', { defaultValue: 'Any Contrast' })}</option>
        <option value="contrast">{t('settings.clinical.withContrast', { defaultValue: 'Contrast Req.' })}</option>
        <option value="no-contrast">{t('settings.clinical.withoutContrast', { defaultValue: 'No Contrast' })}</option>
      </select>

      {/* Sort Order Dropdown */}
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value)}
        className={SELECT_STYLE}
      >
        <option value="name-asc">{t('settings.clinical.sort.nameAsc', { defaultValue: 'Sort: Name A-Z' })}</option>
        <option value="name-desc">{t('settings.clinical.sort.nameDesc', { defaultValue: 'Sort: Name Z-A' })}</option>
        <option value="duration-asc">{t('settings.clinical.sort.durationAsc', { defaultValue: 'Sort: Shortest' })}</option>
        <option value="duration-desc">{t('settings.clinical.sort.durationDesc', { defaultValue: 'Sort: Longest' })}</option>
      </select>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
        >
          <FilterX size={14} />
          <span>{t('settings.clinical.clearFilters', { defaultValue: 'Clear' })}</span>
        </button>
      )}
    </div>
  );
};

export default ClinicalFilterPanel;
