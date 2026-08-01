import PageHeader from './PageHeader';

const ModulePage = ({ icon: Icon, eyebrow, title, description, tabs, activeTab, onTabChange, children }) => (
    <div className="space-y-6">
        <PageHeader icon={Icon} eyebrow={eyebrow} title={title} description={description} />

        <nav className="flex w-full gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/50 p-2 shadow-sm backdrop-blur-md dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]/75" aria-label={title}>
            {tabs.map(({ id, label, icon: TabIcon }) => (
                <button 
                    type="button" 
                    key={id} 
                    onClick={() => onTabChange(id)} 
                    aria-current={activeTab === id ? 'page' : undefined} 
                    className={`flex min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 ${
                        activeTab === id 
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 dark:bg-cyan-400/16 dark:text-cyan-50 dark:shadow-none dark:ring-1 dark:ring-cyan-300/25' 
                            : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:text-[var(--rcms-muted)] dark:hover:bg-[var(--rcms-surface-hover)] dark:hover:text-[var(--rcms-ink)]'
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
