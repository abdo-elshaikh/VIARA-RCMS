-- Phase 14: Equipment & Room Management

-- 1. Extend modalities table
ALTER TABLE modalities
ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
ADD COLUMN IF NOT EXISTS model VARCHAR(100),
ADD COLUMN IF NOT EXISTS installation_date DATE,
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- 2. Service Contracts
CREATE TABLE IF NOT EXISTS service_contracts (
    contract_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
    provider_name VARCHAR(255) NOT NULL,
    contact_info VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    cost DECIMAL(12, 2),
    status VARCHAR(50) DEFAULT 'Active', -- Active, Expired, Terminated
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Equipment Maintenance
CREATE TABLE IF NOT EXISTS equipment_maintenance (
    maintenance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
    maintenance_type VARCHAR(100) NOT NULL, -- Routine, Repair, Calibration, Inspection
    scheduled_date DATE NOT NULL,
    completed_date DATE,
    performed_by VARCHAR(255),
    cost DECIMAL(12, 2),
    status VARCHAR(50) DEFAULT 'Scheduled', -- Scheduled, In Progress, Completed, Cancelled
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Equipment Downtime
CREATE TABLE IF NOT EXISTS equipment_downtime (
    downtime_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Planned', -- Planned, Unplanned, Resolved
    resolution_notes TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_service_contracts_modality ON service_contracts(modality_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_modality ON equipment_maintenance(modality_id);
CREATE INDEX IF NOT EXISTS idx_equipment_downtime_modality_times ON equipment_downtime(modality_id, start_time, end_time);
