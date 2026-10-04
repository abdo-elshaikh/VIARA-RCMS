const express = require('express');
const {
    getRooms,
    getRoomById,
    createRoom,
    updateRoom,
    deleteRoom,
    getClinicalHierarchyMatrix,
} = require('../controllers/roomController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    const clinicalRoles = [
        'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse',
        'HR', 'Accountant', 'Cashier', 'Doctor', 'Insurance_Staff', 'Marketing'
    ];

    router.get('/', authenticateToken, authorizeRole(clinicalRoles), getRooms(pool));
    router.get('/matrix', authenticateToken, authorizeRole(clinicalRoles), getClinicalHierarchyMatrix(pool));
    router.get('/:id', authenticateToken, authorizeRole(clinicalRoles), getRoomById(pool));
    router.post('/', authenticateToken, authorizeRole(['Admin']), createRoom(pool));
    router.put('/:id', authenticateToken, authorizeRole(['Admin']), updateRoom(pool));
    router.delete('/:id', authenticateToken, authorizeRole(['Admin']), deleteRoom(pool));

    return router;
};
