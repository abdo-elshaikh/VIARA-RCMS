-- Migration 142: Display Board Announcements & Configuration
-- Waiting-room screen content managed by the display control unit.

CREATE TABLE IF NOT EXISTS display_announcements (
    announcement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    tone VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'success', 'warning', 'urgent')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_display_announcements_active
    ON display_announcements (is_active, display_order, created_at);

-- Display board runtime configuration stored in system_settings:
--   display.patient_display_mode : 'name_and_order' | 'name' | 'order_only'
--   display.show_ticker          : 'true' | 'false'
--   display.board_title          : optional custom board headline

INSERT INTO permissions (name, module, description)
VALUES
    ('MANAGE_DISPLAY_BOARD', 'Reception', 'Manage waiting-room display board content, announcements, and patient visibility settings')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Admin'), ('Developer')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'MANAGE_DISPLAY_BOARD'
ON CONFLICT DO NOTHING;
