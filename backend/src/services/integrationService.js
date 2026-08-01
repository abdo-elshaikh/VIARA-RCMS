const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Integration Service
 * Acts as an abstraction layer for outbound communications.
 * Uses mock implementations since actual provider credentials are not available.
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

    /**
     * Fetch active integration config
     */
    async getProviderConfig(providerName) {
        const result = await this.db.query(
            'SELECT * FROM integrations WHERE provider_name = $1 AND is_active = TRUE',
            [providerName]
        );
        return result.rows[0] || null;
    }

    /**
     * Log the integration attempt
     */
    async logEvent(integrationId, eventType, payload, status, errorMessage = null) {
        const result = await this.db.query(
            `INSERT INTO integration_logs (integration_id, event_type, payload, status, error_message)
            VALUES ($1, $2, $3, $4, $5) RETURNING log_id`,
            [integrationId, eventType, JSON.stringify(payload), status, errorMessage]
        );
        return result.rows[0].log_id;
    }

    /**
     * Update log status (used for retries)
     */
    async updateLogStatus(logId, status, errorMessage = null) {
        await this.db.query(
            `UPDATE integration_logs 
            SET status = $1, error_message = $2, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE log_id = $3`,
            [status, errorMessage, logId]
        );
    }

    // ==========================================
    // MOCK GATEWAYS
    // ==========================================

    /**
     * Mock SMS Sender (Twilio placeholder)
     */
    async sendSMS(phoneNumber, message) {
        this.assertMockAllowed();
        const provider = await this.getProviderConfig('Twilio');
        if (!provider) throw new Error('Twilio integration is not active or configured.');

        const payload = { to_enc: encrypt(phoneNumber), body_enc: encrypt(message) };
        let status = 'Success';
        let error = null;

        console.log('[MOCK Twilio] Sending redacted SMS payload');

        // Simulate 10% failure rate for testing retries
        if (Math.random() < 0.1) {
            status = 'Failed';
            error = 'Mock API timeout';
            console.error(`[MOCK Twilio] SMS Failed`);
        }

        await this.logEvent(provider.integration_id, 'Outbound SMS', payload, status, error);

        if (status === 'Failed') throw new Error(error);
        return { success: true };
    }

    /**
     * Mock Payment Gateway (Stripe placeholder)
     */
    async capturePayment(invoiceId, amount, currency = 'USD') {
        this.assertMockAllowed();
        const provider = await this.getProviderConfig('Stripe');
        if (!provider) throw new Error('Stripe integration is not active or configured.');

        const payload = { invoice_id: invoiceId, amount, currency };
        let status = 'Success';
        let error = null;

        console.log(`[MOCK Stripe] Capturing ${amount} ${currency} for Invoice #${invoiceId}`);

        // Simulate 10% failure rate for testing retries
        if (Math.random() < 0.1) {
            status = 'Failed';
            error = 'Card declined (Mock)';
            console.error(`[MOCK Stripe] Payment Failed`);
        }

        await this.logEvent(provider.integration_id, 'Payment Capture', payload, status, error);

        if (status === 'Failed') throw new Error(error);
        return { success: true, transaction_id: 'mock_txn_' + Date.now() };
    }

    /**
     * Execute a failed event again based on the log ID
     */
    async retryEvent(logId) {
        const logRes = await this.db.query(
            'SELECT * FROM integration_logs WHERE log_id = $1',
            [logId]
        );
        const log = logRes.rows[0];

        if (!log) throw new Error('Log not found');
        if (log.status === 'Success') throw new Error('Event already successful');

        // Based on event type, route to the correct mock method
        try {
            if (log.event_type === 'Outbound SMS') {
                const to = log.payload.to_enc ? decrypt(log.payload.to_enc) : log.payload.to;
                const body = log.payload.body_enc ? decrypt(log.payload.body_enc) : log.payload.body;
                await this.sendSMS(to, body);
            } else if (log.event_type === 'Payment Capture') {
                const { invoice_id, amount, currency } = log.payload;
                await this.capturePayment(invoice_id, amount, currency);
            } else {
                throw new Error('Unsupported retry event type');
            }

            // If it succeeded, update the old log as well so we know it was retried successfully
            await this.updateLogStatus(logId, 'Retried');
            return { success: true };
        } catch (error) {
            await this.updateLogStatus(logId, 'Failed', error.message);
            throw error;
        }
    }
}

module.exports = IntegrationService;
