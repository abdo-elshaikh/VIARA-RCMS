-- Secure staff chat channels and explicit channel membership.
-- Channel access is enforced by the API for history, posting, realtime events,
-- member management, and attachment downloads.

CREATE TABLE IF NOT EXISTS chat_channels (
    channel_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon_color VARCHAR(64) NOT NULL DEFAULT 'from-teal-500 to-cyan-600',
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    post_permission VARCHAR(32) NOT NULL DEFAULT 'all_members',
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',
    CONSTRAINT chk_chat_channel_post_permission
        CHECK (post_permission IN ('all_members', 'admins_only'))
);

ALTER TABLE chat_channels
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS post_permission VARCHAR(32) NOT NULL DEFAULT 'all_members',
    ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] NOT NULL DEFAULT '{}';

UPDATE chat_channels
SET post_permission = 'all_members'
WHERE post_permission IS NULL OR post_permission NOT IN ('all_members', 'admins_only');

UPDATE chat_channels SET is_system = FALSE WHERE is_system IS NULL;
UPDATE chat_channels SET is_private = FALSE WHERE is_private IS NULL;
UPDATE chat_channels SET allowed_roles = '{}' WHERE allowed_roles IS NULL;

ALTER TABLE chat_channels
    ALTER COLUMN is_system SET DEFAULT FALSE,
    ALTER COLUMN is_system SET NOT NULL,
    ALTER COLUMN is_private SET DEFAULT FALSE,
    ALTER COLUMN is_private SET NOT NULL,
    ALTER COLUMN post_permission SET DEFAULT 'all_members',
    ALTER COLUMN post_permission SET NOT NULL,
    ALTER COLUMN allowed_roles SET DEFAULT '{}',
    ALTER COLUMN allowed_roles SET NOT NULL;

CREATE TABLE IF NOT EXISTS chat_channel_members (
    id BIGSERIAL PRIMARY KEY,
    channel_id VARCHAR(64) NOT NULL REFERENCES chat_channels(channel_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel_role VARCHAR(32) NOT NULL DEFAULT 'member',
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT uq_chat_channel_member UNIQUE (channel_id, user_id),
    CONSTRAINT chk_chat_channel_member_role
        CHECK (channel_role IN ('owner', 'admin', 'member'))
);

UPDATE chat_channel_members
SET channel_role = 'member'
WHERE channel_role IS NULL OR channel_role NOT IN ('owner', 'admin', 'member');

ALTER TABLE chat_channel_members
    ALTER COLUMN channel_role SET DEFAULT 'member',
    ALTER COLUMN channel_role SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_channel_post_permission'
    ) THEN
        ALTER TABLE chat_channels
            ADD CONSTRAINT chk_chat_channel_post_permission
            CHECK (post_permission IN ('all_members', 'admins_only'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_channel_member_role'
    ) THEN
        ALTER TABLE chat_channel_members
            ADD CONSTRAINT chk_chat_channel_member_role
            CHECK (channel_role IN ('owner', 'admin', 'member'));
    END IF;
END $$;

ALTER TABLE staff_messages
    ALTER COLUMN channel_name TYPE VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user
    ON chat_channel_members(user_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_chat_channels_visibility
    ON chat_channels(is_system, is_private, created_at);

INSERT INTO chat_channels (
    channel_id, name, display_name, description, icon_color,
    is_system, is_private, post_permission, allowed_roles
) VALUES
    (
        'general', 'general', 'General Hub',
        'Center-wide announcements & discussion',
        'from-blue-500 to-indigo-600', TRUE, FALSE, 'all_members', '{}'
    ),
    (
        'radiology', 'radiology', 'Radiology Desk',
        'Radiologist and technician channel',
        'from-purple-500 to-fuchsia-600', TRUE, FALSE, 'all_members',
        ARRAY['Radiologist', 'Technician']::TEXT[]
    ),
    (
        'reception', 'reception', 'Reception Desk',
        'Receptionist desk coordination',
        'from-emerald-500 to-teal-600', TRUE, FALSE, 'all_members',
        ARRAY['Receptionist', 'Marketing']::TEXT[]
    )
ON CONFLICT (channel_id) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon_color = EXCLUDED.icon_color,
    is_system = TRUE,
    is_private = EXCLUDED.is_private,
    post_permission = EXCLUDED.post_permission,
    allowed_roles = EXCLUDED.allowed_roles;
