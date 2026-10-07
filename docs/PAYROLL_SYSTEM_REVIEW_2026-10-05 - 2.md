Based on my analysis of the entire salary/payroll system (DB schema, services, controllers, UI components), here's the comprehensive review:

---

## Current Salary System Analysis

### ✅ **What's Currently Supported**

| Category | Current Implementation |
|----------|------------------------|
| **Salary Types** | `Monthly` (base_salary), `Hourly` (hourly_rate) |
| **Calculation Methods** | `FixedAmount`, `PercentageOfBase`, `PercentageOfGross`, `HourlyMultiplier`, `PerMinute`, `PerDay` |
| **Rule Types** | `Overtime`, `Late`, `EarlyLeave`, `Absence`, `Allowance`, `Deduction`, `Penalty`, `EmployerContribution` |
| **Deduction Types** | `Fixed`, `Percentage`, `Installment`, `Advance`, `Loan`, `Tax`, `SocialInsurance`, `Other` |
| **Salary Simulator** | Monthly/Hourly base + overtime (1.5x) + allowances + late/absence penalties + loans |

---

## ❌ **Critical Gaps vs Requested Types**

| Requested Type | Status | Missing Elements |
|----------------|--------|------------------|
| **ثابت شهرى** (Fixed Monthly) | ✅ | `Monthly` type exists |
| **ثابت يومى** (Fixed Daily) | ❌ | No `Daily` salary type; no `daily_rate` field |
| **بالشفت** (By Shift) | ❌ | No `PerShift` salary type; no shift-rate field; shift linkage only for attendance |
| **بالحالة** (By Condition/Status) | ❌ | No conditional pay rules (e.g., "if night shift then X", "if weekend then Y") |
| **بالشفت والحالة** (Shift + Condition) | ❌ | No compound condition logic |
| **بالنسبة الخ...** (Percentage-based) | ⚠️ Partial | Only `% of base` or `% of gross`; no `% of shift rate`, `% of condition rate`, tiered % |
| **الزيادات والبونصات** (Increases & Bonuses) | ⚠️ Partial | Only generic `Allowance` rule; no structured bonus/increase framework |
| **طرق حساب مختلفة** (Calculation methods) | ⚠️ Partial | Only 6 methods; missing tiered, stepped, formula-based |

---

## 🔧 **Proposed Changes**

### 1. **Database Schema Extensions** (`employee_compensation_profiles`)

```sql
-- Add new salary_type enum values
ALTER TYPE salary_type_enum ADD VALUE IF NOT EXISTS 'Daily';
ALTER TYPE salary_type_enum ADD VALUE IF NOT EXISTS 'PerShift';
ALTER TYPE salary_type_enum ADD VALUE IF NOT EXISTS 'Conditional';
ALTER TYPE salary_type_enum ADD VALUE IF NOT EXISTS 'ShiftConditional';
ALTER TYPE salary_type_enum ADD VALUE IF NOT EXISTS 'Percentage';

-- Add new columns
ALTER TABLE employee_compensation_profiles ADD COLUMN IF NOT EXISTS daily_rate DECIMAL(14,2);
ALTER TABLE employee_compensation_profiles ADD COLUMN IF NOT EXISTS shift_rate DECIMAL(14,2);
ALTER TABLE employee_compensation_profiles ADD COLUMN IF NOT EXISTS condition_config JSONB DEFAULT '{}';
ALTER TABLE employee_compensation_profiles ADD COLUMN IF NOT EXISTS bonus_config JSONB DEFAULT '{}';
ALTER TABLE employee_compensation_profiles ADD COLUMN IF NOT EXISTS increase_schedule JSONB DEFAULT '[]';
```

### 2. **Payroll Rules Extensions** (`payroll_rules`)

```sql
-- New calculation_methods
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'PerShift';
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'TieredPercentage';
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'Formula';
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'SteppedAmount';
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'ShiftMultiplier';
ALTER TYPE calculation_method_enum ADD VALUE IF NOT EXISTS 'ConditionMultiplier';

-- New rule_types for bonuses/increases
ALTER TYPE rule_type_enum ADD VALUE IF NOT EXISTS 'Bonus';
ALTER TYPE rule_type_enum ADD VALUE IF NOT EXISTS 'Increase';
ALTER TYPE rule_type_enum ADD VALUE IF NOT EXISTS 'ShiftDifferential';
ALTER TYPE rule_type_enum ADD VALUE IF NOT EXISTS 'ConditionPremium';
```

### 3. **Backend Service Logic** (`payrollCalculationService.js`)

Add calculation handlers for:
- **Daily**: `dailyRate × daysWorked`
- **PerShift**: `shiftRate × shiftsWorked` (join with `staff_shifts`)
- **Conditional**: Evaluate `condition_config` (e.g., `{"nightShift": 1.3, "weekend": 1.5, "holiday": 2.0}`)
- **ShiftConditional**: Combine shift rate + condition multipliers
- **Percentage**: Configurable base (base, gross, shift, daily, custom)
- **Bonus/Increase**: Apply `bonus_config` and `increase_schedule` (date-based, tenure-based, performance-based)
- **Formula**: Safe expression evaluation (e.g., `base * 1.1 + shiftRate * shifts * 1.5`)

### 4. **Frontend Updates**

| File | Changes |
|------|---------|
| `SalarySimulatorModal.jsx` | Add `Daily`, `PerShift`, `Conditional`, `ShiftConditional`, `Percentage` types with respective inputs |
| `Payroll.jsx` (compForm) | Extend `salaryType` select with new types; add conditional fields (daily_rate, shift_rate, condition_config JSON editor) |
| `payroll.json` (i18n) | Add translation keys for new types and fields |

### 5. **New Calculation Methods in `calculateRuleAmount`**

```javascript
// PerShift
if (rule.calculation_method === 'PerShift') {
  return roundMoney(context.shiftsWorked * context.shiftRate * value);
}

// TieredPercentage (e.g., first 10 shifts 10%, next 5 shifts 15%)
if (rule.calculation_method === 'TieredPercentage') {
  // value = JSON: [{"threshold": 10, "rate": 10}, {"threshold": 15, "rate": 15}]
}

// Formula (safe eval)
if (rule.calculation_method === 'Formula') {
  // value = expression string; context variables available
}

// ShiftMultiplier (night/weekend/holiday differentials)
if (rule.calculation_method === 'ShiftMultiplier') {
  // value = multiplier; context.shiftType determines which
}
```

---

## 📋 **Implementation Priority**

| Priority | Work | Effort |
|----------|------|--------|
| **P0** | Add `Daily`, `PerShift` salary types to DB enum + columns | 2-3 days |
| **P1** | Add `Conditional`, `ShiftConditional` with JSON config | 3-4 days |
| **P2** | Extend `payroll_rules` with `Bonus`, `Increase`, `ShiftDifferential`, `ConditionPremium` | 2-3 days |
| **P3** | Implement new calculation methods in `payrollCalculationService.js` | 3-5 days |
| **P4** | Update `SalarySimulatorModal` and `Payroll` compensation form | 2-3 days |
| **P5** | Add tiered/stepped/formula calculation methods | 3-4 days |
| **P6** | i18n translations (EN/AR) for all new types | 1 day |

---

## 🎯 **Key Design Decisions Needed**

1. **Condition Engine**: Should conditions be evaluated in SQL (DB) or JS (service)?
2. **Shift Linkage**: Use existing `staff_shifts` table or create `payroll_shifts` for pay-only shifts?
3. **Bonus/Increase Schedule**: Separate table or JSON in compensation profile?
4. **Formula Safety**: Use `mathjs` or custom safe evaluator for `Formula` method?
5. **Backward Compatibility**: Migrate existing `Monthly`/`Hourly` profiles automatically?
