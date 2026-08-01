/**
 * realtimeService.js
 * Native Server-Sent Events (SSE) based real-time pub/sub hub.
 * Handles instant event dispatching for staff chat, portal messaging, and system notifications.
 */
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

// Store all active client connections
let clients = [];

const removeClient = (clientInfo) => {
    clients = clients.filter(c => c !== clientInfo && c.res !== clientInfo.res);
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
 * Register a new SSE connection client
 */
const registerClient = (req, res) => {
    const token = req.query.token;
    if (!token) {
        res.status(401).json({ error: 'Authentication token required' });
        return;
    }

    try {
        if (!process.env.JWT_SECRET) {
            res.status(500).json({ error: 'JWT secret is not configured' });
            return;
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        let clientInfo = {
            res,
            userId: decoded.user_id || decoded.userId || null,
            role: decoded.role || null,
            patientId: decoded.patientId || null,
            doctorId: decoded.doctorId || null
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
        logger.error('Realtime connection authentication failed', { error: error.message });
        res.status(401).json({ error: 'Invalid authentication token' });
    }
};

/**
 * Dispatch an event to a specific staff user ID
 */
const sendToUser = (userId, event, data) => {
    if (!userId) return;
    const targetClients = clients.filter(c => c.userId === userId);
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Dispatch an event to a specific patient ID
 */
const sendToPatient = (patientId, event, data) => {
    if (!patientId) return;
    const targetClients = clients.filter(c => c.patientId === patientId);
    targetClients.forEach(client => {
        writeSse(client, { event, data });
    });
};

/**
 * Dispatch an event to a specific referring doctor ID
 */
const sendToDoctor = (doctorId, event, data) => {
    if (!doctorId) return;
    const targetClients = clients.filter(c => c.doctorId === doctorId);
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
    const staffClients = clients.filter(c => c.userId !== null);
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
    sendToUser,
    sendToPatient,
    sendToDoctor,
    sendToRole,
    broadcastToStaff,
    getOnlineUserIds
};
