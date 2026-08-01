import React from 'react';

const SkeletonRows = ({ rows = 5, cols = 5 }) => (
    <tbody className="divide-y divide-slate-50">
        {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
                {Array.from({ length: cols }).map((__, c) => (
                    <td key={c} className="px-5 py-4">
                        <div className="h-3.5 animate-pulse rounded-full bg-slate-100" style={{ width: `${55 + ((r + c) % 4) * 10}%` }} />
                    </td>
                ))}
            </tr>
        ))}
    </tbody>
);

export default SkeletonRows;
