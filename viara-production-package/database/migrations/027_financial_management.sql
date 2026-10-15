-- Phase 15: Financial Management

-- 1. Expense Categories
CREATE TABLE expense_categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pre-seed some default categories
INSERT INTO expense_categories (name, description) VALUES
('Rent/Lease', 'Office or equipment lease payments'),
('Utilities', 'Electricity, water, internet'),
('Payroll', 'Staff salaries and wages'),
('Supplies', 'Medical and office supplies'),
('Maintenance', 'Equipment and facility maintenance'),
('Marketing', 'Advertising and promotions'),
('Taxes', 'Tax payments and duties'),
('Other', 'Miscellaneous expenses')
ON CONFLICT DO NOTHING;

-- 2. Expenses
CREATE TABLE expenses (
    expense_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES expense_categories(category_id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0.00,
    expense_date DATE NOT NULL,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    receipt_url VARCHAR(255),
    notes TEXT,
    logged_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Commission Payables
CREATE TABLE commission_payables (
    payable_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL, -- Either referring_doctor_id (UUID) or user_id (for internal radiologists). Wait, referring_doctors table has doctor_id UUID. users has user_id UUID.
    -- We will not strictly enforce a foreign key since it could map to either referring_doctors or users.
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Paid
    paid_date TIMESTAMP WITH TIME ZONE,
    transaction_ref VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Financial Closures
CREATE TABLE financial_closures (
    closure_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_date DATE NOT NULL UNIQUE,
    total_revenue DECIMAL(12, 2) DEFAULT 0.00,
    total_expenses DECIMAL(12, 2) DEFAULT 0.00,
    net_profit DECIMAL(12, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Draft', -- Draft, Finalized
    closed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_commission_payables_doctor ON commission_payables(doctor_id);
CREATE INDEX idx_commission_payables_status ON commission_payables(status);
CREATE INDEX idx_financial_closures_date ON financial_closures(closure_date);
