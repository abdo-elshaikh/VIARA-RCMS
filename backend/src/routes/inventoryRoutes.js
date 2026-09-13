const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');

const {
    createInventoryItemSchema,
    updateInventoryStockSchema,
    createSupplierSchema,
    updateSupplierSchema,
    createPurchaseOrderSchema,
    updatePurchaseOrderStatusSchema,
    receiveStockSchema,
    consumeStockSchema,
    adjustStockSchema
} = require('../schemas/inventorySchema');

const {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier
} = require('../controllers/supplierController');

const {
    getPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receiveStock
} = require('../controllers/purchaseOrderController');

const {
    getInventory,
    addItem,
    updateStock,
    consumeStock,
    adjustStock,
    getStockMovements,
    getExpiryAlerts
} = require('../controllers/inventoryController');

module.exports = function inventoryRoutes(pool) {
    const router = express.Router();

    // ─── Suppliers ──────────────────────────────────────────────────────────
    router.get('/suppliers', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Technician']), getSuppliers(pool));
    router.get('/suppliers/:id', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Technician']), getSupplierById(pool));
    router.post('/suppliers', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_SUPPLIERS'), validateRequest(createSupplierSchema), createSupplier(pool));
    router.put('/suppliers/:id', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_SUPPLIERS'), validateRequest(updateSupplierSchema), updateSupplier(pool));

    // ─── Purchase Orders ────────────────────────────────────────────────────
    router.get('/purchase-orders', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Technician']), getPurchaseOrders(pool));
    router.get('/purchase-orders/:id', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Technician']), getPurchaseOrderById(pool));
    router.post('/purchase-orders', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_PURCHASE_ORDERS'), validateRequest(createPurchaseOrderSchema), createPurchaseOrder(pool));
    router.put('/purchase-orders/:id/status', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_PURCHASE_ORDERS'), validateRequest(updatePurchaseOrderStatusSchema), updatePurchaseOrderStatus(pool));
    router.post('/purchase-orders/:id/receive', authenticateToken, authorizeRole(['Admin', 'Technician']), hasAnyPermission(pool, ['MANAGE_PURCHASE_ORDERS', 'MANAGE_INVENTORY']), validateRequest(receiveStockSchema), receiveStock(pool));

    // ─── Inventory Catalog & Stock Movements ────────────────────────────────
    router.get('/inventory', authenticateToken, authorizeRole(['Admin', 'Technician', 'Accountant', 'Nurse', 'Radiologist', 'Receptionist', 'Cashier']), hasAnyPermission(pool, ['VIEW_INVENTORY', 'CONSUME_INVENTORY']), getInventory(pool));
    router.post('/inventory', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_INVENTORY'), validateRequest(createInventoryItemSchema), addItem(pool));
    router.put('/inventory/:itemId', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_INVENTORY'), validateRequest(updateInventoryStockSchema), updateStock(pool));

    router.post('/inventory/consume', authenticateToken, authorizeRole(['Admin', 'Technician', 'Nurse', 'Receptionist', 'Cashier']), hasPermission(pool, 'CONSUME_INVENTORY'), validateRequest(consumeStockSchema), consumeStock(pool));
    router.post('/inventory/adjust', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_INVENTORY'), validateRequest(adjustStockSchema), adjustStock(pool));
    router.get('/inventory/movements', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Receptionist', 'Cashier', 'Nurse', 'Technician']), getStockMovements(pool));
    router.get('/inventory/expiry-alerts', authenticateToken, authorizeRole(['Admin', 'Nurse', 'Technician']), getExpiryAlerts(pool));

    return router;
};
