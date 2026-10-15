/**
 * User Pool and Concurrency Manager for simulating virtual users (VUs)
 */

const ApiClient = require('./apiClient');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class UserPool {
    constructor(config) {
        this.config = config;
        this.tokens = new Map();
        this.authPromises = new Map();
    }

    /**
     * Clears cached auth tokens for a specific role or all roles
     */
    invalidate(role) {
        if (role) {
            this.tokens.delete(role);
            this.authPromises.delete(role);
        } else {
            this.tokens.clear();
            this.authPromises.clear();
        }
    }

    /**
     * Authenticates a role and caches the JWT token
     */
    async authenticate(role = 'admin') {
        const userCreds = this.config.users[role];
        if (!userCreds) {
            throw new Error(`Unknown user role: ${role}`);
        }

        if (this.tokens.has(role)) {
            return this.tokens.get(role);
        }

        if (this.authPromises.has(role)) {
            return this.authPromises.get(role);
        }

        const authPromise = (async () => {
            const client = new ApiClient(this.config.baseUrl, this.config.timeoutMs);

            // Fetch CSRF token first
            await client.get('/api/csrf-token');

            let loginPayload;
            let loginUrl = '/api/auth/login';

            if (role === 'patient') {
                loginUrl = '/api/portal/login';
                loginPayload = {
                    mrn: userCreds.mrn,
                    password: userCreds.password
                };
            } else {
                loginPayload = {
                    email: userCreds.email,
                    password: userCreds.password
                };
            }

            const res = await client.post(loginUrl, loginPayload);

            if (!res.ok || !res.data?.token) {
                this.authPromises.delete(role);
                throw new Error(`Authentication failed for ${role} (${userCreds.email || userCreds.mrn}): ${res.error || res.status}`);
            }

            const token = res.data.token;
            const sessionData = {
                token,
                csrfToken: client.csrfToken,
                cookies: new Map(client.cookies)
            };
            this.tokens.set(role, sessionData);
            return sessionData;
        })();

        this.authPromises.set(role, authPromise);
        return authPromise;
    }

    /**
     * Creates an authenticated ApiClient for a specific role
     */
    async createAuthenticatedClient(role = 'admin') {
        const session = await this.authenticate(role);
        const client = new ApiClient(this.config.baseUrl, this.config.timeoutMs);
        client.setToken(session.token || session);
        if (session.csrfToken) {
            client.csrfToken = session.csrfToken;
        }
        if (session.cookies) {
            for (const [k, v] of session.cookies.entries()) {
                client.cookies.set(k, v);
            }
        }
        return client;
    }

    /**
     * Simulates realistic user think time between actions
     */
    async think(minMs, maxMs) {
        const min = minMs || this.config.thinkTime.minMs;
        const max = maxMs || this.config.thinkTime.maxMs;
        const duration = Math.floor(Math.random() * (max - min + 1)) + min;
        await sleep(duration);
    }

    /**
     * Runs a scenario across N concurrent virtual users for a given duration or iteration count
     */
    async runConcurrently({ scenarioFn, vus = 1, durationSeconds = 10, metricsCollector }) {
        const stopTime = Date.now() + (durationSeconds * 1000);
        let activeWorkers = 0;
        let totalIterations = 0;

        metricsCollector.start();

        const worker = async (vuId) => {
            activeWorkers++;
            try {
                while (Date.now() < stopTime) {
                    await scenarioFn({ vuId, userPool: this, metricsCollector });
                    totalIterations++;
                    await this.think();
                }
            } catch (err) {
                metricsCollector.record({
                    scenario: 'worker',
                    action: 'unhandled_worker_error',
                    method: 'INTERNAL',
                    endpoint: `VU-${vuId}`,
                    duration: 0,
                    status: 500,
                    ok: false,
                    error: err.message
                });
            } finally {
                activeWorkers--;
            }
        };

        const workers = [];
        for (let i = 1; i <= vus; i++) {
            workers.push(worker(i));
        }

        await Promise.all(workers);
        metricsCollector.stop();

        return { totalIterations };
    }
}

module.exports = UserPool;
