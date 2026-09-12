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
    showTicker: true,
    boardTitle: null
};

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
        const [modeResult, tickerResult, titleResult, announcementsResult] = await Promise.all([
            db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'display.patient_display_mode'`),
            db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'display.show_ticker'`),
            db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'display.board_title'`),
            db.query(`
                ${ANNOUNCEMENT_SELECT}
                FROM display_announcements
                ORDER BY is_active DESC, display_order ASC, created_at DESC
                LIMIT 100
            `).catch(() => ({ rows: [] }))
        ]);

        const mode = modeResult.rows[0]?.setting_value;
        const ticker = tickerResult.rows[0]?.setting_value;
        const title = (titleResult.rows[0]?.setting_value || '').trim();

        res.json({
            config: {
                patientDisplayMode: ['name_and_order', 'name', 'order_only'].includes(mode) ? mode : CONFIG_DEFAULTS.patientDisplayMode,
                showTicker: ticker !== 'false',
                boardTitle: title || null
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

        if (data.patientDisplayMode !== undefined) {
            await settingsService.set('display.patient_display_mode', data.patientDisplayMode);
        }
        if (data.showTicker !== undefined) {
            await settingsService.set('display.show_ticker', data.showTicker ? 'true' : 'false');
        }
        if (data.boardTitle !== undefined) {
            await settingsService.set('display.board_title', data.boardTitle || '');
        }

        await logAction(db, {
            userId: req.user.user_id,
            action: 'DISPLAY_BOARD_CONFIG_UPDATED',
            resourceId: 'display.board',
            resourceTable: 'system_settings',
            ipAddress: req.ip,
            details: {
                patientDisplayMode: data.patientDisplayMode ?? undefined,
                showTicker: data.showTicker ?? undefined,
                boardTitle: data.boardTitle ?? undefined
            }
        });

        res.json({
            message: 'Display board configuration updated',
            config: {
                patientDisplayMode: data.patientDisplayMode,
                showTicker: data.showTicker,
                boardTitle: data.boardTitle
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
        const existing = await client.query(`
            SELECT announcement_id FROM display_announcements WHERE announcement_id = $1 FOR UPDATE
        `, [id]);
        if (!existing.rows.length) {
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
        const existing = await client.query(`
            SELECT announcement_id, title FROM display_announcements WHERE announcement_id = $1 FOR UPDATE
        `, [id]);
        if (!existing.rows.length) {
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
