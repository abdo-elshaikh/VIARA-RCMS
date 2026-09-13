const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const {
    createAppointmentSchema,
    updateAppointmentSchema,
    getAppointmentsQuerySchema,
    noShowAppointmentSchema,
    rescheduleAppointmentSchema,
    availabilityQuerySchema,
    getWaitingListQuerySchema,
    createWaitingListSchema,
    updateWaitingListSchema
} = require('../schemas/appointmentSchema');
const {
    createReferringDoctorSchema,
    updateReferringDoctorSchema,
    getReferringDoctorsQuerySchema
} = require('../schemas/referringDoctorSchema');

const {
    getAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    markNoShow,
    rescheduleAppointment,
    getAvailability,
    getOrderTimeline
} = require('../controllers/appointmentController');
const {
    getWaitingList,
    createWaitingListEntry,
    updateWaitingListEntry
} = require('../controllers/waitingListController');
const {
    getReferringDoctors,
    createReferringDoctor,
    updateReferringDoctor,
    deleteReferringDoctor,
    getReferringDoctorStats
} = require('../controllers/referringDoctorController');

module.exports = function appointmentRoutes(pool, auditService) {
    const router = express.Router();

    // Appointments Core CRUD & Operations
    router.get('/appointments',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'appointments' }),
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
        validateQuery(getAppointmentsQuerySchema),
        getAppointments(pool)
    );

    router.get('/appointments/:id',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'appointments' }),
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
        getAppointmentById(pool)
    );

    router.post('/appointments',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
        hasPermission(pool, 'CREATE_APPOINTMENTS'),
        validateRequest(createAppointmentSchema),
        createAppointment(pool)
    );

    router.put('/appointments/:id',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
        hasPermission(pool, 'EDIT_APPOINTMENTS'),
        validateRequest(updateAppointmentSchema),
        updateAppointment(pool)
    );

    router.delete('/appointments/:id',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'DELETE_APPOINTMENTS'),
        cancelAppointment(pool)
    );

    router.post('/appointments/:id/no-show',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'EDIT_APPOINTMENTS'),
        validateRequest(noShowAppointmentSchema),
        markNoShow(pool)
    );

    router.post('/appointments/:id/reschedule',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'EDIT_APPOINTMENTS'),
        validateRequest(rescheduleAppointmentSchema),
        rescheduleAppointment(pool)
    );

    // Schedule Slot Availability
    router.get('/schedule/availability',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
        validateQuery(availabilityQuerySchema),
        getAvailability(pool)
    );

    // Order Timeline Tracking
    router.get('/orders/:id/timeline',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'appointments' }),
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
        getOrderTimeline(pool)
    );

    // Waiting List Management
    router.get('/waiting-list',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        validateQuery(getWaitingListQuerySchema),
        getWaitingList(pool)
    );

    router.post('/waiting-list',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'MANAGE_WAITLIST'),
        validateRequest(createWaitingListSchema),
        createWaitingListEntry(pool)
    );

    router.put('/waiting-list/:id',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'MANAGE_WAITLIST'),
        validateRequest(updateWaitingListSchema),
        updateWaitingListEntry(pool)
    );

    // Referring Doctors Management
    router.get('/referring-doctors',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin', 'Accountant']),
        validateQuery(getReferringDoctorsQuerySchema),
        getReferringDoctors(pool)
    );

    router.post('/referring-doctors',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'MANAGE_REFERRING_DOCTORS'),
        validateRequest(createReferringDoctorSchema),
        createReferringDoctor(pool)
    );

    router.get('/referring-doctors/:id/stats',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Receptionist']),
        getReferringDoctorStats(pool)
    );

    router.put('/referring-doctors/:id',
        authenticateToken,
        authorizeRole(['Admin']),
        hasPermission(pool, 'MANAGE_REFERRING_DOCTORS'),
        validateRequest(updateReferringDoctorSchema),
        updateReferringDoctor(pool)
    );

    router.delete('/referring-doctors/:id',
        authenticateToken,
        authorizeRole(['Admin']),
        hasPermission(pool, 'MANAGE_REFERRING_DOCTORS'),
        deleteReferringDoctor(pool)
    );

    return router;
};
