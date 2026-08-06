import { useId } from 'react';

const AccessibleChartData = ({
    title,
    summary,
    rows,
    columns,
    children,
    disclosureLabel = 'View chart data',
    tableLabel,
    className = '',
}) => {
    const descriptionId = `chart-data-${useId().replace(/:/g, '')}`;

    return (
        <div className={className}>
            <div role="img" aria-label={title} aria-describedby={descriptionId}>
                {children}
            </div>
            <p id={descriptionId} className="sr-only">{summary}</p>
            <details className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                <summary className="w-fit cursor-pointer rounded-lg font-bold text-cyan-700 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:text-cyan-300 dark:focus-visible:ring-offset-slate-900">
                    {disclosureLabel}
                </summary>
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-max text-start text-xs">
                        <caption className="sr-only">{tableLabel || title}</caption>
                        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <tr>
                                {columns.map((column) => (
                                    <th key={column.key} scope="col" className="px-3 py-2 font-bold">
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={row.id ?? `${rowIndex}`} className="border-t border-slate-100 dark:border-slate-800">
                                    {columns.map((column, columnIndex) => (
                                        <td key={column.key} className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                                            {column.render ? column.render(row, rowIndex) : row[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
};

export default AccessibleChartData;
