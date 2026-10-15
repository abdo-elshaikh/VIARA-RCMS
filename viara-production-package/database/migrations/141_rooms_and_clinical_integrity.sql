-- Migration: Rooms Management and Clinical Integrity
-- Introduces dedicated rooms table, room-level collision guard, room foreign keys on modalities & appointments,
-- and RBAC permissions for room management.

-- 1. Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
    room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    room_number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) DEFAULT 'Imaging' CHECK (type IN ('Imaging', 'Preparation', 'Recovery', 'Reading', 'Consultation', 'Laboratory', 'Other')),
    floor VARCHAR(50),
    status VARCHAR(30) DEFAULT 'Active' CHECK (status IN ('Active', 'Under Maintenance', 'Out of Service')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Backfill rooms from existing modalities.room_number and standard clinical areas
DO $$
DECLARE
    rec RECORD;
    clean_num VARCHAR(50);
BEGIN
    -- Extract distinct non-null room numbers from modalities
    FOR rec IN 
        SELECT DISTINCT TRIM(room_number) AS rm_num, type AS mod_type
        FROM modalities 
        WHERE room_number IS NOT NULL AND TRIM(room_number) <> ''
    LOOP
        clean_num := rec.rm_num;
        INSERT INTO rooms (name, room_number, type, floor, status)
        VALUES (
            'جناح فحص ' || clean_num,
            clean_num,
            'Imaging',
            'الطابق الأرضي',
            'Active'
        )
        ON CONFLICT (room_number) DO NOTHING;
    END LOOP;

    -- Add standard clinical service rooms if they don't exist
    INSERT INTO rooms (name, room_number, type, floor, status, notes)
    VALUES 
        ('غرفة تحضير المرضى وتركيب الكانيولا', 'PREP-01', 'Preparation', 'الطابق الأرضي', 'Active', 'مخصصة للتمريض لتحضير الصبغة وفحص الحساسية'),
        ('غرفة الإفاقة والملاحظة بعد الصبغة', 'RECOV-01', 'Recovery', 'الطابق الأرضي', 'Active', 'مجهزة لملاحظة المرضى بعد الفحوصات المتباينة والتخدير'),
        ('غرفة قراءة وكتابة التقارير الطبية', 'READ-01', 'Reading', 'الطابق الأول', 'Active', 'محطة عمل أطباء الأشعة المعتمدين')
    ON CONFLICT (room_number) DO NOTHING;
END $$;

-- 3. Add room_id to modalities table and link to rooms
ALTER TABLE modalities ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(room_id) ON DELETE SET NULL;

-- Backfill modalities.room_id based on room_number
UPDATE modalities m
SET room_id = r.room_id
FROM rooms r
WHERE m.room_id IS NULL 
  AND m.room_number IS NOT NULL 
  AND TRIM(m.room_number) = r.room_number;

-- 4. Add room_id to appointments table and link to modalities.room_id
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(room_id) ON DELETE SET NULL;

UPDATE appointments a
SET room_id = m.room_id
FROM modalities m
WHERE a.room_id IS NULL 
  AND a.modality_id = m.modality_id 
  AND m.room_id IS NOT NULL;

-- 5. Indexes for fast lookup and conflict checking
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_modalities_room_id ON modalities(room_id);
CREATE INDEX IF NOT EXISTS idx_appointments_room_id ON appointments(room_id);
CREATE INDEX IF NOT EXISTS idx_appointments_room_times ON appointments(room_id, start_time, end_time) 
    WHERE (status NOT IN ('Cancelled', 'No-Show'));

-- 6. Register room management permissions
INSERT INTO permissions (name, description, module)
VALUES 
    ('MANAGE_ROOMS', 'Create, update, and manage clinical rooms and maintenance states', 'settings'),
    ('VIEW_ROOMS', 'View clinical rooms and room assignments', 'settings')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

-- Grant permissions using valid user_role values
INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Admin'), ('Developer')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'MANAGE_ROOMS'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Admin'), ('Developer'), ('Receptionist'), ('Technician'), ('Nurse')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'VIEW_ROOMS'
ON CONFLICT DO NOTHING;
