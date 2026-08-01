import { FilterX, Search, SlidersHorizontal, X } from 'lucide-react';

const SelectField = ({ value, onChange, children, label }) => (
  <label className="min-w-0">
    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      {children}
    </select>
  </label>
);

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
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:p-4">
    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      <SlidersHorizontal size={13} />
      {t('settings.clinical.filters', 'Filters')}
    </div>

    <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-end">
      <label className="min-w-0">
        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t('settings.clinical.searchLabel', 'Search')}
        </span>
        <span className="relative block">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('settings.clinical.searchPlaceholder', 'Search procedure, code, machine...')}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white ps-10 pe-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={t('settings.clinical.clearSearch', 'Clear search')}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(140px,180px)_minmax(140px,170px)_minmax(140px,170px)_minmax(140px,170px)_auto]">
        <SelectField value={selectedAnatomy} onChange={onAnatomyChange} label={t('settings.clinical.anatomy', 'Anatomy')}>
          <option value="all">{t('settings.clinical.allAnatomies', 'All anatomy')}</option>
          {anatomiesList.map((anatomy) => (
            <option key={anatomy} value={anatomy}>
              {anatomy}
            </option>
          ))}
        </SelectField>

        <SelectField value={statusFilter} onChange={onStatusFilterChange} label={t('settings.clinical.statusLabel', 'Status')}>
          <option value="All">{t('settings.clinical.allStatuses', 'All status')}</option>
          <option value="Active">{t('settings.clinical.activeOnly', 'Active')}</option>
          <option value="Inactive">{t('settings.clinical.inactiveOnly', 'Inactive')}</option>
        </SelectField>

        <SelectField value={contrastFilter} onChange={onContrastFilterChange} label={t('settings.clinical.contrast', 'Contrast')}>
          <option value="All">{t('settings.clinical.anyContrast', 'Any contrast')}</option>
          <option value="contrast">{t('settings.clinical.withContrast', 'Contrast')}</option>
          <option value="no-contrast">{t('settings.clinical.withoutContrast', 'No contrast')}</option>
        </SelectField>

        <SelectField value={sortBy} onChange={onSortByChange} label={t('settings.clinical.sort.label', 'Sort')}>
          <option value="name-asc">{t('settings.clinical.sort.nameAsc', 'Name A-Z')}</option>
          <option value="name-desc">{t('settings.clinical.sort.nameDesc', 'Name Z-A')}</option>
          <option value="duration-asc">{t('settings.clinical.sort.durationAsc', 'Shortest')}</option>
          <option value="duration-desc">{t('settings.clinical.sort.durationDesc', 'Longest')}</option>
        </SelectField>

        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <FilterX size={16} />
          {t('settings.clinical.clearFilters', 'Clear')}
        </button>
      </div>
    </div>
  </div>
);

export default ClinicalFilterPanel;
