/**
 * Periodic low-stock and expiry alert checker.
 * Creates in-app notification records for Admin/Technician staff.
 */
const { dispatch } = require('./notificationService');

const checkInventoryAlerts = async (db) => {
    try {
        const lowStock = await db.query(`
            SELECT item_id, name, quantity, min_level, unit
            FROM inventory_items
            WHERE quantity <= min_level
        `);

        for (const item of lowStock.rows) {
            const exists = await db.query(`
                SELECT 1 FROM notifications
                WHERE event_type = 'LowStock'
                  AND entity_id = $1
                  AND created_at >= NOW() - INTERVAL '24 hours'
                LIMIT 1
            `, [item.item_id]);
            if (exists.rows.length > 0) continue;

            // Dispatch central InApp notification which will encrypt and push in real-time
            await dispatch(
                'InApp',
                'inventory-team',
                `Low Stock: ${item.name}`,
                `${item.name} is at ${item.quantity} ${item.unit} (min: ${item.min_level}).`,
                db,
                {
                    eventType: 'LowStock',
                    entityId: item.item_id
                }
            );
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
