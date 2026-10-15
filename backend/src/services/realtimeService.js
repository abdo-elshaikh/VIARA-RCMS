/**
 * realtimeService.js
 * Native Server-Sent Events (SSE) based real-time pub/sub hub.
 * Handles instant event dispatching for staff chat, portal messaging, and system notifications.
 * Supports distributed multi-instance messaging via PostgreSQL LISTEN / NOTIFY.
 */
const crypto = require('crypto');
const logger = require('../config/logger');

// Store all active client connections on this local instance
let clients = [];

const SSE_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getSseSecret = () => {
    if (process.env.SSE_SESSION_SECRET) return process.env.SSE_SESSION_SECRET;
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'test') return 'viara-test-sse-secret';
    throw new Error('SSE_SESSION_SECRET or JWT_SECRET must be configured');
};

const encodeTokenPart = value => Buffer.from(value).toString('base64url');
const decodeTokenPart = value => Buffer.from(value, 'base64url').toString('utf8');

const signSsePayload = payload => {
    const encodedPayload = encodeTokenPart(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', getSseSecret()).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
};

const verifySseToken = token => {
    const [encodedPayload, signature] = String(token || '').split('.');
    if (!encodedPayload || !signature) return null;
    const expected = crypto.createHmac('sha256', getSseSecret()).update(encodedPayload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(decodeTokenPart(encodedPayload));
    return payload.exp > Date.now() ? payload : null;
};

const REALTIME_CHANNEL = 'viara_realtime_events';
const NODE_ID = `${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
let dbPool = null;
let listenerClient = null;

/**
 * Configure database pool for distributed real-time pub/sub via PostgreSQL LISTEN/NOTIFY
 * @param {object} pool - PostgreSQL pool
 */
const setRealtimePool = (pool) => {
    dbPool = pool;
    initDistributedSubscriber(pool).catch(() => {});
};

const initDistributedSubscriber = async (pool) => {
    if (!pool || listenerClient) return;
    try {
        listenerClient = await pool.connect();
        await listenerClient.query(`LISTEN ${REALTIME_CHANNEL}`);
        listenerClient.on('notification', (msg) => {
            if (msg.channel !== REALTIME_CHANNEL || !msg.payload) return;
            try {
                const parsed = JSON.parse(msg.payload);
                handleDistributedMessage(parsed);
            } catch (err) {
                logger.debug('Realtime distributed parse error', { error: err.message });
            }
        });
        listenerClient.on('error', (err) => {
            logger.warn('Realtime distributed client error', { error: err.message });
            try { listenerClient.release(true); } catch {}
            listenerClient = null;
            setTimeout(() => initDistributedSubscriber(pool), 5000).unref?.();
        });
    } catch (err) {
        logger.debug('Realtime distributed subscriber init skipped', { error: err.message });
        listenerClient = null;
    }
};

const handleDistributedMessage = ({ target, targetId, event, data, originNodeId }) => {
    if (originNodeId === NODE_ID) return; // already handled locally
    switch (target) {
        case 'user':
            sendToUserLocal(targetId, event, data);
            break;
        case 'role':
            sendToRoleLocal(targetId, event, data);
            break;
        case 'patient':
            sendToPatientLocal(targetId, event, data);
            break;
        case 'doctor':
            sendToDoctorLocal(targetId, event, data);
            break;
        case 'staff':
            broadcastToStaffLocal(event, data);
            break;
        default:
            break;
    }
};

const publishDistributed = (target, targetId, event, data) => {
    if (!dbPool) return;
    try {
        const distributedData = data && typeof data === 'object' ? { ...data } : data;
        if (distributedData?.exceptSessionId) delete distributedData.exceptSessionId;
        const payload = JSON.stringify({
            originNodeId: NODE_ID,
            target,
            targetId,
            event,
            data: distributedData
        });
        dbPool.query('SELECT pg_notify($1, $2)', [REALTIME_CHANNEL, payload]).catch(() => {});
    } catch (e) {
        // ignore notification publish errors
    }
};

/**
 * Create a short-lived SSE session token from an authenticated user's identity.
 * The token is purpose-scoped: it only grants an SSE connection, not API access.
 * @param {object} decoded - Decoded JWT payload containing userId/role/patientId/doctorId
 * @returns {string} A random 32-byte hex SSE session token
 */
const createSseSession = (decoded) => {
    const isPatient = decoded.role === 'Patient';
    const isDoctorPortal = decoded.role === 'Doctor' && !decoded.user_id && Boolean(decoded.doctorId || decoded.doctor_id);
    const patientId = isPatient
        ? (decoded.patientId || decoded.patient_id || decoded.userId || null)
        : (decoded.patientId || decoded.patient_id || null);
    const doctorId = isDoctorPortal
        ? (decoded.doctorId || decoded.doctor_id || null)
        : null;
    return signSsePayload({
        nonce: crypto.randomBytes(16).toString('hex'),
        userId: isPatient || isDoctorPortal ? null : (decoded.user_id || decoded.userId || null),
        role: decoded.role || null,
        sessionId: decoded.session_id || null,
        patientId,
        doctorId,
        exp: Date.now() + SSE_SESSION_TTL_MS
    });
};

/**
 * Broadcast to the subset of connected staff authorized for an event.
 * The predicate receives only the authenticated realtime identity.
 * Declared before removeClient because presence announcements use it.
 */
const broadcastToStaffMatching = (predicate, event, data) => {
    if (typeof predicate !== 'function') return;
    clients
        .filter(client => Boolean(client.userId) && predicate({
            userId: client.userId,
            role: client.role
        }))
        .forEach(client => writeSse(client, { event, data }));
};

const removeClient = (clientInfo) => {
    const wasStaff = Boolean(clientInfo.userId);
    const userId = clientInfo.userId;
    clients = clients.filter(c => c !== clientInfo && c.res !== clientInfo.res);
    // Announce staff departures immediately so online presence does not
    // linger until the next poll. Only broadcast when the user's LAST
    // connection closed (multi-tab users stay online while any tab lives).
    if (wasStaff && userId && !clients.some(c => String(c.userId) === String(userId))) {
        broadcastToStaffMatching(
            c => String(c.userId) !== String(userId),
            'USER_PRESENCE',
            { userId: String(userId), online: false }
        );
    }
};

const writeSse = (clientInfo, payload) => {
    const { res } = clientInfo;
    if (res.writableEnded || res.destroyed) {
        removeClient(clientInfo);
        return false;
    }

    try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        return true;
    } catch (error) {
        removeClient(clientInfo);
        if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
            logger.warn('Realtime stream write failed', { error: error.message });
        }
        return false;
    }
};

/**
 * Register a new SSE connection client.
 * Expects a short-lived SSE session token (not the user's access JWT).
 * The preferred location is an httpOnly cookie. Query-string support remains
 * for legacy EventSource clients during migration.
 */
const registerClient = (req, res) => {
    const authorization = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const sessionToken = (req.cookies?.viaraSseSession
        || req.query.token
        || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '')).trim();
    if (!sessionToken) {
        res.status(401).json({ error: 'SSE session token required' });
        return;
    }

    let session;
    try {
        session = verifySseToken(sessionToken);
    } catch {
        session = null;
    }
    if (!session) {
        res.status(401).json({ error: 'Invalid or expired SSE session token' });
        return;
    }

    try {
        const clientInfo = {
            res,
            userId: session.userId,
            role: session.role,
            sessionId: session.sessionId,
            patientId: session.patientId,
            doctorId: session.doctorId
        };

        // Set headers for SSE stream
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Prevent Nginx proxy buffering
        });

        // Add to active clients pool
        clients.push(clientInfo);

        // Announce staff arrivals so other tabs update presence instantly
        // instead of waiting for the next users-list poll.
        if (session.userId) {
            broadcastToStaffMatching(
                c => String(c.userId) !== String(session.userId),
                'USER_PRESENCE',
                { userId: String(session.userId), online: true }
            );
        }

        // Send initial connection validation message
        writeSse(clientInfo, { type: 'CONNECTED', status: 'OK' });

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            clearInterval(pingInterval);
            removeClient(clientInfo);
            logger.debug(`Realtime connection closed. Active clients: ${clients.length}`);
        };

        // Periodically send ping to prevent connection timeout
        const pingInterval = setInterval(() => {
            if (!writeSse(clientInfo, { type: 'PING' })) cleanup();
        }, 25000);

        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('error', (error) => {
            cleanup();
            if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
                logger.warn('Realtime stream response error', { error: error.message });
            }
        });

        logger.debug(`New realtime connection registered. Type: ${
            clientInfo.userId ? `Staff (${clientInfo.role})` :
            clientInfo.patientId ? 'Patient' :
            clientInfo.doctorId ? 'Doctor' : 'Unknown'
        }. Active clients: ${clients.length}`);

    } catch (error) {
        logger.error('Realtime connection registration failed', { error: error.message });
        res.status(401).json({ error: 'Connection registration failed' });
    }
};

/**
 * Dispatch an event to a specific staff user ID
 */
const sendToUserLocal = (userId, event, data) => {
    if (!userId) return;
    const targetClients = clients.filter(c => String(c.userId) === String(userId)
        && (!data?.exceptSessionId || c.sessionId !== data.exceptSessionId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

const sendToUser = (userId, event, data) => {
    sendToUserLocal(userId, event, data);
    publishDistributed('user', userId, event, data);
};

/**
 * Dispatch an event to a specific patient ID
 */
const sendToPatientLocal = (patientId, event, data) => {
    if (!patientId) return;
    const targetClients = clients.filter(c => String(c.patientId) === String(patientId)
        && (!data?.exceptSessionId || c.sessionId !== data.exceptSessionId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

const sendToPatient = (patientId, event, data) => {
    sendToPatientLocal(patientId, event, data);
    publishDistributed('patient', patientId, event, data);
};

/**
 * Dispatch an event to a specific referring doctor ID
 */
const sendToDoctorLocal = (doctorId, event, data) => {
    if (!doctorId) return;
    const targetClients = clients.filter(c => String(c.doctorId) === String(doctorId)
        && (!data?.exceptSessionId || c.sessionId !== data.exceptSessionId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

const sendToDoctor = (doctorId, event, data) => {
    sendToDoctorLocal(doctorId, event, data);
    publishDistributed('doctor', doctorId, event, data);
};

/**
 * Dispatch an event to all staff users possessing a specific role
 */
const sendToRoleLocal = (role, event, data) => {
    if (!role) return;
    const targetClients = clients.filter(c => c.role === role);
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

const sendToRole = (role, event, data) => {
    sendToRoleLocal(role, event, data);
    publishDistributed('role', role, event, data);
};

/**
 * Broadcast an event to all active staff connections
 */
const broadcastToStaffLocal = (event, data) => {
    const staffClients = clients.filter(c => Boolean(c.userId));
    staffClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

const broadcastToStaff = (event, data) => {
    broadcastToStaffLocal(event, data);
    publishDistributed('staff', null, event, data);
};

/**
 * Get IDs of all currently connected staff users
 */
const getOnlineUserIds = () => {
    const online = new Set();
    clients.forEach(c => {
        if (c.userId) online.add(c.userId);
    });
    return Array.from(online);
};

module.exports = {
    registerClient,
    createSseSession,
    setRealtimePool,
    sendToUser,
    sendToPatient,
    sendToDoctor,
    sendToRole,
    broadcastToStaff,
    broadcastToStaffMatching,
    getOnlineUserIds,
    handleDistributedMessage
};
