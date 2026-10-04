import React, { useState, useMemo, useEffect } from 'react';
import {
    Calculator,
    Coins,
    CheckCircle2,
    AlertTriangle,
    X,
    Clock3,
    ArrowRight,
    TrendingUp,
    MinusCircle,
    UserCheck,
    RotateCcw,
    Sparkles,
    Printer
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { formatMoney } from '../../utils/financialFormat';

export const SalarySimulatorModal = ({
    isOpen,
    onClose,
    staff = [],
    compensationProfiles = [],
    rules = [],
    currency = 'EGP'
}) => {
    const { t, i18n } = useTranslation('payroll');
    const isArabic = i18n.language?.startsWith('ar');

    const [selectedUserId, setSelectedUserId] = useState('');
    const [salaryType, setSalaryType] = useState('Monthly');
    const [baseSalary, setBaseSalary] = useState(15000);
    const [hourlyRate, setHourlyRate] = useState(85);
    const [standardDays, setStandardDays] = useState(22);
    const [standardHoursPerDay, setStandardHoursPerDay] = useState(8);

    // Dynamic attendance and adjustment variables
    const [daysWorked, setDaysWorked] = useState(22);
    const [hoursWorked, setHoursWorked] = useState(176);
    const [overtimeHours, setOvertimeHours] = useState(10);
    const [lateMinutes, setLateMinutes] = useState(45);
    const [unexcusedAbsenceDays, setUnexcusedAbsenceDays] = useState(0);
    const [customAllowances, setCustomAllowances] = useState(1500);
    const [loanDeduction, setLoanDeduction] = useState(1000);
    const [disciplinaryPenalty, setDisciplinaryPenalty] = useState(0);

    // Sync when employee is selected from dropdown
    useEffect(() => {
        if (!selectedUserId) return;
        const profile = compensationProfiles.find(cp => String(cp.user_id) === String(selectedUserId));
        if (profile) {
            setSalaryType(profile.salary_type || 'Monthly');
            if (profile.salary_type === 'Monthly') {
                setBaseSalary(Number(profile.base_salary || 0));
            } else {
                setHourlyRate(Number(profile.hourly_rate || 0));
            }
            setStandardDays(Number(profile.standard_days_per_period || 22));
            setStandardHoursPerDay(Number(profile.standard_hours_per_day || 8));
        }
    }, [selectedUserId, compensationProfiles]);

    // Live Simulation Calculation Engine
    const simulation = useMemo(() => {
        const stdDays = Math.max(1, Number(standardDays || 22));
        const stdHoursDay = Math.max(1, Number(standardHoursPerDay || 8));
        const monthlyBase = Number(baseSalary || 0);
        const hourly = Number(hourlyRate || 0);
        const dailyRate = salaryType === 'Monthly' ? monthlyBase / stdDays : hourly * stdHoursDay;
        const effectiveHourlyRate = salaryType === 'Monthly' ? dailyRate / stdHoursDay : hourly;

        // 1. Base Earnings
        let calculatedBase = 0;
        if (salaryType === 'Monthly') {
            const workedRatio = Math.min(1, Math.max(0, Number(daysWorked || stdDays) / stdDays));
            calculatedBase = monthlyBase * workedRatio;
        } else {
            calculatedBase = Number(hoursWorked || 0) * hourly;
        }

        // 2. Overtime Earnings (1.5x multiplier standard rate)
        const overtimeBonus = Number(overtimeHours || 0) * effectiveHourlyRate * 1.5;

        // 3. Allowances
        const allowances = Number(customAllowances || 0);

        // Gross
        const grossEarnings = calculatedBase + overtimeBonus + allowances;

        // 4. Absence Deductions
        const absenceDeduction = Number(unexcusedAbsenceDays || 0) * dailyRate;

        // 5. Late Penalties (1 minute = proportional hourly rate)
        const minuteRate = effectiveHourlyRate / 60;
        const lateDeduction = Number(lateMinutes || 0) * minuteRate;

        // 6. Installments & Penalties
        const loans = Number(loanDeduction || 0);
        const penalty = Number(disciplinaryPenalty || 0);

        const totalDeductions = absenceDeduction + lateDeduction + loans;
        const totalPenalties = penalty;

        // Net Pay (Safe against negative)
        const netPay = Math.max(0, grossEarnings - totalDeductions - totalPenalties);

        // Percentages for visualization
        const deductionsRatio = grossEarnings > 0 ? Math.min(100, Math.round(((totalDeductions + totalPenalties) / grossEarnings) * 100)) : 0;
        const netRatio = Math.max(0, 100 - deductionsRatio);

        return {
            dailyRate,
            effectiveHourlyRate,
            calculatedBase,
            overtimeBonus,
            allowances,
            grossEarnings,
            absenceDeduction,
            lateDeduction,
            loans,
            penalty,
            totalDeductions,
            totalPenalties,
            netPay,
            deductionsRatio,
            netRatio
        };
    }, [
        salaryType, baseSalary, hourlyRate, standardDays, standardHoursPerDay,
        daysWorked, hoursWorked, overtimeHours, lateMinutes, unexcusedAbsenceDays,
        customAllowances, loanDeduction, disciplinaryPenalty
    ]);

    const handleReset = () => {
        setSelectedUserId('');
        setSalaryType('Monthly');
        setBaseSalary(15000);
        setHourlyRate(85);
        setStandardDays(22);
        setStandardHoursPerDay(8);
        setDaysWorked(22);
        setHoursWorked(176);
        setOvertimeHours(10);
        setLateMinutes(45);
        setUnexcusedAbsenceDays(0);
        setCustomAllowances(1500);
        setLoanDeduction(1000);
        setDisciplinaryPenalty(0);
    };

    const money = (val) => formatMoney(val, { currency, language: i18n.language });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isArabic ? 'حاسبة ومحاكي الرواتب وصافي المستحقات (Simulator)' : 'Interactive Salary & Net Payout Simulator'}
            size="wide"
            width="max-w-4xl"
        >
            <div className="space-y-5" dir={isArabic ? 'rtl' : 'ltr'}>
                {/* Employee Preset Selector Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/50 p-3.5 dark:border-teal-900/60 dark:bg-teal-950/20">
                    <div className="flex items-center gap-2.5">
                        <UserCheck size={18} className="text-teal-600 dark:text-teal-400 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-teal-950 dark:text-teal-100">
                                {isArabic ? 'تعبئة تلقائية من ملف موظف حالي:' : 'Quick Load from Active Staff Profile:'}
                            </p>
                            <p className="text-[11px] text-teal-800 dark:text-teal-300">
                                {isArabic ? 'اختر الموظف لجلب هيكل أجره المعتمد تلقائياً ومحاكاة مستحقاته' : 'Select staff member to load their approved compensation profile'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="rounded-xl border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-teal-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <option value="">{isArabic ? '-- اختر موظفاً للمحاكاة --' : '-- Choose Staff Member --'}</option>
                            {staff.map((emp) => (
                                <option key={emp.user_id} value={emp.user_id}>
                                    {emp.full_name} ({emp.role})
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            title={isArabic ? 'إعادة تعيين' : 'Reset'}
                        >
                            <RotateCcw size={12} />
                        </button>
                    </div>
                </div>

                {/* Simulation Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Compensation & Base */}
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/90 shadow-2xs">
                        <h4 className="text-xs font-black uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-2">
                            <Coins size={15} />
                            {isArabic ? 'هيكل الأجر والتعويض الأساسي' : 'Base Compensation Profile'}
                        </h4>

                        <div className="grid grid-cols-2 gap-2.5">
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'نوع الراتب' : 'Salary Type'}</span>
                                <select
                                    value={salaryType}
                                    onChange={(e) => setSalaryType(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                >
                                    <option value="Monthly">{isArabic ? 'شهري ثابت (Monthly)' : 'Monthly'}</option>
                                    <option value="Hourly">{isArabic ? 'بالساعة (Hourly)' : 'Hourly'}</option>
                                </select>
                            </label>

                            {salaryType === 'Monthly' ? (
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'الراتب الأساسي' : 'Base Salary'} ({currency})</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={baseSalary}
                                        onChange={(e) => setBaseSalary(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </label>
                            ) : (
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'الأجر بالساعة' : 'Hourly Rate'} ({currency})</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={hourlyRate}
                                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </label>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'أيام العمل المعيارية' : 'Standard Days/Period'}</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={standardDays}
                                    onChange={(e) => setStandardDays(Number(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'ساعات اليوم المعياري' : 'Standard Hours/Day'}</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="24"
                                    value={standardHoursPerDay}
                                    onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span>{isArabic ? 'المعدل اليومي المحسوب:' : 'Calculated Daily Rate:'}</span>
                            <span className="font-mono text-teal-700 dark:text-teal-300">{money(simulation.dailyRate)}</span>
                        </div>
                    </div>

                    {/* Right Column: Attendance & Overtime */}
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/90 shadow-2xs">
                        <h4 className="text-xs font-black uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-2">
                            <Clock3 size={15} />
                            {isArabic ? 'الحضور والانصراف والإضافي' : 'Attendance & Overtime Inputs'}
                        </h4>

                        <div className="grid grid-cols-2 gap-2.5">
                            {salaryType === 'Monthly' ? (
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'أيام العمل الفعلية' : 'Actual Days Worked'}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="31"
                                        value={daysWorked}
                                        onChange={(e) => setDaysWorked(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </label>
                            ) : (
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'ساعات العمل الفعلية' : 'Actual Hours Worked'}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={hoursWorked}
                                        onChange={(e) => setHoursWorked(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </label>
                            )}

                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'ساعات العمل الإضافي' : 'Overtime Hours'}</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={overtimeHours}
                                    onChange={(e) => setOvertimeHours(Number(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'دقائق التأخير المسجلة' : 'Late Minutes'}</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={lateMinutes}
                                    onChange={(e) => setLateMinutes(Number(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'أيام الغياب غير المبرر' : 'Unexcused Absence Days'}</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="31"
                                    value={unexcusedAbsenceDays}
                                    onChange={(e) => setUnexcusedAbsenceDays(Number(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span>{isArabic ? 'حافز الإضافي المحسوب (1.5x):' : 'Overtime Value (1.5x):'}</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400">+{money(simulation.overtimeBonus)}</span>
                        </div>
                    </div>
                </div>

                {/* Adjustments & Allowances Row */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/90 shadow-2xs">
                    <h4 className="text-xs font-black uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-2 mb-3">
                        <TrendingUp size={15} />
                        {isArabic ? 'البدلات والسلف والجزاءات الإدارية' : 'Allowances, Deductions & Penalties'}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'بدلات وحوافز مخصصة (+)' : 'Custom Allowances (+)'} ({currency})</span>
                            <input
                                type="number"
                                min="0"
                                value={customAllowances}
                                onChange={(e) => setCustomAllowances(Number(e.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-emerald-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-emerald-400"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'أقساط وسلف مستحقة (-)' : 'Loan / Advance Deductions (-)'} ({currency})</span>
                            <input
                                type="number"
                                min="0"
                                value={loanDeduction}
                                onChange={(e) => setLoanDeduction(Number(e.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-amber-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-amber-400"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{isArabic ? 'جزاءات معتمدة (-)' : 'Disciplinary Penalty (-)'} ({currency})</span>
                            <input
                                type="number"
                                min="0"
                                value={disciplinaryPenalty}
                                onChange={(e) => setDisciplinaryPenalty(Number(e.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono font-bold text-rose-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-rose-400"
                            />
                        </label>
                    </div>
                </div>

                {/* Final Calculation Result Card */}
                <div className="rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-50/70 via-emerald-50/50 to-white p-5 dark:border-teal-500/20 dark:from-teal-950/40 dark:via-emerald-950/20 dark:to-slate-900 shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <span className="text-[11px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                {isArabic ? 'الصافي التقديري المنصرف (Estimated Net Take-Home Pay)' : 'Simulated Net Take-Home Payout'}
                            </span>
                            <h3 className="mt-1 font-mono text-3xl font-black text-teal-950 dark:text-teal-100">
                                {money(simulation.netPay)}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {isArabic
                                    ? `إجمالي الاستحقاقات: ${money(simulation.grossEarnings)} | إجمالي الاستقطاعات والجزاءات: -${money(simulation.totalDeductions + simulation.totalPenalties)}`
                                    : `Total Gross: ${money(simulation.grossEarnings)} | Total Deductions & Penalties: -${money(simulation.totalDeductions + simulation.totalPenalties)}`}
                            </p>
                        </div>

                        {/* Visual Breakdown Progress Bar */}
                        <div className="w-full sm:w-64 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                <span>{isArabic ? 'نسبة الصافي' : 'Net Ratio'}: {simulation.netRatio}%</span>
                                <span className="text-rose-600 dark:text-rose-400">-{simulation.deductionsRatio}%</span>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 flex">
                                <div
                                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                                    style={{ width: `${simulation.netRatio}%` }}
                                    title={`Net Pay: ${simulation.netRatio}%`}
                                />
                                <div
                                    className="h-full bg-rose-500 transition-all duration-300"
                                    style={{ width: `${simulation.deductionsRatio}%` }}
                                    title={`Deductions: ${simulation.deductionsRatio}%`}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-teal-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 transition"
                    >
                        {isArabic ? 'إغلاق المحاكي' : 'Close Simulator'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SalarySimulatorModal;
