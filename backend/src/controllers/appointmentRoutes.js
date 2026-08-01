const express = require('express');
const { cancelAppointment } = require('../../controllers/appointmentController');

/**
 * @param {object} db - The database connection pool.
 * @param {Function} authenticateToken - Middleware for authenticating JWT tokens.
 * @param {Function} authorizeRole - Middleware for authorizing user roles.
 * @returns {express.Router}
 */
module.exports = (db, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.post('/:id/cancel', authenticateToken, authorizeRole(['Admin', 'Receptionist']), cancelAppointment(db));

    return router;
};