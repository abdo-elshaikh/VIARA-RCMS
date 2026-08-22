const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Integration Service
 * Abstraction layer for outbound communications.
 * Supports real provider dispatch, idempotent logging, retries, and dead-letter handling.
 */

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

class IntegrationService {
    constructor(db) {
        this.db = db;
        this._secretCache = new Map();
    }

    assertMockAllowed() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Mock integrations are disabled in production');
        }
    }

    // ==========================================
    // CONFIG & SECRETS
    // ==========================================

    async getProviderConfig(providerName) {
        if (!this.db || typeof this.db.query !== 'function') {
            this.assertMockAllowed();
            return null;
        }
        const result = await this.db.query(
            'SELECT * FROM integrations WHERE provider_name = $1 AND is_active = TRUE',
            [providerName]
        );
        return result.rows[0] || null;
    }

    async getDecryptedApiKey(providerName) {
        const result = await this.db.query(
            'SELECT api_key FROM integrations WHERE provider_name = $1 AND is_active = TRUE',
            [providerName]
        );
        const row = result.rows[0];
        if (!row || !row.api_key) return null;

        return row.api_key.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(row.api_key)
            ? decrypt(row.api_key)
            : row.api_key;
    }

    async getDecryptedSecret(providerName) {
        if (this._secretCache.has(providerName)) {
            return this._secretCache.get(providerName);
        }

        const result = await this.db.query(
            'SELECT api_secret, secret_version FROM integrations WHERE provider_name = $1 AND is_active = TRUE',
            [providerName]
        );
        const row = result.rows[0];
        if (!row || !row.api_secret) return null;

        const secret = row.api_secret.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(row.api_secret)
            ? decrypt(row.api_secret)
            : row.api_secret;

        this._secretCache.set(providerName, { secret, version: row.secret_version || 1 });
        return { secret, version: row.secret_version || 1 };
    }

    invalidateSecretCache(providerName) {
        this._secretCache.delete(providerName);
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

        if (idempotencyKey) {
            const existing = await this.db.query(
                'SELECT log_id, status FROM integration_logs WHERE idempotency_key = $1 AND created_at > $2',
                [idempotencyKey, new Date(Date.now() - IDEMPOTENCY_WINDOW_MS)]
            );
            if (existing.rows.length > 0) {
                const existingLog = existing.rows[0];
                if (existingLog.status === 'Success') {
                    return { logId: existingLog.log_id, deduped: true };
                }
            }
        }

        const result = await this.db.query(
            `INSERT INTO integration_logs (
                integration_id, event_type, payload, status, error_message,
                idempotency_key, webhook_id, delivery_attempt, max_retries,
                next_retry_at, provider_response
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING log_id`,
            [
                integrationId, eventType, JSON.stringify(payload), status, errorMessage,
                idempotencyKey, webhookId, deliveryAttempt, maxRetries,
                nextRetryAt, providerResponse ? JSON.stringify(providerResponse) : null
            ]
        );
        return { logId: result.rows[0].log_id, deduped: false };
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
                const twilioMessage = await client.messages.create({
                    body: message,
                    from: options.from || process.env.TWILIO_PHONE_NUMBER,
                    to: phoneNumber
                });
                providerMessageId = twilioMessage.sid || null;
            }

            const result = await this.logEvent(
                provider.integration_id, 'Outbound SMS', payload, 'Success',
                { idempotencyKey, webhookId: options.webhookId, deliveryAttempt: options.deliveryAttempt || 1, maxRetries: provider.max_retries || 3 }
            );
            return { success: true, logId: result.logId, deduped: result.deduped, providerMessageId };
        } catch (error) {
            const attempt = options.deliveryAttempt || 1;
            const maxRetries = provider.max_retries || 3;
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
                const from = options.from || process.env.TWILIO_WHATSAPP_FROM;
                const twilioMessage = await client.messages.create({
                    body,
                    from: from?.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
                    to: to?.startsWith('whatsapp:') ? to : `whatsapp:${to}`
                });
                providerMessageId = twilioMessage.sid || null;
            }

            const result = await this.logEvent(
                provider.integration_id, 'Outbound WhatsApp', payload, 'Success',
                { idempotencyKey, webhookId: options.webhookId, deliveryAttempt: options.deliveryAttempt || 1, maxRetries: provider.max_retries || 3 }
            );
            return { success: true, logId: result.logId, deduped: result.deduped, providerMessageId };
        } catch (error) {
            const attempt = options.deliveryAttempt || 1;
            const maxRetries = provider.max_retries || 3;
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
                await client.paymentIntents.create({
                    amount: Math.round(amount * 100),
                    currency,
                    confirm: true,
                    idempotencyKey,
                    metadata: { invoiceId: String(invoiceId) }
                });
            }

            const result = await this.logEvent(
                provider.integration_id, 'Payment Capture', payload, 'Success',
                {
                    idempotencyKey, webhookId: options.webhookId,
                    deliveryAttempt: options.deliveryAttempt || 1,
                    maxRetries: provider.max_retries || 3
                }
            );
            return { success: true, transaction_id: `txn_${result.logId}`, logId: result.logId, deduped: result.deduped };
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

        const nextAttempt = (log.delivery_attempt || 1) + 1;
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
                const { invoice_id, amount, currency } = log.payload || {};
                result = await this.capturePayment(invoice_id, amount, currency, {
                    idempotencyKey: log.idempotency_key,
                    webhookId: log.webhook_id,
                    deliveryAttempt: nextAttempt,
                    maxRetries,
                    providerResponse: log.provider_response
                });
            } else if (log.event_type === 'Outbound WhatsApp') {
                const { to, body } = log.payload || {};
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

            await this.updateLogStatus(logId, 'Retried', null, result.providerResponse || null);
            return { success: true, logId, deduped: result.deduped };
        } catch (error) {
            await this.updateLogStatus(logId, 'Failed', error.message);
            if (nextAttempt >= maxRetries) {
                await this.moveToDeadLetter(logId, `Max retries (${maxRetries}) exceeded: ${error.message}`);
            }
            throw error;
        }
    }

    async getDeadLetterEvents(limit = 100, offset = 0) {
        const result = await this.db.query(
            `SELECT l.*, i.provider_name
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
                 next_retry_at = NOW(), updated_at = CURRENT_TIMESTAMP
             WHERE log_id = $1`,
            [logId]
        );
        return { success: true };
    }
}

module.exports = IntegrationService;
