/**
 * Periodic low-stock and expiry alert checker.
 * Creates in-app notification records for Admin/Technician staff.
 */
const { triggerEventForRole } = require('./notificationJobService');

const checkInventoryAlerts = async (db) => {
    try {
        const lowStock = await db.query(`
            SELECT item_id, name, quantity, min_level, unit
            FROM inventory_items
            WHERE quantity <= min_level
        `);

        for (const item of lowStock.rows) {
            await triggerEventForRole(db, 'LowStock', 'Technician', {
                priority: 'Warning',
                entityType: 'InventoryItem',
                entityId: item.item_id,
                variables: {
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: item.quantity,
                    min_level: item.min_level,
                    unit: item.unit
                }
            }).catch(() => {});

            await triggerEventForRole(db, 'LowStock', 'Admin', {
                priority: 'Warning',
                entityType: 'InventoryItem',
                entityId: item.item_id,
                variables: {
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: item.quantity,
                    min_level: item.min_level,
                    unit: item.unit
                }
            }).catch(() => {});
        }

        const expired = await db.query(`
            SELECT b.batch_id, i.item_id, i.name, b.lot_number, b.expiry_date, b.quantity, i.unit
            FROM inventory_batches b
            JOIN inventory_items i ON i.item_id = b.item_id
            WHERE b.expiry_date IS NOT NULL
              AND b.expiry_date <= CURRENT_DATE
              AND b.quantity > 0
        `);

        for (const batch of expired.rows) {
            await triggerEventForRole(db, 'ItemExpired', 'Technician', {
                priority: 'Warning',
                entityType: 'InventoryBatch',
                entityId: batch.batch_id,
                variables: {
                    batch_id: batch.batch_id,
                    item_id: batch.item_id,
                    item_name: batch.name,
                    batch_number: batch.lot_number,
                    expiry_date: batch.expiry_date,
                    quantity: batch.quantity,
                    unit: batch.unit
                }
            }).catch(() => {});

            await triggerEventForRole(db, 'ItemExpired', 'Admin', {
                priority: 'Warning',
                entityType: 'InventoryBatch',
                entityId: batch.batch_id,
                variables: {
                    batch_id: batch.batch_id,
                    item_id: batch.item_id,
                    item_name: batch.name,
                    batch_number: batch.lot_number,
                    expiry_date: batch.expiry_date,
                    quantity: batch.quantity,
                    unit: batch.unit
                }
            }).catch(() => {});
        }
    } catch (err) {
        console.error('[InventoryAlertService]', err.message);
    }
};

let alertInterval = null;

const startInventoryAlertPolling = (db, intervalMs = 60 * 60 * 1000) => {
    if (alertInterval) return;
    console.log('[InventoryAlertService] Starting hourly low-stock alert checks');
    checkInventoryAlerts(db);
    alertInterval = setInterval(() => checkInventoryAlerts(db), intervalMs);
};

const stopInventoryAlertPolling = () => {
    if (alertInterval) {
        clearInterval(alertInterval);
        alertInterval = null;
    }
};

module.exports = { checkInventoryAlerts, startInventoryAlertPolling, stopInventoryAlertPolling };
