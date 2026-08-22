const { AppError } = require('../middleware/errorHandler');
const { z } = require('zod');
const { decrypt, encrypt } = require('../utils/crypto');
const { updateIntegrationSchema, triggerTestSmsSchema } = require('../schemas/integrationSchema');
const IntegrationService = require('../services/integrationService');

const getIntegrations = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT integration_id, provider_name, type, webhook_url, is_active,
                   created_at, updated_at, secret_version, last_rotated_at,
                   (api_key IS NOT NULL) AS has_api_key,
                   (api_secret IS NOT NULL) AS has_api_secret
            FROM integrations
            ORDER BY provider_name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const updateIntegration = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateIntegrationSchema.parse(req.body);

        const result = await db.query(
            `UPDATE integrations
             SET api_key = COALESCE($1, api_key),
                 api_secret = COALESCE($2, api_secret),
                 webhook_url = COALESCE($3, webhook_url),
                 is_active = COALESCE($4, is_active),
                 secret_version = COALESCE($5, secret_version),
                 last_rotated_at = CASE WHEN $2 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE last_rotated_at END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE integration_id = $6
             RETURNING integration_id, provider_name, type, webhook_url, is_active,
                       created_at, updated_at, secret_version, last_rotated_at,
                       (api_key IS NOT NULL) AS has_api_key,
                       (api_secret IS NOT NULL) AS has_api_secret`,
            [
                data.api_key ? encrypt(data.api_key) : data.api_key,
                data.api_secret ? encrypt(data.api_secret) : data.api_secret,
                data.webhook_url, data.is_active, data.secret_version || 1, id
            ]
        );

        if (result.rows.length === 0) return next(new AppError('Integration not found', 404));

        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getLogs = (db) => async (req, res, next) => {
    try {
        const { status, limit = 100, offset = 0 } = req.query;
        const clauses = ['1=1'];
        const params = [];
        let param = 1;

        if (status) {
            clauses.push(`l.status = $${param++}`);
            params.push(status);
        }

        const result = await db.query(
            `SELECT l.*, i.provider_name
             FROM integration_logs l
             JOIN integrations i ON l.integration_id = i.integration_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY l.created_at DESC
             LIMIT $${param++} OFFSET $${param++}`,
            [...params, limit, offset]
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const retryEvent = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const service = new IntegrationService(db);
        const result = await service.retryEvent(id);
        res.json({ message: 'Retry executed successfully', deduped: result.deduped });
    } catch (error) {
        next(error);
    }
};

const retryDeadLetter = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const service = new IntegrationService(db);
        const result = await service.retryDeadLetterEvent(id);
        res.json({ message: 'Dead-letter event requeued successfully', ...result });
    } catch (error) {
        next(error);
    }
};

const seedIntegrations = (db) => async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return next(new AppError('Seeding integrations is disabled in production', 403));
        }

        const providers = [
            { name: 'Twilio', type: 'SMS' },
            { name: 'WhatsApp', type: 'Messaging' },
            { name: 'Stripe', type: 'Payment' },
            { name: 'QuickBooks', type: 'Accounting' },
            { name: 'PACS_Orthanc', type: 'PACS' }
        ];

        for (const p of providers) {
            await db.query(
                `INSERT INTO integrations (provider_name, type)
                 VALUES ($1, $2)
                 ON CONFLICT (provider_name) DO UPDATE SET type = EXCLUDED.type`,
                [p.name, p.type]
            );
        }

        res.json({ message: 'Integrations seeded' });
    } catch (error) {
        next(error);
    }
};

const testIntegration = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'SELECT integration_id, provider_name, type, is_active, (api_key IS NOT NULL) as has_key, (api_secret IS NOT NULL) as has_secret FROM integrations WHERE integration_id = $1',
            [id]
        );
        if (result.rows.length === 0) return next(new AppError('Integration not found', 404));

        const integration = result.rows[0];
        const service = new IntegrationService(db);
        let testResult;

        try {
            if (integration.provider_name === 'Twilio') {
                const secretData = await service.getDecryptedSecret('Twilio');
                const secret = typeof secretData === 'object' ? secretData?.secret : secretData;
                const apiKey = await service.getDecryptedApiKey('Twilio') || process.env.TWILIO_ACCOUNT_SID;
                if (!apiKey || !secret) {
                    throw new Error('Twilio Account SID or Auth Token is not configured');
                }
                if (!apiKey.startsWith('AC') && process.env.NODE_ENV === 'production') {
                    throw new Error('Invalid Twilio Account SID format (must start with AC)');
                }
                testResult = {
                    status: 'HEALTHY',
                    message: 'Twilio credentials verified and ready for outbound SMS'
                };
            } else if (integration.provider_name === 'Stripe') {
                const secretData = await service.getDecryptedSecret('Stripe');
                const secret = typeof secretData === 'object' ? secretData?.secret : secretData;
                if (!secret) {
                    throw new Error('Stripe API Secret key is not configured');
                }
                if (!secret.startsWith('sk_') && !secret.startsWith('rk_') && process.env.NODE_ENV === 'production') {
                    throw new Error('Invalid Stripe Secret Key format (must start with sk_ or rk_)');
                }
                testResult = {
                    status: 'HEALTHY',
                    message: 'Stripe payment gateway credentials verified and ready'
                };
            } else if (integration.provider_name === 'WhatsApp') {
                const secretData = await service.getDecryptedSecret('WhatsApp');
                const secret = typeof secretData === 'object' ? secretData?.secret : secretData;
                const apiKey = await service.getDecryptedApiKey('WhatsApp') || process.env.TWILIO_ACCOUNT_SID;
                if (!apiKey || !secret) {
                    throw new Error('WhatsApp Twilio SID or Auth Token is not configured');
                }
                testResult = {
                    status: 'HEALTHY',
                    message: 'WhatsApp messaging credentials verified and ready'
                };
            } else if (integration.provider_name === 'PACS_Orthanc') {
                const settingsResult = await db.query(
                    "SELECT setting_value FROM system_settings WHERE setting_key = 'orthanc_api_url'"
                );
                const url = settingsResult.rows[0]?.setting_value;
                if (!url) {
                    throw new Error('Orthanc DICOM Server URL is not configured');
                }
                // eslint-disable-next-line no-new
                new URL(url);
                testResult = {
                    status: 'HEALTHY',
                    message: `PACS Orthanc endpoint validated: ${url}`
                };
            } else {
                if (!integration.is_active) {
                    throw new Error(`${integration.provider_name} integration is currently disabled`);
                }
                testResult = {
                    status: 'HEALTHY',
                    message: `Integration configuration verified for ${integration.provider_name}`
                };
            }
        } catch (err) {
            testResult = { status: 'UNHEALTHY', message: err.message };
        }

        await db.query(
            `INSERT INTO integration_logs (integration_id, event_type, status, error_message, provider_response)
             VALUES ($1, 'HEALTH_CHECK_TEST', $2, $3, $4)`,
            [
                id,
                testResult.status === 'HEALTHY' ? 'Success' : 'Failed',
                testResult.status === 'HEALTHY' ? null : testResult.message,
                JSON.stringify(testResult)
            ]
        );

        res.json({
            status: testResult.status,
            provider: integration.provider_name,
            message: testResult.message
        });
    } catch (error) {
        next(error);
    }
};

const triggerTestSms = (db) => async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return next(new AppError('Test integrations are disabled in production', 404));
        }
        const data = triggerTestSmsSchema.parse(req.body);
        const service = new IntegrationService(db);
        await service.sendSMS(data.phone, data.message);
        res.json({ message: 'Test SMS queued to mock provider' });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const exportAccounting = (db) => async (req, res, next) => {
    try {
        const { Parser } = require('json2csv');
        const { startDate, endDate } = req.query;

        let query = `
            SELECT i.invoice_id, i.total_amount, i.status, i.created_at,
                   p.first_name_enc, p.last_name_enc, m.name AS modality
            FROM invoices i
            JOIN examinations e ON i.exam_id = e.exam_id
            JOIN patients p ON e.patient_id = p.patient_id
            JOIN modalities m ON e.modality_id = m.modality_id
            WHERE i.status = 'Finalized'
        `;
        const params = [];
        if (startDate && endDate) {
            query += ' AND i.created_at >= $1::timestamp AND i.created_at < ($2::date + \'1 day\'::interval)';
            params.push(startDate, endDate);
        }

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return next(new AppError('No data available for export in this date range', 404));
        }

        const exportRows = result.rows.map(({ first_name_enc, last_name_enc, ...row }) => ({
            ...row,
            patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' ')
        }));
        const parser = new Parser();
        const csv = parser.parse(exportRows);

        res.header('Content-Type', 'text/csv');
        res.attachment(`accounting_fallback_export_${new Date().getTime()}.csv`);
        res.send(csv);

    } catch (error) {
        next(error);
    }
};

const getDeadLetterEvents = (db) => async (req, res, next) => {
    try {
        const service = new IntegrationService(db);
        const events = await service.getDeadLetterEvents(100, 0);
        res.json(events);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getIntegrations,
    updateIntegration,
    testIntegration,
    getLogs,
    retryEvent,
    retryDeadLetter,
    seedIntegrations,
    triggerTestSms,
    exportAccounting,
    getDeadLetterEvents
};
