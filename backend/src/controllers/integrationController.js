const { AppError } = require('../middleware/errorHandler');
const { z } = require('zod');
const { decrypt, encrypt } = require('../utils/crypto');
const {
    updateIntegrationSchema,
    triggerTestSmsSchema,
    exportAccountingQuerySchema
} = require('../schemas/integrationSchema');
const IntegrationService = require('../services/integrationService');
const { logAction } = require('../services/auditService');
const { invalidateWebhookSecretCache } = require('../middleware/webhookAuth');

const getMissingConfiguration = (providerName, config) => {
    const requirements = {
        Twilio: [['api_key', 'Account SID'], ['api_secret', 'Auth Token'], ['sender_identity', 'sender number']],
        WhatsApp: [['api_key', 'Account SID'], ['api_secret', 'Auth Token'], ['sender_identity', 'WhatsApp sender']],
        Stripe: [['api_secret', 'secret key'], ['webhook_secret', 'webhook signing secret']],
        QuickBooks: [['api_key', 'OAuth access token'], ['realm_id', 'Realm ID']],
        PACS_Orthanc: [['webhook_url', 'Orthanc server URL']]
    };
    return (requirements[providerName] || []).filter(([key]) => {
        if (key === 'realm_id') return !config.extra_config?.realm_id;
        return !config[key];
    }).map(([, label]) => label);
};

const auditIntegrationAction = (db, req, action, resourceId, details = {}) => logAction(db, {
    userId: req.user?.user_id || null,
    actorRole: req.user?.role || null,
    action,
    eventCode: `INTEGRATION.${action}`,
    category: 'CONFIG',
    severity: action.includes('SECRET') || action.includes('REQUEUE') ? 40 : 30,
    resourceId,
    resourceTable: 'integrations',
    ipAddress: req.ip,
    userAgent: req.get?.('user-agent') || null,
    httpMethod: req.method,
    requestPath: req.originalUrl?.split('?')[0],
    details
});

const getIntegrations = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT integration_id, provider_name, type, webhook_url, is_active,
                   created_at, updated_at, secret_version, last_rotated_at,
                   sender_identity, extra_config, health_status, last_checked_at,
                   last_success_at, last_error_code, last_error_message, config_version,
                   (api_key IS NOT NULL) AS has_api_key,
                   (api_secret IS NOT NULL) AS has_api_secret,
                   (webhook_secret IS NOT NULL) AS has_webhook_secret
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

        const currentRes = await db.query(
            `SELECT provider_name, api_key, api_secret, webhook_secret, webhook_url,
                    sender_identity, extra_config, is_active, config_version
             FROM integrations WHERE integration_id = $1`,
            [id]
        );
        if (currentRes.rows.length === 0) return next(new AppError('Integration not found', 404));
        const current = currentRes.rows[0];

        const clearFields = new Set(data.clear_fields || []);

        let apiKeyVal = data.api_key !== undefined ? (data.api_key?.trim() ? encrypt(data.api_key.trim()) : null) : undefined;
        if (clearFields.has('api_key')) apiKeyVal = null;

        let apiSecretVal = data.api_secret !== undefined ? (data.api_secret?.trim() ? encrypt(data.api_secret.trim()) : null) : undefined;
        if (clearFields.has('api_secret')) apiSecretVal = null;

        let webhookSecretVal = data.webhook_secret !== undefined ? (data.webhook_secret?.trim() ? encrypt(data.webhook_secret.trim()) : null) : undefined;
        if (clearFields.has('webhook_secret')) webhookSecretVal = null;

        let webhookUrlVal = data.webhook_url !== undefined ? (data.webhook_url?.trim() || null) : undefined;
        if (clearFields.has('webhook_url')) webhookUrlVal = null;

        let senderIdentityVal = data.sender_identity !== undefined ? (data.sender_identity?.trim() || null) : undefined;
        if (clearFields.has('sender_identity')) senderIdentityVal = null;

        const isCredentialChange = apiKeyVal !== undefined || apiSecretVal !== undefined || webhookSecretVal !== undefined;
        const isConfigurationChange = isCredentialChange
            || webhookUrlVal !== undefined
            || senderIdentityVal !== undefined
            || data.extra_config !== undefined;
        const isActivationChange = data.is_active !== undefined && data.is_active !== current.is_active;
        const healthInvalidated = isConfigurationChange || isActivationChange;
        const effective = {
            api_key: apiKeyVal !== undefined ? apiKeyVal : current.api_key,
            api_secret: apiSecretVal !== undefined ? apiSecretVal : current.api_secret,
            webhook_secret: webhookSecretVal !== undefined ? webhookSecretVal : current.webhook_secret,
            webhook_url: webhookUrlVal !== undefined ? webhookUrlVal : current.webhook_url,
            sender_identity: senderIdentityVal !== undefined ? senderIdentityVal : current.sender_identity,
            extra_config: data.extra_config !== undefined ? data.extra_config : current.extra_config
        };
        const effectiveActive = data.is_active ?? current.is_active;
        const missing = effectiveActive ? getMissingConfiguration(current.provider_name, effective) : [];
        if (missing.length) {
            return next(new AppError(`Cannot enable ${current.provider_name}; missing ${missing.join(', ')}`, 409));
        }

        const expectedVersion = data.config_version || current.config_version;
        const nextHealthStatus = !effectiveActive ? 'Disabled' : healthInvalidated ? 'Unknown' : null;

        const result = await db.query(
            `UPDATE integrations
             SET api_key = CASE WHEN $1::boolean THEN $2 ELSE api_key END,
                 api_secret = CASE WHEN $3::boolean THEN $4 ELSE api_secret END,
                 webhook_secret = CASE WHEN $5::boolean THEN $6 ELSE webhook_secret END,
                 webhook_url = CASE WHEN $7::boolean THEN $8 ELSE webhook_url END,
                 sender_identity = CASE WHEN $9::boolean THEN $10 ELSE sender_identity END,
                 is_active = COALESCE($11, is_active),
                 extra_config = COALESCE($12, extra_config),
                 secret_version = CASE WHEN $13::boolean THEN COALESCE(secret_version, 1) + 1 ELSE secret_version END,
                 last_rotated_at = CASE WHEN $13::boolean THEN CURRENT_TIMESTAMP ELSE last_rotated_at END,
                 health_status = COALESCE($14, health_status),
                 last_error_code = CASE WHEN $15::boolean THEN NULL ELSE last_error_code END,
                 last_error_message = CASE WHEN $15::boolean THEN NULL ELSE last_error_message END,
                 last_checked_at = CASE WHEN $15::boolean THEN NULL ELSE last_checked_at END,
                 config_version = config_version + 1,
                 updated_by = $16,
                 updated_at = CURRENT_TIMESTAMP
             WHERE integration_id = $17 AND config_version = $18
             RETURNING integration_id, provider_name, type, webhook_url, is_active,
                       created_at, updated_at, secret_version, last_rotated_at,
                       sender_identity, extra_config, health_status, last_checked_at,
                       last_success_at, last_error_code, last_error_message, config_version,
                       (api_key IS NOT NULL) AS has_api_key,
                       (api_secret IS NOT NULL) AS has_api_secret,
                       (webhook_secret IS NOT NULL) AS has_webhook_secret`,
            [
                apiKeyVal !== undefined, apiKeyVal,
                apiSecretVal !== undefined, apiSecretVal,
                webhookSecretVal !== undefined, webhookSecretVal,
                webhookUrlVal !== undefined, webhookUrlVal,
                senderIdentityVal !== undefined, senderIdentityVal,
                data.is_active,
                data.extra_config ? JSON.stringify(data.extra_config) : null,
                isCredentialChange,
                nextHealthStatus,
                healthInvalidated,
                req.user?.user_id || null,
                id,
                expectedVersion
            ]
        );

        if (result.rows.length === 0) return next(new AppError('Integration configuration changed in another session. Reload and try again.', 409));

        const updated = result.rows[0];
        const service = new IntegrationService(db);
        service.invalidateSecretCache(updated.provider_name);
        if (isCredentialChange) {
            invalidateWebhookSecretCache(updated.provider_name);
        }

        auditIntegrationAction(db, req, isCredentialChange ? 'SECRET_ROTATED' : 'CONFIG_UPDATED', id, {
            provider: updated.provider_name,
            isActive: updated.is_active,
            credentialFieldsChanged: [
                apiKeyVal !== undefined ? 'api_key' : null,
                apiSecretVal !== undefined ? 'api_secret' : null,
                webhookSecretVal !== undefined ? 'webhook_secret' : null
            ].filter(Boolean)
        }).catch(() => {});

        res.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getLogs = (db) => async (req, res, next) => {
    try {
        const { status, provider, event_type, limit = 100, offset = 0, page } = req.query;
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
        const parsedOffset = page ? (Math.max(parseInt(page, 10) || 1, 1) - 1) * parsedLimit : Math.max(parseInt(offset, 10) || 0, 0);

        const clauses = ['1=1'];
        const params = [];
        let param = 1;

        if (status && status !== 'all') {
            clauses.push(`l.status = $${param++}`);
            params.push(status);
        }
        if (provider && provider !== 'all') {
            clauses.push(`i.provider_name = $${param++}`);
            params.push(provider);
        }
        if (event_type) {
            clauses.push(`l.event_type ILIKE $${param++}`);
            params.push(`%${event_type}%`);
        }

        const countQuery = `
            SELECT COUNT(*) AS total
            FROM integration_logs l
            JOIN integrations i ON l.integration_id = i.integration_id
            WHERE ${clauses.join(' AND ')}
        `;
        const countRes = await db.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || '0', 10);

        const dataQuery = `
            SELECT l.log_id, l.integration_id, l.event_type,
                   COALESCE(l.payload, '{}'::jsonb)
                       - 'to' - 'To' - 'body' - 'data' - 'to_enc' - 'body_enc' AS payload,
                   l.status, l.error_message, l.retry_count, l.delivery_attempt,
                   l.max_retries, l.next_retry_at, l.dead_letter_reason,
                   l.completed_at, l.created_at, l.updated_at, i.provider_name
            FROM integration_logs l
            JOIN integrations i ON l.integration_id = i.integration_id
            WHERE ${clauses.join(' AND ')}
            ORDER BY l.created_at DESC
            LIMIT $${param++} OFFSET $${param++}
        `;
        const dataRes = await db.query(dataQuery, [...params, parsedLimit, parsedOffset]);

        res.setHeader('X-Total-Count', total);
        res.json(dataRes.rows);
    } catch (error) {
        next(error);
    }
};

const retryEvent = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const service = new IntegrationService(db);
        const result = await service.retryEvent(id);
        auditIntegrationAction(db, req, 'EVENT_RETRIED', id, { deduped: result.deduped }).catch(() => {});
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
        auditIntegrationAction(db, req, 'EVENT_REQUEUED', id).catch(() => {});
        res.json({ message: 'Dead-letter event requeued successfully', ...result });
    } catch (error) {
        next(error);
    }
};

const seedIntegrations = (db) => async (req, res, next) => {
    try {
        const countRes = await db.query('SELECT COUNT(*) as count FROM integrations');
        const existingCount = parseInt(countRes.rows[0]?.count || '0', 10);

        const providers = [
            { name: 'Twilio', type: 'SMS' },
            { name: 'WhatsApp', type: 'Messaging' },
            { name: 'Stripe', type: 'Payment' },
            { name: 'QuickBooks', type: 'Accounting' },
            { name: 'PACS_Orthanc', type: 'PACS' }
        ];

        for (const p of providers) {
            await db.query(
                `INSERT INTO integrations (provider_name, type, is_active, health_status, max_retries, retry_backoff_ms, webhook_timeout_ms)
                 VALUES ($1, $2, FALSE, 'Disabled', 3, 1000, 5000)
                 ON CONFLICT (provider_name) DO UPDATE SET
                    type = EXCLUDED.type,
                    health_status = CASE
                        WHEN integrations.is_active THEN integrations.health_status
                        ELSE 'Disabled'
                    END`,
                [p.name, p.type]
            );
        }

        invalidateWebhookSecretCache();

        auditIntegrationAction(db, req, 'PROVIDERS_INITIALIZED', null, {
            seededCount: providers.length,
            previousCount: existingCount
        }).catch(() => {});

        res.json({ message: 'Default integrations seeded successfully', seededCount: providers.length, previousCount: existingCount });
    } catch (error) {
        next(error);
    }
};

const testIntegration = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT integration_id, provider_name, type, is_active
             FROM integrations WHERE integration_id = $1`,
            [id]
        );
        if (result.rows.length === 0) return next(new AppError('Integration not found', 404));

        const integration = result.rows[0];
        const service = new IntegrationService(db);
        let testResult;

        try {
            const health = await service.testProviderConnection(integration.provider_name);
            testResult = {
                status: 'HEALTHY',
                latencyMs: health.latencyMs,
                message: `${integration.provider_name} connection verified successfully`
            };
        } catch (err) {
            const errorCode = String(err.code || err.name || 'CONNECTION_FAILED').replace(/[^A-Z0-9_-]/gi, '_').slice(0, 80);
            testResult = {
                status: 'UNHEALTHY',
                errorCode,
                message: `${integration.provider_name} connection could not be verified`
            };
        }

        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE integrations
                 SET health_status = $2,
                     last_checked_at = CURRENT_TIMESTAMP,
                     last_success_at = CASE WHEN $2 = 'Healthy' THEN CURRENT_TIMESTAMP ELSE last_success_at END,
                     last_error_code = $3,
                     last_error_message = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE integration_id = $1`,
                [
                    id,
                    testResult.status === 'HEALTHY' ? 'Healthy' : 'Unhealthy',
                    testResult.errorCode || null,
                    testResult.status === 'HEALTHY' ? null : testResult.message
                ]
            );
            await client.query(
                `INSERT INTO integration_logs (integration_id, event_type, status, error_message, provider_response, completed_at)
                 VALUES ($1, 'HEALTH_CHECK_TEST', $2, $3, $4, CURRENT_TIMESTAMP)`,
                [
                    id,
                    testResult.status === 'HEALTHY' ? 'Success' : 'HealthFailed',
                    testResult.status === 'HEALTHY' ? null : testResult.message,
                    JSON.stringify({
                        status: testResult.status,
                        latencyMs: testResult.latencyMs || null,
                        errorCode: testResult.errorCode || null
                    })
                ]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        auditIntegrationAction(db, req, 'CONNECTION_TESTED', id, {
            provider: integration.provider_name,
            outcome: testResult.status,
            latencyMs: testResult.latencyMs || null,
            errorCode: testResult.errorCode || null
        }).catch(() => {});

        res.json({ ...testResult, provider: integration.provider_name });
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
        await service.sendSMS(data.phone, data.message, { mock: true });
        res.json({ message: 'Test SMS queued to mock provider' });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const exportAccounting = (db) => async (req, res, next) => {
    try {
        const { Parser } = require('json2csv');
        const queryParams = exportAccountingQuerySchema.parse(req.query);
        const { startDate, endDate } = queryParams;

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
        } else if (startDate) {
            query += ' AND i.created_at >= $1::timestamp';
            params.push(startDate);
        } else if (endDate) {
            query += ' AND i.created_at < ($1::date + \'1 day\'::interval)';
            params.push(endDate);
        }

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return next(new AppError('No data available for export in this date range', 404));
        }

        const exportRows = result.rows.map(({ first_name_enc, last_name_enc, ...row }) => ({
            ...row,
            patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' ')
        }));
        // CSV quoting alone does not prevent spreadsheet formula execution.
        for (const row of exportRows) {
            for (const key of Object.keys(row)) {
                if (typeof row[key] === 'string' && /^[\s\uFEFF]*[=+@-]/u.test(row[key])
                    && !/^-?\d+(?:\.\d+)?$/.test(row[key])) {
                    row[key] = `'${row[key]}`;
                }
            }
        }
        const parser = new Parser();
        const csv = parser.parse(exportRows);

        auditIntegrationAction(db, req, 'ACCOUNTING_EXPORTED', null, {
            rowCount: exportRows.length,
            startDate: startDate || null,
            endDate: endDate || null
        }).catch(() => {});

        res.header('Content-Type', 'text/csv');
        res.attachment(`accounting_fallback_export_${new Date().getTime()}.csv`);
        res.send(csv);

    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
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
