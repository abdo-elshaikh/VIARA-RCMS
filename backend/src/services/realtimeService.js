/**
 * realtimeService.js
 * Native Server-Sent Events (SSE) based real-time pub/sub hub.
 * Handles instant event dispatching for staff chat, portal messaging, and system notifications.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

// Store all active client connections
let clients = [];

// In-memory store for short-lived SSE session tokens.
// Maps sse-session-token -> { userId, role, patientId, doctorId, expiresAt }
const sseSessionTokens = new Map();
const SSE_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired SSE session tokens
const sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sseSessionTokens.entries()) {
        if (session.expiresAt < now) {
            sseSessionTokens.delete(token);
        }
    }
}, 60 * 1000); // every minute
sessionCleanupInterval.unref?.();

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
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sseSessionTokens.set(sessionToken, {
        userId: isPatient || isDoctorPortal ? null : (decoded.user_id || decoded.userId || null),
        role: decoded.role || null,
        patientId,
        doctorId,
        expiresAt: Date.now() + SSE_SESSION_TTL_MS
    });
    return sessionToken;
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
 * The token is accepted from the query string (legacy EventSource clients) or
 * from the Authorization header (fetch-based clients), so it never needs to
 * appear in URL/access logs.
 */
const registerClient = (req, res) => {
    const authorization = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const sessionToken = (req.query.token || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '')).trim();
    if (!sessionToken) {
        res.status(401).json({ error: 'SSE session token required' });
        return;
    }

    // Validate against the in-memory session token store
    const session = sseSessionTokens.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
        res.status(401).json({ error: 'Invalid or expired SSE session token' });
        return;
    }

    // Remove the session token after use (single-use)
    sseSessionTokens.delete(sessionToken);

    try {
        const clientInfo = {
            res,
            userId: session.userId,
            role: session.role,
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
const sendToUser = (userId, event, data) => {
    if (!userId) return;
    const targetClients = clients.filter(c => String(c.userId) === String(userId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Dispatch an event to a specific patient ID
 */
const sendToPatient = (patientId, event, data) => {
    if (!patientId) return;
    const targetClients = clients.filter(c => String(c.patientId) === String(patientId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Dispatch an event to a specific referring doctor ID
 */
const sendToDoctor = (doctorId, event, data) => {
    if (!doctorId) return;
    const targetClients = clients.filter(c => String(c.doctorId) === String(doctorId));
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Dispatch an event to all staff users possessing a specific role
 */
const sendToRole = (role, event, data) => {
    if (!role) return;
    const targetClients = clients.filter(c => c.role === role);
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Broadcast an event to all active staff connections
 */
const broadcastToStaff = (event, data) => {
    const staffClients = clients.filter(c => Boolean(c.userId));
    staffClients.forEach(client => {
        writeSse(client, { event, data });
    });
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
    sendToUser,
    sendToPatient,
    sendToDoctor,
    sendToRole,
    broadcastToStaff,
    broadcastToStaffMatching,
    getOnlineUserIds
};
