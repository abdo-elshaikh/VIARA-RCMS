/**
 * User Pool and Concurrency Manager for simulating virtual users (VUs)
 */

const ApiClient = require('./apiClient');
const { AsyncLocalStorage } = require('node:async_hooks');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class UserPool {
    constructor(config) {
        this.config = config;
        this.tokens = new Map();
        this.authPromises = new Map();
        this.workerContext = new AsyncLocalStorage();
        this.roleAssignments = new Map();
    }

    /**
     * Clears cached auth tokens for a specific role or all roles
     */
    invalidate(role) {
        const vuId = this.workerContext.getStore()?.vuId;
        if (vuId) {
            const roles = role ? [role] : Object.keys(this.config.users);
            for (const name of roles) {
                const index = this.roleAssignments.get(name)?.get(vuId);
                const key = Array.isArray(this.config.users[name]) ? (index === undefined ? null : name + ':' + index) : name;
                if (key) { this.tokens.delete(key); this.authPromises.delete(key); }
            }
            return;
        }
        if (role) {
            for (const key of this.tokens.keys()) if (key === role || key.startsWith(role + ':')) this.tokens.delete(key);
            for (const key of this.authPromises.keys()) if (key === role || key.startsWith(role + ':')) this.authPromises.delete(key);
            this.roleAssignments.delete(role);
        } else {
            this.tokens.clear();
            this.authPromises.clear();
            this.roleAssignments.clear();
        }
    }

    /**
     * Authenticates a role and caches the JWT token
     */
    async authenticate(role = 'admin') {
        const pool = this.config.users[role];
        let userCreds = pool, sessionKey = role;
        if (Array.isArray(pool)) {
            if (!this.roleAssignments.has(role)) this.roleAssignments.set(role, new Map());
            const assignments = this.roleAssignments.get(role);
            const vuId = this.workerContext.getStore()?.vuId;
            if (vuId && !assignments.has(vuId)) {
                if (assignments.size >= pool.length) throw new Error('Not enough independent synthetic accounts for role ' + role);
                assignments.set(vuId, assignments.size);
            }
            const index = vuId ? assignments.get(vuId) : 0;
            userCreds = pool[index]; sessionKey = role + ':' + index;
        }
        if (!userCreds) {
            throw new Error(`Unknown user role: ${role}`);
        }

        if (this.tokens.has(sessionKey)) {
            return this.tokens.get(sessionKey);
        }

        if (this.authPromises.has(sessionKey)) {
            return this.authPromises.get(sessionKey);
        }

        const authPromise = (async () => {
            const client = new ApiClient(this.config.baseUrl, this.config.timeoutMs);
            client.branchId = this.config.branchId || null;

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
                this.authPromises.delete(sessionKey);
                throw new Error(`Authentication failed for ${role} (${userCreds.email || userCreds.mrn}): ${res.error || res.status}`);
            }

            const token = res.data.token;
            const sessionData = {
                token,
                csrfToken: client.csrfToken,
                cookies: new Map(client.cookies)
            };
            this.tokens.set(sessionKey, sessionData);
            return sessionData;
        })();

        this.authPromises.set(sessionKey, authPromise);
        return authPromise;
    }

    /**
     * Creates an authenticated ApiClient for a specific role
     */
    async createAuthenticatedClient(role = 'admin') {
        const session = await this.authenticate(role);
        const client = new ApiClient(this.config.baseUrl, this.config.timeoutMs);
        client.branchId = this.config.branchId || null;
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
    async runConcurrently({ scenarioFn, vus = 1, durationSeconds = 10, metricsCollector, rampUpSeconds = 0 }) {
        const stopTime = Date.now() + (durationSeconds * 1000);
        let activeWorkers = 0;
        let totalIterations = 0;

        metricsCollector.start();

        const worker = async (vuId) => {
            if (rampUpSeconds > 0) await sleep((vuId - 1) / Math.max(1, vus - 1) * rampUpSeconds * 1000);
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
            workers.push(this.workerContext.run({ vuId: i }, () => worker(i)));
        }

        await Promise.all(workers);
        metricsCollector.stop();

        return { totalIterations };
    }
}

module.exports = UserPool;
