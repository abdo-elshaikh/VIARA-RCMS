import React from 'react';
import { Printer, Settings2, X } from 'lucide-react';

export const PrintField = ({ label, children, className = '' }) => (
    <div className={`space-y-2 ${className}`}>
        {label ? (
            <span className="print-field-label">{label}</span>
        ) : null}
        {children}
    </div>
);

export const PrintSection = ({ title, children, className = '' }) => (
    <section className={`print-section ${className}`}>
        {title ? <span className="print-field-label">{title}</span> : null}
        <div className="space-y-2">{children}</div>
    </section>
);

export const PrintSegmented = ({ options, value, onChange, columns = 3, ariaLabel }) => (
    <div
        className="print-segmented"
        style={{ '--print-segmented-columns': columns }}
        role="group"
        aria-label={ariaLabel}
    >
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                aria-pressed={value === option.value}
                className="print-option"
                title={option.title}
            >
                {option.icon ? <option.icon size={12} /> : null}
                <span>{option.label}</span>
            </button>
        ))}
    </div>
);

export const PrintSelectField = ({ label, value, onChange, options, disabled = false }) => (
    <PrintField label={label}>
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className="print-select"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    </PrintField>
);

export const PrintTextInput = ({ label, value, onChange, placeholder, hint, inputMode, mono = true, ...rest }) => (
    <PrintField label={label}>
        <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            inputMode={inputMode}
            className={mono ? 'print-input print-input-mono' : 'print-input'}
            {...rest}
        />
        {hint ? <p className="print-hint">{hint}</p> : null}
    </PrintField>
);

export const PrintTextArea = ({ label, value, onChange, placeholder, rows = 3 }) => (
    <PrintField label={label}>
        <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="print-textarea"
        />
    </PrintField>
);

export const PrintToggle = ({ checked, onChange, label, disabled = false }) => (
    <label className={`print-toggle${disabled ? ' print-toggle-disabled' : ''}`}>
        <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
        />
        <span aria-hidden="true" className="print-toggle-track">
            <span className="print-toggle-thumb" />
        </span>
        <span className="print-toggle-label">{label}</span>
    </label>
);

export const PrintSidebar = ({ title, subtitle, copy, children, onPrint, printLabel, onSave, saveLabel, saveDisabled, saveIcon: SaveIcon, onClose, closeLabel }) => (
    <aside className="print-controls no-print">
        <div className="print-controls-header">
            <span className="print-controls-icon">
                <Settings2 size={20} />
            </span>
            <div className="min-w-0">
                <h2 className="print-controls-title">{title}</h2>
                {subtitle ? <p className="print-controls-subtitle">{subtitle}</p> : null}
            </div>
        </div>

        <div className="print-controls-body">{children}</div>

        <div className="print-controls-actions">
            {onSave ? (
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saveDisabled}
                    className="print-action print-action-secondary"
                >
                    {SaveIcon ? <SaveIcon size={15} /> : null}
                    <span>{saveDisabled ? copy?.saving || 'Saving...' : saveLabel}</span>
                </button>
            ) : null}
            <button type="button" onClick={onPrint} className="print-action print-action-primary">
                <Printer size={15} />
                <span>{printLabel}</span>
            </button>
            {onClose ? (
                <button type="button" onClick={onClose} className="print-action print-action-close" title={closeLabel} aria-label={closeLabel}>
                    <X size={15} />
                </button>
            ) : null}
        </div>
    </aside>
);

export const PrintStage = ({ children, label }) => (
    <main className="print-preview-stage" aria-label={label}>
        {children}
    </main>
);
