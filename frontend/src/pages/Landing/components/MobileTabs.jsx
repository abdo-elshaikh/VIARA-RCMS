import React from 'react';
import { BarChart2, ScanLine, Workflow } from 'lucide-react';

const TAB_ICONS = {
    overview: BarChart2,
    modules: ScanLine,
    workflow: Workflow,
};

export const MobileTabs = ({ items, activeTab, onChange, isRtl, label }) => (
    <nav className="command-mobile-tabs" aria-label={label}>
        <div role="tablist" aria-orientation="horizontal">
            {items.map((item, index) => {
                const Icon = TAB_ICONS[item.id] || BarChart2;
                const active = activeTab === item.id;

                const handleKeyDown = (event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const direction = isRtl ? -1 : 1;
                    let nextIndex = index;
                    if (event.key === 'Home') nextIndex = 0;
                    if (event.key === 'End') nextIndex = items.length - 1;
                    if (event.key === 'ArrowRight') nextIndex = (index + direction + items.length) % items.length;
                    if (event.key === 'ArrowLeft') nextIndex = (index - direction + items.length) % items.length;
                    const nextItem = items[nextIndex];
                    onChange(nextItem.id);
                    document.getElementById(`command-tab-${nextItem.id}`)?.focus();
                };

                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        id={`command-tab-${item.id}`}
                        aria-selected={active}
                        aria-controls={item.id}
                        tabIndex={active ? 0 : -1}
                        className={active ? 'is-active' : ''}
                        onClick={() => onChange(item.id)}
                        onKeyDown={handleKeyDown}
                    >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    </nav>
);
