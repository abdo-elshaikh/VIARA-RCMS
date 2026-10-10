import { Check, Clock3, Edit3, Eye, Trash2, X } from 'lucide-react';

const IconButton = ({ children, onClick, label, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
      danger
        ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'
    }`}
  >
    {children}
  </button>
);

const ProcedureRow = ({ exam, isSelected, onToggleSelect, onToggleActive, onEdit, onDelete, onPreview, t }) => (
  <div
    onClick={() => onToggleSelect(exam.id, !isSelected)}
    className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-all cursor-pointer ${
      isSelected
        ? 'border-s-4 border-s-emerald-600 border-emerald-300 bg-emerald-50/80 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:border-s-emerald-400'
        : 'border-slate-200/70 bg-white/80 hover:border-slate-300 dark:border-slate-800/70 dark:hover:border-slate-700'
    } ${!exam.active ? 'opacity-60' : ''}`}
  >
    <div className="flex items-center gap-2.5 min-w-0 flex-1">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(event) => {
          event.stopPropagation();
          onToggleSelect(exam.id, event.target.checked);
        }}
        onClick={(event) => event.stopPropagation()}
        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 cursor-pointer"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className={`truncate text-xs font-bold ${isSelected ? 'text-emerald-950 dark:text-emerald-200 font-black' : 'text-slate-900 dark:text-white'}`}>{exam.name}</h4>
          <span className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-extrabold ${isSelected ? 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
            {exam.code || 'NO-CODE'}
          </span>
          {exam.anatomy && (
            <span className="hidden sm:inline-block truncate text-[11px] font-semibold text-slate-400">
              · {exam.anatomy}
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
      {/* Duration badge */}
      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400">
        <Clock3 size={11} className="text-slate-400" />
        {exam.durationMinutes || exam.duration || 0}m
      </span>

      {/* Contrast tag */}
      {exam.requiresContrast ? (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          Contrast
        </span>
      ) : null}

      {/* Price */}
      <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white min-w-[65px] text-end">
        ${Number(exam.price || 0).toFixed(2)}
      </span>

      {/* Active toggle button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleActive(exam); }}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
          exam.active
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {exam.active && <Check size={10} />}
        {exam.active ? 'Active' : 'Off'}
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 ms-1">
        <IconButton onClick={(e) => { e.stopPropagation(); onPreview(); }} label="Details"><Eye size={13} /></IconButton>
        <IconButton onClick={(e) => { e.stopPropagation(); onEdit(); }} label="Edit"><Edit3 size={13} /></IconButton>
        <IconButton onClick={(e) => { e.stopPropagation(); onDelete(); }} label="Delete" danger><Trash2 size={13} /></IconButton>
      </div>
    </div>
  </div>
);

const ProcedureList = ({
  t,
  exams,
  selectedExamIds,
  allVisibleExamsSelected,
  someVisibleExamsSelected,
  onToggleVisibleSelection,
  onToggleExamSelection,
  onBulkActiveChange,
  onBulkDelete,
  onToggleActive,
  onEditExam,
  onDeleteExam,
  onPreviewExam,
}) => {
  return (
    <div className="space-y-2">
      {/* Sleek Selection Toolbar Header */}
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 transition-all ${
        selectedExamIds.length > 0
          ? 'border border-emerald-300 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/50 shadow-xs'
          : 'px-1 text-xs font-bold text-slate-500 dark:text-slate-400'
      }`}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allVisibleExamsSelected}
            ref={(input) => {
              if (input) input.indeterminate = someVisibleExamsSelected;
            }}
            onChange={(event) => onToggleVisibleSelection(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 cursor-pointer"
          />
          <span className={`text-xs font-black uppercase tracking-wider ${selectedExamIds.length > 0 ? 'text-emerald-950 dark:text-emerald-100' : ''}`}>
            {selectedExamIds.length > 0 ? `${selectedExamIds.length} Selected` : `All Procedures (${exams.length})`}
          </span>
        </label>

        {selectedExamIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onBulkActiveChange(true)}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
            >
              Activate
            </button>
            <button
              type="button"
              onClick={() => onBulkActiveChange(false)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              Deactivate
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => onToggleVisibleSelection(false)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              title="Clear Selection"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {exams.map((exam) => (
          <ProcedureRow
            key={exam.id}
            exam={exam}
            isSelected={selectedExamIds.includes(exam.id)}
            onToggleSelect={onToggleExamSelection}
            onToggleActive={onToggleActive}
            onEdit={() => onEditExam(exam)}
            onDelete={() => onDeleteExam(exam.id)}
            onPreview={() => onPreviewExam(exam)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
};

export default ProcedureList;
