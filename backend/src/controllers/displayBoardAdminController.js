/**
 * displayBoardAdminController.js
 * Control unit for the waiting-room display board: runtime configuration
 * and announcement management. All endpoints require MANAGE_DISPLAY_BOARD.
 */
const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const settingsService = require('../services/settingsService');
const {
    displayConfigSchema,
    createAnnouncementSchema,
    updateAnnouncementSchema,
    announcementIdSchema
} = require('../schemas/displayBoardSchema');

const CONFIG_DEFAULTS = {
    patientDisplayMode: 'order_only',
    callAnnouncementMode: 'token_only',
    showTicker: true,
    boardTitle: null,
    privacyMode: 'full',
    muteAll: false,
    quietMode: false,
    repeatChime: true,
    theme: 'light',
    displayLanguage: 'ar',
    motionMode: 'full',
    rotationSpeed: 9000,
    showSummaryStats: false,
    announcementRate: 1,
    announcementRepeatCount: 2,
    announcementRepeatDelay: 1500,
    announcementVolume: 1,
    announcementMode: null,
    announcementPreset: 'standard',
    announcementLanguage: 'ar',
    tokenPronunciation: 'auto',
    announcementStyle: 'formal',
    customTemplate: null,
    pronunciationDictionary: null,
    arabicVoiceURI: null,
    englishVoiceURI: null,
};

const SETTING_KEYS = {
    patientDisplayMode: 'display.patient_display_mode',
    callAnnouncementMode: 'display.call_announcement_mode',
    showTicker: 'display.show_ticker',
    boardTitle: 'display.board_title',
    privacyMode: 'display.privacy_mode',
    muteAll: 'display.mute',
    quietMode: 'display.quiet_mode',
    repeatChime: 'display.repeat_chime',
    theme: 'display.theme',
    displayLanguage: 'display.display_language',
    motionMode: 'display.motion_mode',
    rotationSpeed: 'display.rotation_speed',
    showSummaryStats: 'display.show_summary_stats',
    announcementRate: 'display.announcement_rate',
    announcementRepeatCount: 'display.announcement_repeats',
    announcementRepeatDelay: 'display.announcement_delay',
    announcementVolume: 'display.announcement_volume',
    announcementMode: 'display.announcement_mode',
    announcementPreset: 'display.announcement_preset',
    announcementLanguage: 'display.announcement_language',
    tokenPronunciation: 'display.token_pronunciation',
    announcementStyle: 'display.announcement_style',
    customTemplate: 'display.custom_template',
    pronunciationDictionary: 'display.pronunciation_dictionary',
    arabicVoiceURI: 'display.arabic_voice',
    englishVoiceURI: 'display.english_voice',
};

const parseBool = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback;
    return String(value) !== 'false' && String(value) !== '0';
};

const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseEnum = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;

const ANNOUNCEMENT_SELECT = `
    SELECT announcement_id, title, message, tone, is_active, display_order, created_at, updated_at
`;

const rollbackQuietly = async (client) => {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch {
        // Preserve the original operational error.
    }
};

const getDisplayConfig = (db) => async (req, res, next) => {
    try {
        const keys = Object.values(SETTING_KEYS);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const settingsResult = await db.query(`
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN (${placeholders})
        `, keys);

        const settings = {};
        settingsResult.rows.forEach((row) => { settings[row.setting_key] = row.setting_value; });

        const announcementsResult = await db.query(`
            ${ANNOUNCEMENT_SELECT}
            FROM display_announcements
            ORDER BY is_active DESC, display_order ASC, created_at DESC
            LIMIT 100
        `);

        const mode = settings[SETTING_KEYS.patientDisplayMode];
        const callMode = settings[SETTING_KEYS.callAnnouncementMode];
        const ticker = settings[SETTING_KEYS.showTicker];
        const title = (settings[SETTING_KEYS.boardTitle] || '').trim();

        res.json({
            config: {
                patientDisplayMode: parseEnum(mode, ['name_and_order', 'name', 'order_only'], CONFIG_DEFAULTS.patientDisplayMode),
                callAnnouncementMode: parseEnum(callMode, ['token_only', 'name_only', 'token_and_name'], CONFIG_DEFAULTS.callAnnouncementMode),
                showTicker: parseBool(ticker, CONFIG_DEFAULTS.showTicker),
                boardTitle: title || CONFIG_DEFAULTS.boardTitle,
                privacyMode: parseEnum(settings[SETTING_KEYS.privacyMode], ['full', 'token_only', 'name_only'], CONFIG_DEFAULTS.privacyMode),
                muteAll: parseBool(settings[SETTING_KEYS.muteAll], CONFIG_DEFAULTS.muteAll),
                quietMode: parseBool(settings[SETTING_KEYS.quietMode], CONFIG_DEFAULTS.quietMode),
                repeatChime: parseBool(settings[SETTING_KEYS.repeatChime], CONFIG_DEFAULTS.repeatChime),
                theme: parseEnum(settings[SETTING_KEYS.theme], ['dark', 'light'], CONFIG_DEFAULTS.theme),
                displayLanguage: parseEnum(settings[SETTING_KEYS.displayLanguage], ['ar', 'en'], CONFIG_DEFAULTS.displayLanguage),
                motionMode: parseEnum(settings[SETTING_KEYS.motionMode], ['full', 'reduced'], CONFIG_DEFAULTS.motionMode),
                rotationSpeed: parseNumber(settings[SETTING_KEYS.rotationSpeed], CONFIG_DEFAULTS.rotationSpeed),
                showSummaryStats: parseBool(settings[SETTING_KEYS.showSummaryStats], CONFIG_DEFAULTS.showSummaryStats),
                announcementRate: parseNumber(settings[SETTING_KEYS.announcementRate], CONFIG_DEFAULTS.announcementRate),
                announcementRepeatCount: parseNumber(settings[SETTING_KEYS.announcementRepeatCount], CONFIG_DEFAULTS.announcementRepeatCount),
                announcementRepeatDelay: parseNumber(settings[SETTING_KEYS.announcementRepeatDelay], CONFIG_DEFAULTS.announcementRepeatDelay),
                announcementVolume: parseNumber(settings[SETTING_KEYS.announcementVolume], CONFIG_DEFAULTS.announcementVolume),
                announcementMode: parseEnum(settings[SETTING_KEYS.announcementMode], ['token_only', 'name_only', 'token_and_name'], CONFIG_DEFAULTS.announcementMode),
                announcementPreset: settings[SETTING_KEYS.announcementPreset] || CONFIG_DEFAULTS.announcementPreset,
                announcementLanguage: parseEnum(settings[SETTING_KEYS.announcementLanguage], ['ar', 'en', 'ar_then_en', 'en_then_ar'], CONFIG_DEFAULTS.announcementLanguage),
                tokenPronunciation: parseEnum(settings[SETTING_KEYS.tokenPronunciation], ['auto', 'natural', 'digits'], CONFIG_DEFAULTS.tokenPronunciation),
                announcementStyle: parseEnum(settings[SETTING_KEYS.announcementStyle], ['formal', 'calm', 'short'], CONFIG_DEFAULTS.announcementStyle),
                customTemplate: settings[SETTING_KEYS.customTemplate] != null && settings[SETTING_KEYS.customTemplate] !== '' ? settings[SETTING_KEYS.customTemplate] : CONFIG_DEFAULTS.customTemplate,
                pronunciationDictionary: settings[SETTING_KEYS.pronunciationDictionary] != null && settings[SETTING_KEYS.pronunciationDictionary] !== '' ? settings[SETTING_KEYS.pronunciationDictionary] : CONFIG_DEFAULTS.pronunciationDictionary,
                arabicVoiceURI: settings[SETTING_KEYS.arabicVoiceURI] || CONFIG_DEFAULTS.arabicVoiceURI,
                englishVoiceURI: settings[SETTING_KEYS.englishVoiceURI] || CONFIG_DEFAULTS.englishVoiceURI,
            },
            announcements: announcementsResult.rows.map((row) => ({
                id: row.announcement_id,
                title: row.title,
                message: row.message,
                tone: row.tone,
                isActive: row.is_active,
                displayOrder: row.display_order,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }))
        });
    } catch (error) {
        next(error);
    }
};

const updateDisplayConfig = (db) => async (req, res, next) => {
    try {
        const data = displayConfigSchema.parse(req.body);

        const settingsToUpdate = {};
        const addSetting = (field, value) => {
            if (value !== undefined) {
                settingsToUpdate[SETTING_KEYS[field]] = value;
            }
        };
        addSetting('patientDisplayMode', data.patientDisplayMode);
        addSetting('callAnnouncementMode', data.callAnnouncementMode);
        addSetting('showTicker', data.showTicker !== undefined ? String(data.showTicker) : undefined);
        addSetting('boardTitle', data.boardTitle != null ? (data.boardTitle || '') : undefined);
        addSetting('privacyMode', data.privacyMode);
        addSetting('muteAll', data.muteAll !== undefined ? String(data.muteAll) : undefined);
        addSetting('quietMode', data.quietMode !== undefined ? String(data.quietMode) : undefined);
        addSetting('repeatChime', data.repeatChime !== undefined ? String(data.repeatChime) : undefined);
        addSetting('theme', data.theme);
        addSetting('displayLanguage', data.displayLanguage);
        addSetting('motionMode', data.motionMode);
        addSetting('rotationSpeed', data.rotationSpeed !== undefined ? String(data.rotationSpeed) : undefined);
        addSetting('showSummaryStats', data.showSummaryStats !== undefined ? String(data.showSummaryStats) : undefined);
        addSetting('announcementRate', data.announcementRate !== undefined ? String(data.announcementRate) : undefined);
        addSetting('announcementRepeatCount', data.announcementRepeatCount !== undefined ? String(data.announcementRepeatCount) : undefined);
        addSetting('announcementRepeatDelay', data.announcementRepeatDelay !== undefined ? String(data.announcementRepeatDelay) : undefined);
        addSetting('announcementVolume', data.announcementVolume !== undefined ? String(data.announcementVolume) : undefined);
        addSetting('announcementMode', data.announcementMode);
        addSetting('announcementPreset', data.announcementPreset);
        addSetting('announcementLanguage', data.announcementLanguage);
        addSetting('tokenPronunciation', data.tokenPronunciation);
        addSetting('announcementStyle', data.announcementStyle);
        addSetting('customTemplate', data.customTemplate);
        addSetting('pronunciationDictionary', data.pronunciationDictionary);
        addSetting('arabicVoiceURI', data.arabicVoiceURI);
        addSetting('englishVoiceURI', data.englishVoiceURI);

        await settingsService.updateAll(settingsToUpdate);

        await logAction(db, {
            userId: req.user.user_id,
            action: 'DISPLAY_BOARD_CONFIG_UPDATED',
            resourceId: 'display.board',
            resourceTable: 'system_settings',
            ipAddress: req.ip,
            details: {
                patientDisplayMode: data.patientDisplayMode ?? undefined,
                callAnnouncementMode: data.callAnnouncementMode ?? undefined,
                showTicker: data.showTicker ?? undefined,
                boardTitle: data.boardTitle ?? undefined,
                privacyMode: data.privacyMode ?? undefined,
                muteAll: data.muteAll ?? undefined,
                quietMode: data.quietMode ?? undefined,
                repeatChime: data.repeatChime ?? undefined,
                theme: data.theme ?? undefined,
                displayLanguage: data.displayLanguage ?? undefined,
                motionMode: data.motionMode ?? undefined,
                rotationSpeed: data.rotationSpeed ?? undefined,
                showSummaryStats: data.showSummaryStats ?? undefined,
                announcementRate: data.announcementRate ?? undefined,
                announcementRepeatCount: data.announcementRepeatCount ?? undefined,
                announcementRepeatDelay: data.announcementRepeatDelay ?? undefined,
                announcementVolume: data.announcementVolume ?? undefined,
                announcementMode: data.announcementMode ?? undefined,
                announcementPreset: data.announcementPreset ?? undefined,
                announcementLanguage: data.announcementLanguage ?? undefined,
                tokenPronunciation: data.tokenPronunciation ?? undefined,
                announcementStyle: data.announcementStyle ?? undefined,
                customTemplate: data.customTemplate ?? undefined,
                pronunciationDictionary: data.pronunciationDictionary ?? undefined,
                arabicVoiceURI: data.arabicVoiceURI ?? undefined,
                englishVoiceURI: data.englishVoiceURI ?? undefined,
            }
        });

        res.json({
            message: 'Display board configuration updated',
            config: {
                patientDisplayMode: data.patientDisplayMode ?? undefined,
                callAnnouncementMode: data.callAnnouncementMode ?? undefined,
                showTicker: data.showTicker ?? undefined,
                boardTitle: data.boardTitle ?? undefined,
                privacyMode: data.privacyMode ?? undefined,
                muteAll: data.muteAll ?? undefined,
                quietMode: data.quietMode ?? undefined,
                repeatChime: data.repeatChime ?? undefined,
                theme: data.theme ?? undefined,
                displayLanguage: data.displayLanguage ?? undefined,
                motionMode: data.motionMode ?? undefined,
                rotationSpeed: data.rotationSpeed ?? undefined,
                showSummaryStats: data.showSummaryStats ?? undefined,
                announcementRate: data.announcementRate ?? undefined,
                announcementRepeatCount: data.announcementRepeatCount ?? undefined,
                announcementRepeatDelay: data.announcementRepeatDelay ?? undefined,
                announcementVolume: data.announcementVolume ?? undefined,
                announcementMode: data.announcementMode ?? undefined,
                announcementPreset: data.announcementPreset ?? undefined,
                announcementLanguage: data.announcementLanguage ?? undefined,
                tokenPronunciation: data.tokenPronunciation ?? undefined,
                announcementStyle: data.announcementStyle ?? undefined,
                customTemplate: data.customTemplate ?? undefined,
                pronunciationDictionary: data.pronunciationDictionary ?? undefined,
                arabicVoiceURI: data.arabicVoiceURI ?? undefined,
                englishVoiceURI: data.englishVoiceURI ?? undefined,
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

const createDisplayAnnouncement = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createAnnouncementSchema.parse(req.body);

        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO display_announcements (title, message, tone, is_active, display_order, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING announcement_id, title, message, tone, is_active, display_order, created_at, updated_at
        `, [data.title, data.message, data.tone, data.isActive, data.displayOrder, req.user.user_id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'DISPLAY_ANNOUNCEMENT_CREATED',
            resourceId: result.rows[0].announcement_id,
            resourceTable: 'display_announcements',
            ipAddress: req.ip,
            details: { title: data.title, tone: data.tone, displayOrder: data.displayOrder },
            required: true
        });

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        await rollbackQuietly(client);
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        client?.release();
    }
};

const updateDisplayAnnouncement = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        if (!announcementIdSchema.safeParse(id).success) {
            return next(new AppError('Invalid announcement ID format', 400));
        }

        const data = updateAnnouncementSchema.parse(req.body);

        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT announcement_id FROM display_announcements WHERE announcement_id = $1 FOR UPDATE
        `, [id]);
        if (!existing.rows.length) {
            await client.query('ROLLBACK');
            return next(new AppError('Announcement not found', 404));
        }

        const assignments = [];
        const values = [];
        if (data.title !== undefined) { values.push(data.title); assignments.push(`title = $${values.length}`); }
        if (data.message !== undefined) { values.push(data.message); assignments.push(`message = $${values.length}`); }
        if (data.tone !== undefined) { values.push(data.tone); assignments.push(`tone = $${values.length}`); }
        if (data.isActive !== undefined) { values.push(data.isActive); assignments.push(`is_active = $${values.length}`); }
        if (data.displayOrder !== undefined) { values.push(data.displayOrder); assignments.push(`display_order = $${values.length}`); }

        values.push(id);
        const result = await client.query(`
            UPDATE display_announcements
            SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE announcement_id = $${values.length}
            RETURNING announcement_id, title, message, tone, is_active, display_order, created_at, updated_at
        `, values);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'DISPLAY_ANNOUNCEMENT_UPDATED',
            resourceId: id,
            resourceTable: 'display_announcements',
            ipAddress: req.ip,
            details: { changedFields: Object.keys(data) },
            required: true
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        await rollbackQuietly(client);
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        client?.release();
    }
};

const deleteDisplayAnnouncement = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        if (!announcementIdSchema.safeParse(id).success) {
            return next(new AppError('Invalid announcement ID format', 400));
        }

        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT announcement_id, title FROM display_announcements WHERE announcement_id = $1 FOR UPDATE
        `, [id]);
        if (!existing.rows.length) {
            await client.query('ROLLBACK');
            return next(new AppError('Announcement not found', 404));
        }

        await client.query(`DELETE FROM display_announcements WHERE announcement_id = $1`, [id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'DISPLAY_ANNOUNCEMENT_DELETED',
            resourceId: id,
            resourceTable: 'display_announcements',
            ipAddress: req.ip,
            details: { title: existing.rows[0].title },
            required: true
        });

        await client.query('COMMIT');
        res.status(204).end();
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

module.exports = {
    getDisplayConfig,
    updateDisplayConfig,
    createDisplayAnnouncement,
    updateDisplayAnnouncement,
    deleteDisplayAnnouncement
};
