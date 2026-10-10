const { encrypt, decrypt } = require('../utils/crypto');

const decryptStoredValue = (value) => {
    if (!value) return null;
    return String(value).startsWith('v2:') ? decrypt(value) : String(value);
};

const withTimeout = async (operation, timeoutMs, label) => {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Integration Service
 * Abstraction layer for outbound communications.
 * Supports real provider dispatch, idempotent logging, retries, and dead-letter handling.
 */

class IntegrationService {
    constructor(db) {
        this.db = db;
    }

    assertMockAllowed() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Mock integrations are disabled in production');
        }
    }

    // ==========================================
    // CONFIG & SECRETS
    // ==========================================

    async getProviderConfig(providerName, { requireActive = true } = {}) {
        if (!this.db || typeof this.db.query !== 'function') {
            this.assertMockAllowed();
            return null;
        }
        const result = await this.db.query(
            `SELECT * FROM integrations
             WHERE provider_name = $1
               AND ($2::boolean = FALSE OR is_active = TRUE)`,
            [providerName, requireActive]
        );
        return result.rows[0] || null;
    }

    async getDecryptedApiKey(providerName, { requireActive = true } = {}) {
        const result = await this.db.query(
            `SELECT api_key FROM integrations
             WHERE provider_name = $1
               AND ($2::boolean = FALSE OR is_active = TRUE)`,
            [providerName, requireActive]
        );
        const row = result.rows[0];
        if (!row || !row.api_key) return null;

        return decryptStoredValue(row.api_key);
    }

    async getDecryptedSecret(providerName, { requireActive = true } = {}) {
        const result = await this.db.query(
            `SELECT api_secret, webhook_secret, sender_identity, secret_version
             FROM integrations
             WHERE provider_name = $1
               AND ($2::boolean = FALSE OR is_active = TRUE)`,
            [providerName, requireActive]
        );
        const row = result.rows[0];
        if (!row) return null;

        return {
            secret: decryptStoredValue(row.api_secret),
            webhookSecret: decryptStoredValue(row.webhook_secret),
            senderIdentity: row.sender_identity || null,
            version: row.secret_version || 1
        };
    }

    invalidateSecretCache() {
        // Credentials are intentionally read for each operation. This no-op is
        // retained for compatibility with callers from older deployments.
    }

    async testProviderConnection(providerName) {
        const provider = await this.getProviderConfig(providerName, { requireActive: false });
        if (!provider) throw new Error('Integration not found');

        const timeoutMs = Math.min(Math.max(Number(provider.webhook_timeout_ms) || 5000, 500), 30000);
        const apiKey = await this.getDecryptedApiKey(providerName, { requireActive: false });
        const secretData = await this.getDecryptedSecret(providerName, { requireActive: false });
        const secret = secretData?.secret || null;
        const startedAt = Date.now();

        if (providerName === 'Twilio' || providerName === 'WhatsApp') {
            if (!apiKey || !secret) throw new Error('Twilio Account SID or Auth Token is not configured');
            if (!String(apiKey).startsWith('AC')) throw new Error('Invalid Twilio Account SID format');
            const twilio = require('twilio');
            const client = twilio(apiKey, secret);
            await withTimeout(
                () => client.api.v2010.accounts(apiKey).fetch(),
                timeoutMs,
                `${providerName} health check`
            );
        } else if (providerName === 'Stripe') {
            if (!secret) throw new Error('Stripe secret key is not configured');
            if (!String(secret).startsWith('sk_') && !String(secret).startsWith('rk_')) {
                throw new Error('Invalid Stripe secret key format');
            }
            const stripe = require('stripe');
            const client = stripe(secret);
            await withTimeout(() => client.accounts.retrieve(), timeoutMs, 'Stripe health check');
        } else if (providerName === 'PACS_Orthanc') {
            const baseUrl = provider.webhook_url || provider.extra_config?.orthanc_url;
            if (!baseUrl) throw new Error('Orthanc server URL is not configured');
            const url = new URL('/system', String(baseUrl).endsWith('/') ? baseUrl : `${baseUrl}/`);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Orthanc URL must use HTTP or HTTPS');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const headers = apiKey || secret
                    ? { Authorization: `Basic ${Buffer.from(`${apiKey || ''}:${secret || ''}`).toString('base64')}` }
                    : {};
                const response = await fetch(url, { headers, signal: controller.signal });
                if (!response.ok) throw new Error(`Orthanc returned HTTP ${response.status}`);
            } finally {
                clearTimeout(timer);
            }
        } else if (providerName === 'QuickBooks') {
            const realmId = provider.extra_config?.realm_id;
            if (!apiKey || !realmId) throw new Error('QuickBooks access token and Realm ID are required');
            const environment = provider.extra_config?.environment === 'production' ? 'quickbooks.api.intuit.com' : 'sandbox-quickbooks.api.intuit.com';
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(`https://${environment}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=75`, {
                    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`QuickBooks returned HTTP ${response.status}`);
            } finally {
                clearTimeout(timer);
            }
        } else {
            throw new Error(`Unsupported integration provider: ${providerName}`);
        }

        return { status: 'HEALTHY', latencyMs: Date.now() - startedAt };
    }

    // ==========================================
    // IDEMPOTENT LOGGING
    // ==========================================

    async logEvent(integrationId, eventType, payload, status, options = {}) {
        const {
            idempotencyKey = null,
            webhookId = null,
            errorMessage = null,
            providerResponse = null,
            deliveryAttempt = 1,
            maxRetries = 3
        } = options;

        const nextRetryAt = status === 'Failed' && deliveryAttempt < maxRetries
            ? new Date(Date.now() + Math.pow(2, deliveryAttempt) * 1000)
            : null;

        const result = await this.db.query(
            `INSERT INTO integration_logs (
                integration_id, event_type, payload, status, error_message,
                idempotency_key, webhook_id, delivery_attempt, max_retries,
                next_retry_at, provider_response, retry_count, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, GREATEST($8 - 1, 0),
                      CASE WHEN $4::text IN ('Success', 'Retried', 'DeadLetter') THEN CURRENT_TIMESTAMP ELSE NULL END)
            ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
            DO UPDATE SET
                integration_id = EXCLUDED.integration_id,
                event_type = EXCLUDED.event_type,
                payload = EXCLUDED.payload,
                status = CASE
                    WHEN integration_logs.status IN ('Success', 'Retried') THEN integration_logs.status
                    ELSE EXCLUDED.status
                END,
                error_message = CASE
                    WHEN integration_logs.status IN ('Success', 'Retried') THEN integration_logs.error_message
                    ELSE EXCLUDED.error_message
                END,
                webhook_id = COALESCE(EXCLUDED.webhook_id, integration_logs.webhook_id),
                delivery_attempt = GREATEST(integration_logs.delivery_attempt, EXCLUDED.delivery_attempt),
                max_retries = EXCLUDED.max_retries,
                retry_count = GREATEST(integration_logs.retry_count, EXCLUDED.retry_count),
                next_retry_at = CASE
                    WHEN integration_logs.status IN ('Success', 'Retried') THEN NULL
                    ELSE EXCLUDED.next_retry_at
                END,
                provider_response = COALESCE(EXCLUDED.provider_response, integration_logs.provider_response),
                completed_at = CASE
                    WHEN integration_logs.status IN ('Success', 'Retried') THEN integration_logs.completed_at
                    ELSE EXCLUDED.completed_at
                END,
                updated_at = CURRENT_TIMESTAMP
            RETURNING log_id, status, status IN ('Success', 'Retried') AND status <> $4::text AS deduped`,
            [
                integrationId, eventType, JSON.stringify(payload), status, errorMessage,
                idempotencyKey, webhookId, deliveryAttempt, maxRetries,
                nextRetryAt, providerResponse ? JSON.stringify(providerResponse) : null
            ]
        );
        return { logId: result.rows[0].log_id, deduped: result.rows[0].deduped === true };
    }

    async findCompletedEvent(idempotencyKey) {
        if (!idempotencyKey) return null;
        const result = await this.db.query(
            `SELECT log_id, status
             FROM integration_logs
             WHERE idempotency_key = $1
               AND status IN ('Success', 'Retried')
             LIMIT 1`,
            [idempotencyKey]
        );
        return result.rows[0] || null;
    }

    async updateLogStatus(logId, status, errorMessage = null, providerResponse = null) {
        await this.db.query(
            `UPDATE integration_logs
             SET status = $1, error_message = $2, retry_count = retry_count + 1,
                 updated_at = CURRENT_TIMESTAMP,
                 completed_at = CASE WHEN $1::text IN ('Success', 'Retried', 'DeadLetter') THEN CURRENT_TIMESTAMP ELSE completed_at END,
                 provider_response = COALESCE($4, provider_response),
                 next_retry_at = CASE
                     WHEN $1::text = 'Failed' AND retry_count + 1 < max_retries
                         THEN NOW() + INTERVAL '1 second' * POWER(2, retry_count + 1)
                     ELSE NULL
                 END
             WHERE log_id = $3`,
            [status, errorMessage, logId, providerResponse ? JSON.stringify(providerResponse) : null]
        );
    }

    async moveToDeadLetter(logId, reason) {
        await this.db.query(
            `UPDATE integration_logs
             SET status = 'DeadLetter', dead_letter_reason = $2, completed_at = CURRENT_TIMESTAMP
             WHERE log_id = $1`,
            [logId, reason]
        );
    }

    // ==========================================
    // PROVIDER DISPATCH
    // ==========================================

    async sendSMS(phoneNumber, message, options = {}) {
        if (options.mock) {
            this.assertMockAllowed();
        }
        const provider = await this.getProviderConfig('Twilio');
        if (!provider) throw new Error('Twilio integration is not active or configured.');

        const payload = { to_enc: encrypt(phoneNumber), body_enc: encrypt(message) };
        const idempotencyKey = options.idempotencyKey || `sms:${provider.integration_id}:${phoneNumber}:${Date.now()}`;
        let providerMessageId = null;

        const completed = await this.findCompletedEvent(idempotencyKey);
        if (completed) {
            return { success: true, logId: completed.log_id, deduped: true, providerMessageId: null };
        }

        try {
            if (process.env.NODE_ENV !== 'production' && options.mock) {
                console.log('[MOCK Twilio] Sending redacted SMS payload');
                if (Math.random() < 0.1) throw new Error('Mock API timeout');
            } else {
                const secretData = await this.getDecryptedSecret('Twilio');
                const secret = typeof secretData === 'object' ? secretData?.secret : secretData;
                const apiKey = await this.getDecryptedApiKey('Twilio') || process.env.TWILIO_ACCOUNT_SID;
                if (!apiKey || !secret) throw new Error('Twilio Account SID or Auth Token missing');
                const twilio = require('twilio');
                const client = twilio(apiKey, secret);
                const statusCallback = options.statusCallback || process.env.TWILIO_STATUS_CALLBACK_URL
                    || (process.env.PUBLIC_API_URL
                        ? `${process.env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/webhooks/twilio`
                        : undefined);
                const fromNumber = options.from || provider.sender_identity || process.env.TWILIO_PHONE_NUMBER;
                if (!fromNumber) throw new Error('Twilio sender identity is not configured');
                const twilioMessage = await client.messages.create({
                    body: message,
                    from: fromNumber,
                    to: phoneNumber,
                    ...(statusCallback ? { statusCallback } : {})
                });
                providerMessageId = twilioMessage.sid || null;
            }

            const result = await this.logEvent(
                provider.integration_id, 'Outbound SMS', payload, 'Success',
                { idempotencyKey, webhookId: options.webhookId, deliveryAttempt: options.deliveryAttempt || 1, maxRetries: options.maxRetries || provider.max_retries || 3 }
            );
            return { success: true, logId: result.logId, deduped: result.deduped, providerMessageId };
        } catch (error) {
            const attempt = options.deliveryAttempt || 1;
            const maxRetries = options.maxRetries || provider.max_retries || 3;
            const result = await this.logEvent(
                provider.integration_id, 'Outbound SMS', payload, 'Failed',
                {
                    idempotencyKey, errorMessage: error.message,
                    deliveryAttempt: attempt, maxRetries,
                    providerResponse: options.providerResponse
                }
            );
            if (attempt >= maxRetries) {
                await this.moveToDeadLetter(result.logId, `Max retries (${maxRetries}) exceeded: ${error.message}`);
            }
            throw error;
        }
    }

    async sendWhatsApp(to, body, options = {}) {
        const provider = await this.getProviderConfig('WhatsApp');
        if (!provider) throw new Error('WhatsApp integration is not active or configured.');

        const payload = { to_enc: encrypt(to), body_enc: encrypt(body) };
        const idempotencyKey = options.idempotencyKey || `whatsapp:${provider.integration_id}:${to}:${Date.now()}`;
        let providerMessageId = null;

        const completed = await this.findCompletedEvent(idempotencyKey);
        if (completed) {
            return { success: true, logId: completed.log_id, deduped: true, providerMessageId: null };
        }

        try {
            if (process.env.NODE_ENV !== 'production' && options.mock) {
                console.log('[MOCK WhatsApp] Sending redacted payload');
                if (Math.random() < 0.1) throw new Error('Mock API timeout');
            } else {
                const secretData = await this.getDecryptedSecret('WhatsApp');
                const secret = typeof secretData === 'object' ? secretData?.secret : secretData;
                const apiKey = await this.getDecryptedApiKey('WhatsApp') || process.env.TWILIO_ACCOUNT_SID;
                if (!apiKey || !secret) throw new Error('WhatsApp Twilio SID or Auth Token missing');
                const twilio = require('twilio');
                const client = twilio(apiKey, secret);
                const from = options.from || provider.sender_identity || process.env.TWILIO_WHATSAPP_FROM;
                if (!from) throw new Error('WhatsApp sender identity is not configured');
                const statusCallback = options.statusCallback || process.env.TWILIO_STATUS_CALLBACK_URL
                    || (process.env.PUBLIC_API_URL
                        ? `${process.env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/webhooks/whatsapp`
                        : undefined);
                const twilioMessage = await client.messages.create({
                    body,
                    from: from?.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
                    to: to?.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
                    ...(statusCallback ? { statusCallback } : {})
                });
                providerMessageId = twilioMessage.sid || null;
            }

            const result = await this.logEvent(
                provider.integration_id, 'Outbound WhatsApp', payload, 'Success',
                { idempotencyKey, webhookId: options.webhookId, deliveryAttempt: options.deliveryAttempt || 1, maxRetries: options.maxRetries || provider.max_retries || 3 }
            );
            return { success: true, logId: result.logId, deduped: result.deduped, providerMessageId };
        } catch (error) {
            const attempt = options.deliveryAttempt || 1;
            const maxRetries = options.maxRetries || provider.max_retries || 3;
            const result = await this.logEvent(
                provider.integration_id, 'Outbound WhatsApp', payload, 'Failed',
                {
                    idempotencyKey, errorMessage: error.message,
                    deliveryAttempt: attempt, maxRetries,
                    providerResponse: options.providerResponse
                }
            );
            if (attempt >= maxRetries) {
                await this.moveToDeadLetter(result.logId, `Max retries (${maxRetries}) exceeded: ${error.message}`);
            }
            throw error;
        }
    }

    async capturePayment(invoiceId, amount, currency = 'EGP', options = {}) {
        const provider = await this.getProviderConfig('Stripe');
        if (!provider) throw new Error('Stripe integration is not active or configured.');

        const payload = { invoice_id: invoiceId, amount, currency };
        const idempotencyKey = options.idempotencyKey || `payment:${provider.integration_id}:${invoiceId}:${amount}`;

        try {
            if (process.env.NODE_ENV !== 'production' && options.mock) {
                console.log(`[MOCK Stripe] Capturing ${amount} ${currency} for Invoice #${invoiceId}`);
                if (Math.random() < 0.1) throw new Error('Card declined (Mock)');
            } else {
                const stripe = require('stripe');
                const secretData = await this.getDecryptedSecret('Stripe');
                const secretKey = typeof secretData === 'object' ? secretData?.secret : secretData;
                if (!secretKey) throw new Error('Stripe secret key is not configured');
                const client = stripe(secretKey);
                const paymentIntent = await client.paymentIntents.create({
                    amount: Math.round(amount * 100),
                    currency: String(currency || 'EGP').toLowerCase(),
                    confirm: Boolean(options.paymentMethodId),
                    ...(options.paymentMethodId ? { payment_method: options.paymentMethodId } : {}),
                    metadata: { invoiceId: String(invoiceId) }
                }, { idempotencyKey });
                options.providerTransactionId = paymentIntent.id;
            }

            const result = await this.logEvent(
                provider.integration_id, 'Payment Capture', payload, 'Success',
                {
                    idempotencyKey, webhookId: options.webhookId,
                    deliveryAttempt: options.deliveryAttempt || 1,
                    maxRetries: provider.max_retries || 3
                }
            );
            return {
                success: true,
                transaction_id: options.providerTransactionId || null,
                logId: result.logId,
                deduped: result.deduped
            };
        } catch (error) {
            const attempt = options.deliveryAttempt || 1;
            const maxRetries = provider.max_retries || 3;
            const result = await this.logEvent(
                provider.integration_id, 'Payment Capture', payload, 'Failed',
                {
                    idempotencyKey, errorMessage: error.message,
                    deliveryAttempt: attempt, maxRetries,
                    providerResponse: options.providerResponse
                }
            );
            if (attempt >= maxRetries) {
                await this.moveToDeadLetter(result.logId, `Max retries (${maxRetries}) exceeded: ${error.message}`);
            }
            throw error;
        }
    }

    // ==========================================
    // RETRY / WORKER
    // ==========================================

    async retryEvent(logId) {
        const logRes = await this.db.query(
            'SELECT * FROM integration_logs WHERE log_id = $1',
            [logId]
        );
        const log = logRes.rows[0];

        if (!log) throw new Error('Log not found');
        if (['Success', 'Retried', 'DeadLetter'].includes(log.status)) {
            throw new Error(`Event in terminal state: ${log.status}`);
        }

        const nextAttempt = Number(log.delivery_attempt ?? 1) + 1;
        const maxRetries = log.max_retries || 3;

        try {
            let result;
            if (log.event_type === 'Outbound SMS') {
                const to = log.payload?.to_enc ? decrypt(log.payload.to_enc) : log.payload?.to;
                const body = log.payload?.body_enc ? decrypt(log.payload.body_enc) : log.payload?.body;
                result = await this.sendSMS(to, body, {
                    idempotencyKey: log.idempotency_key,
                    webhookId: log.webhook_id,
                    deliveryAttempt: nextAttempt,
                    maxRetries,
                    providerResponse: log.provider_response
                });
            } else if (log.event_type === 'Payment Capture') {
                throw new Error('Payment retries require manual reconciliation and cannot be replayed automatically');
            } else if (log.event_type === 'Outbound WhatsApp') {
                const to = log.payload?.to_enc ? decrypt(log.payload.to_enc) : log.payload?.to;
                const body = log.payload?.body_enc ? decrypt(log.payload.body_enc) : log.payload?.body;
                result = await this.sendWhatsApp(to, body, {
                    idempotencyKey: log.idempotency_key,
                    webhookId: log.webhook_id,
                    deliveryAttempt: nextAttempt,
                    maxRetries,
                    providerResponse: log.provider_response
                });
            } else {
                throw new Error(`Unsupported retry event type: ${log.event_type}`);
            }

            return { success: true, logId, deduped: result.deduped };
        } catch (error) {
            await this.db.query(
                `UPDATE integration_logs
                 SET status = 'Failed', error_message = $2,
                     retry_count = GREATEST(retry_count, $3 - 1),
                     delivery_attempt = GREATEST(delivery_attempt, $3),
                     next_retry_at = CASE
                         WHEN $3 < max_retries AND event_type IN ('Outbound SMS', 'Outbound WhatsApp')
                             THEN NOW() + INTERVAL '1 second' * POWER(2, $3)
                         ELSE NULL
                     END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE log_id = $1 AND status = 'Processing'`,
                [logId, error.message, nextAttempt]
            );
            if (nextAttempt >= maxRetries) {
                await this.moveToDeadLetter(logId, `Max retries (${maxRetries}) exceeded: ${error.message}`);
            }
            throw error;
        }
    }

    async getDeadLetterEvents(limit = 100, offset = 0) {
        const result = await this.db.query(
            `SELECT l.log_id, l.integration_id, l.event_type,
                    COALESCE(l.payload, '{}'::jsonb)
                        - 'to' - 'To' - 'body' - 'data' - 'to_enc' - 'body_enc' AS payload,
                    l.status, l.error_message, l.retry_count, l.delivery_attempt,
                    l.max_retries, l.next_retry_at, l.dead_letter_reason,
                    l.completed_at, l.created_at, l.updated_at, i.provider_name
             FROM integration_logs l
             JOIN integrations i ON l.integration_id = i.integration_id
             WHERE l.status = 'DeadLetter'
             ORDER BY l.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows;
    }

    async retryDeadLetterEvent(logId) {
        const logRes = await this.db.query(
            'SELECT * FROM integration_logs WHERE log_id = $1',
            [logId]
        );
        const log = logRes.rows[0];
        if (!log) throw new Error('Log not found');
        if (log.status !== 'DeadLetter') throw new Error('Event is not in dead-letter state');

        await this.db.query(
            `UPDATE integration_logs
             SET status = 'Pending', retry_count = 0, dead_letter_reason = NULL,
                  delivery_attempt = 0, completed_at = NULL,
                  next_retry_at = NOW(), updated_at = CURRENT_TIMESTAMP
             WHERE log_id = $1`,
            [logId]
        );
        return { success: true };
    }
}

module.exports = IntegrationService;
