-- Migration 199: Unified Enterprise Multi-Branch Architecture & Memberships
-- Fulfills MBT-100, MBT-101, MBT-102, MBT-103, MBT-104

-- 1. Organizations Master Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    license_key TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Organization
INSERT INTO organizations (id, code, name, name_ar, is_active)
VALUES (
    '00000000-0000-4000-8000-000000000000',
    'MAIN_ORG',
    'TIBA SCAN CENTER',
    'طيبة للأشعة والتحاليل الطبية',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_ar = EXCLUDED.name_ar;

-- 2. Unified Branches Master Table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    is_main BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'archived'
    timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Cairo',
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    tax_number VARCHAR(100),
    medical_license VARCHAR(100),
    commercial_registration VARCHAR(100),
    phone VARCHAR(50),
    alternative_phone VARCHAR(50),
    hotline VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    address_ar TEXT,
    city VARCHAR(100),
    governorate VARCHAR(100),
    invoice_prefix VARCHAR(20) DEFAULT 'INV-',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_branches_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);

-- 3. Backfill from financial_branches into branches
INSERT INTO branches (
    id, organization_id, code, name, name_ar, is_main, status, timezone, currency_code
)
SELECT 
    fb.branch_id,
    '00000000-0000-4000-8000-000000000000'::UUID,
    fb.code,
    fb.name,
    CASE WHEN fb.branch_id = '00000000-0000-4000-8000-000000000001' THEN 'المركز الرئيسي' ELSE fb.name END,
    CASE WHEN fb.branch_id = '00000000-0000-4000-8000-000000000001' THEN TRUE ELSE FALSE END,
    CASE WHEN fb.is_active THEN 'active' ELSE 'inactive' END,
    fb.timezone,
    fb.currency_code
FROM financial_branches fb
ON CONFLICT (id) DO NOTHING;

-- Ensure default HQ branch exists
INSERT INTO branches (
    id, organization_id, code, name, name_ar, is_main, status, timezone, currency_code
)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000000',
    'MAIN',
    'Main Flagship Center',
    'المركز الرئيسي',
    TRUE,
    'active',
    'Africa/Cairo',
    'EGP'
)
ON CONFLICT (id) DO NOTHING;

-- Populate enriched branch metadata from system_settings (center.branches)
DO $$
DECLARE
    branches_json JSONB;
    b JSONB;
    bid UUID;
    bcode VARCHAR;
    bname VARCHAR;
    bname_ar VARCHAR;
    is_m BOOLEAN;
BEGIN
    SELECT setting_value::jsonb INTO branches_json
    FROM system_settings
    WHERE setting_key = 'center.branches';

    IF branches_json IS NOT NULL AND jsonb_typeof(branches_json) = 'array' THEN
        FOR b IN SELECT * FROM jsonb_array_elements(branches_json)
        LOOP
            BEGIN
                bid := (b->>'id')::UUID;
            EXCEPTION WHEN OTHERS THEN
                bid := NULL;
            END;

            IF bid IS NOT NULL THEN
                bcode := COALESCE(b->>'code', 'BR-' || SUBSTRING(bid::text, 1, 4));
                bname := COALESCE(b->>'name', 'Branch ' || bcode);
                bname_ar := COALESCE(b->>'nameAr', bname);
                is_m := COALESCE((b->>'isMain')::boolean, (bid = '00000000-0000-4000-8000-000000000001'));

                INSERT INTO branches (
                    id, organization_id, code, name, name_ar, is_main, status,
                    phone, hotline, email, address, address_ar, city, governorate,
                    invoice_prefix, tax_number, medical_license, commercial_registration
                )
                VALUES (
                    bid,
                    '00000000-0000-4000-8000-000000000000'::UUID,
                    bcode,
                    bname,
                    bname_ar,
                    is_m,
                    COALESCE(b->>'status', 'active'),
                    COALESCE(b->>'phone', ''),
                    COALESCE(b->>'hotline', ''),
                    COALESCE(b->>'email', ''),
                    COALESCE(b->>'address', ''),
                    COALESCE(b->>'addressAr', ''),
                    COALESCE(b->>'city', ''),
                    COALESCE(b->>'governorate', ''),
                    COALESCE(b->>'invoicePrefix', 'INV-'),
                    COALESCE(b->>'taxNumber', ''),
                    COALESCE(b->>'medicalLicense', ''),
                    COALESCE(b->>'commercialRegistration', '')
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    name_ar = COALESCE(EXCLUDED.name_ar, branches.name_ar),
                    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), branches.phone),
                    hotline = COALESCE(NULLIF(EXCLUDED.hotline, ''), branches.hotline),
                    email = COALESCE(NULLIF(EXCLUDED.email, ''), branches.email),
                    address = COALESCE(NULLIF(EXCLUDED.address, ''), branches.address),
                    city = COALESCE(NULLIF(EXCLUDED.city, ''), branches.city),
                    governorate = COALESCE(NULLIF(EXCLUDED.governorate, ''), branches.governorate);
            END IF;
        END LOOP;
    END IF;
END $$;

-- 4. Bidirectional Sync Trigger between branches and financial_branches (MBT-101)
-- Any branch created or updated in `branches` is mirrored in `financial_branches` so foreign keys remain intact.
CREATE OR REPLACE FUNCTION sync_branches_to_financial_branches()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO financial_branches (branch_id, code, name, timezone, currency_code, is_active)
        VALUES (NEW.id, NEW.code, NEW.name, NEW.timezone, NEW.currency_code, (NEW.status = 'active'))
        ON CONFLICT (branch_id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            timezone = EXCLUDED.timezone,
            currency_code = EXCLUDED.currency_code,
            is_active = EXCLUDED.is_active;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE financial_branches
        SET code = NEW.code,
            name = NEW.name,
            timezone = NEW.timezone,
            currency_code = NEW.currency_code,
            is_active = (NEW.status = 'active')
        WHERE branch_id = NEW.id;
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM financial_branches WHERE branch_id = OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_branches_to_financial ON branches;
CREATE TRIGGER trg_sync_branches_to_financial
AFTER INSERT OR UPDATE OR DELETE ON branches
FOR EACH ROW EXECUTE FUNCTION sync_branches_to_financial_branches();

-- 5. User Branch Memberships Table (MBT-102)
CREATE TABLE IF NOT EXISTS user_branch_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role VARCHAR(50),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_branch_membership UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_ubm_user ON user_branch_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_ubm_branch ON user_branch_memberships(branch_id);
CREATE INDEX IF NOT EXISTS idx_ubm_user_active ON user_branch_memberships(user_id, is_active);

-- 6. Update Users with Organization Context and Org-Admin Flag
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-4000-8000-000000000000',
    ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET organization_id = '00000000-0000-4000-8000-000000000000'
WHERE organization_id IS NULL;

-- Admins and Developers have organization-level administration privileges
UPDATE users
SET is_org_admin = TRUE
WHERE role::text IN ('Admin', 'Developer');

-- Seed default membership for existing active users in Main Branch
INSERT INTO user_branch_memberships (user_id, branch_id, role, is_default, is_active)
SELECT 
    u.user_id, 
    '00000000-0000-4000-8000-000000000001'::UUID, 
    u.role::text, 
    TRUE, 
    TRUE
FROM users u
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- 7. Add branch_id to Operational Resources (MBT-104)

-- Rooms
ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE rooms
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE rooms
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_branch_room_number ON rooms(branch_id, room_number);
CREATE INDEX IF NOT EXISTS idx_rooms_branch_id ON rooms(branch_id);

-- Modalities / Equipment
ALTER TABLE modalities
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE modalities
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE modalities
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modalities_branch_id ON modalities(branch_id);

-- Appointments
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE appointments
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE appointments
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_branch_id ON appointments(branch_id);

-- Examinations
ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE examinations
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE examinations
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examinations_branch_id ON examinations(branch_id);

-- Waiting List
ALTER TABLE waiting_list
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE waiting_list
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE waiting_list
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_waiting_list_branch_id ON waiting_list(branch_id);

-- Staff Shifts
ALTER TABLE staff_shifts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE staff_shifts
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE staff_shifts
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_staff_shifts_branch_id ON staff_shifts(branch_id);

-- Attendance Logs
ALTER TABLE attendance_logs
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE attendance_logs
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE attendance_logs
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_attendance_logs_branch_id ON attendance_logs(branch_id);

-- Inventory Items
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE inventory_items
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE inventory_items
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_id ON inventory_items(branch_id);

-- Stock Movements
ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
UPDATE stock_movements
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE stock_movements
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_id ON stock_movements(branch_id);

-- Display Announcements
ALTER TABLE display_announcements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_display_announcements_branch_id ON display_announcements(branch_id);
