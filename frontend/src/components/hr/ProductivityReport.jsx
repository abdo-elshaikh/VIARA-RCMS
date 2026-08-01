import React, { useState } from 'react';
import { useGetProductivityReportQuery } from '../../store/api';
import { Award, Filter, Target, TrendingUp, Users } from 'lucide-react';

const ProductivityReport = () => {
    // Default to current month
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10),
        endDate: new Date().toISOString().substring(0, 10)
    });

    const { data: report = [], isLoading } = useGetProductivityReportQuery(dateRange);

    const receptionists = report.filter(r => r.role === 'Receptionist').sort((a, b) => b.metric_count - a.metric_count);
    const technicians = report.filter(r => r.role === 'Technician').sort((a, b) => b.metric_count - a.metric_count);

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <div className="flex flex-col gap-4 border-b border-slate-100/80 pb-6 dark:border-white/5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 shadow-md dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30">
                            <Target size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">Staff Productivity & KPIs</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">Track key operational output by role across the selected period.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-slate-900">
                        <Filter size={15} className="ms-1 text-slate-400" />
                        <input
                            type="date"
                            className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                            value={dateRange.startDate}
                            onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })}
                        />
                        <span className="px-1 text-xs font-black text-slate-400">to</span>
                        <input
                            type="date"
                            className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                            value={dateRange.endDate}
                            onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })}
                        />
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {/* Receptionists */}
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between border-b border-slate-100/80 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/5">
                            <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">Receptionist Performance</h3>
                            <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                                Invoices Generated
                            </span>
                        </div>
                        <div className="p-5">
                            {isLoading ? (
                                <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse">Calculating productivity...</div>
                            ) : receptionists.length === 0 ? (
                                <div className="py-8 text-center text-xs font-medium text-slate-400">No invoice generation records in this date range.</div>
                            ) : (
                                <div className="space-y-3">
                                    {receptionists.map((r, index) => (
                                        <div key={r.user_id} className="flex items-center justify-between rounded-2xl border border-slate-100/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/[0.02]">
                                            <div className="flex items-center gap-3.5">
                                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl font-black text-xs ${
                                                    index === 0
                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 ring-1 ring-amber-300'
                                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                    {index === 0 ? <Award size={16} /> : `#${index + 1}`}
                                                </span>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900 dark:text-white">{r.full_name}</p>
                                                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Invoicing Output</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xl font-black text-slate-900 dark:text-white">{r.metric_count}</span>
                                                <TrendingUp size={16} className="text-emerald-500" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Technicians */}
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between border-b border-slate-100/80 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/5">
                            <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">Technician Performance</h3>
                            <span className="rounded-full bg-cyan-100 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300">
                                Exams Completed
                            </span>
                        </div>
                        <div className="p-5">
                            {isLoading ? (
                                <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse">Calculating productivity...</div>
                            ) : technicians.length === 0 ? (
                                <div className="py-8 text-center text-xs font-medium text-slate-400">No completed exams in this date range.</div>
                            ) : (
                                <div className="space-y-3">
                                    {technicians.map((r, index) => (
                                        <div key={r.user_id} className="flex items-center justify-between rounded-2xl border border-slate-100/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/[0.02]">
                                            <div className="flex items-center gap-3.5">
                                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl font-black text-xs ${
                                                    index === 0
                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 ring-1 ring-amber-300'
                                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                    {index === 0 ? <Award size={16} /> : `#${index + 1}`}
                                                </span>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900 dark:text-white">{r.full_name}</p>
                                                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Clinical Exam Output</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xl font-black text-slate-900 dark:text-white">{r.metric_count}</span>
                                                <TrendingUp size={16} className="text-emerald-500" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ProductivityReport;
