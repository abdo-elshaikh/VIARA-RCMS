const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const {
    createMachineSchema,
    updateMachineSchema,
    createServiceContractSchema,
    updateServiceContractSchema,
    createMaintenanceSchema,
    updateMaintenanceSchema,
    createDowntimeSchema,
    updateDowntimeSchema
} = require('../schemas/equipmentSchema');
const {
    createMachine,
    getMachines,
    getMachineById,
    updateMachine,
    deleteMachine,
    getServiceContracts,
    createServiceContract,
    updateServiceContract,
    getMaintenanceRecords,
    createMaintenance,
    updateMaintenance,
    getDowntimeRecords,
    createDowntime,
    updateDowntime,
    getUtilizationReport
} = require('../controllers/machineController');

module.exports = function equipmentRoutes(pool) {
    const router = express.Router();

    // Machine / Modality Routes
    router.get('/machines', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']), getMachines(pool));
    router.get('/machines/utilization', authenticateToken, authorizeRole(['Admin', 'Receptionist']), getUtilizationReport(pool));
    router.get('/machines/:id', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']), getMachineById(pool));
    router.post('/machines', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(createMachineSchema), createMachine(pool));
    router.put('/machines/:id', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(updateMachineSchema), updateMachine(pool));
    router.delete('/machines/:id', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), deleteMachine(pool));

    // Equipment Contracts
    router.get('/equipment/contracts', authenticateToken, authorizeRole(['Admin']), getServiceContracts(pool));
    router.post('/equipment/contracts', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(createServiceContractSchema), createServiceContract(pool));
    router.put('/equipment/contracts/:id', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(updateServiceContractSchema), updateServiceContract(pool));

    // Equipment Maintenance
    router.get('/equipment/maintenance', authenticateToken, authorizeRole(['Admin', 'Technician']), getMaintenanceRecords(pool));
    router.post('/equipment/maintenance', authenticateToken, authorizeRole(['Admin', 'Technician']), hasPermission(pool, 'MANAGE_MAINTENANCE'), validateRequest(createMaintenanceSchema), createMaintenance(pool));
    router.put('/equipment/maintenance/:id', authenticateToken, authorizeRole(['Admin', 'Technician']), hasPermission(pool, 'MANAGE_MAINTENANCE'), validateRequest(updateMaintenanceSchema), updateMaintenance(pool));

    // Equipment Downtime
    router.get('/equipment/downtime', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), getDowntimeRecords(pool));
    router.post('/equipment/downtime', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), hasPermission(pool, 'MANAGE_DOWNTIME'), validateRequest(createDowntimeSchema), createDowntime(pool));
    router.put('/equipment/downtime/:id', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), hasPermission(pool, 'MANAGE_DOWNTIME'), validateRequest(updateDowntimeSchema), updateDowntime(pool));

    return router;
};
