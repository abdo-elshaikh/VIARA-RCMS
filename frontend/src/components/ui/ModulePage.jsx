import PageHeader from './PageHeader';

const ModulePage = ({ icon: Icon, eyebrow, title, description, tabs, activeTab, onTabChange, children }) => (
    <div className="space-y-6">
        <PageHeader icon={Icon} eyebrow={eyebrow} title={title} description={description} />

        <nav className="flex w-full gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/50 p-2 shadow-sm backdrop-blur-md dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]/75" aria-label={title}>
            {tabs.map(({ id, label, icon: TabIcon }) => (
                <button
                    type="button"
                    key={id}
                    onClick={() => onTabChange(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                    className={`flex min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${activeTab === id
                            ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-md shadow-[rgba(var(--VIARA-accent-rgb),0.24)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.18)] dark:text-[var(--VIARA-accent-text)] dark:shadow-none dark:ring-1 dark:ring-[rgba(var(--VIARA-accent-rgb),0.28)]'
                            : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-[var(--VIARA-ink)]'
                        }`}
                >
                    <TabIcon size={18} />
                    {label}
                </button>
            ))}
        </nav>

        <div className="animate-fade-in">{children}</div>
    </div>
);

export default ModulePage;
