-- Phase 17: CRM & Marketing

-- 1. Modify Patients Table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opt_in_marketing BOOLEAN DEFAULT true;

-- 2. CRM Activities
CREATE TABLE IF NOT EXISTS crm_activities (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL, -- Call, WhatsApp, Visit, Email, Feedback Follow-up
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Completed, Cancelled
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patient Segments
CREATE TABLE IF NOT EXISTS patient_segments (
    segment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_segment_members (
    segment_id UUID REFERENCES patient_segments(segment_id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (segment_id, patient_id)
);

-- 4. Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    target_segment UUID REFERENCES patient_segments(segment_id) ON DELETE SET NULL,
    channel VARCHAR(50), -- SMS, Email, WhatsApp
    status VARCHAR(50) DEFAULT 'Draft', -- Draft, Active, Completed, Cancelled
    budget DECIMAL(10, 2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Patient Feedback
CREATE TABLE IF NOT EXISTS patient_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comments TEXT,
    source VARCHAR(50) DEFAULT 'Survey', -- Survey, Kiosk, Phone, Portal
    reviewed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_activities_patient ON crm_activities(patient_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_assignee ON crm_activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_activities_status ON crm_activities(status);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_rating ON patient_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
