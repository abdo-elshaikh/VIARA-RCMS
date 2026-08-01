const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { consumeStockSchema, adjustStockSchema } = require('../schemas/inventorySchema');
const { scheduleJob, triggerEvent } = require('../services/notificationJobService');
const { decrypt } = require('../utils/crypto');
// Schema
const createItemSchema = z.object({
    name: z.string().min(1),
    category: z.string().optional(),
    quantity: z.number().int().min(0),
    unit: z.string().optional(),
    minLevel: z.number().int().min(0)
});

const getInventory = (db) => async (req, res, next) => {
    try {
        // Fetch items along with active batches
        const result = await db.query(`
            SELECT i.*, 
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'batch_id', b.batch_id,
                               'lot_number', b.lot_number,
                               'expiry_date', b.expiry_date,
                               'quantity', b.quantity
                           ) ORDER BY b.expiry_date ASC
                       ) FILTER (WHERE b.batch_id IS NOT NULL AND b.quantity > 0), '[]'
                   ) as active_batches
            FROM inventory_items i
            LEFT JOIN inventory_batches b ON i.item_id = b.item_id
            GROUP BY i.item_id
            ORDER BY i.name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const addItem = (db) => async (req, res, next) => {
    try {
        const data = createItemSchema.parse(req.body);

        const result = await db.query(
            "INSERT INTO inventory_items (name, category, quantity, unit, min_level, unit_price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [data.name, data.category, data.quantity, data.unit, data.minLevel, data.unitPrice]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

// Simple update (legacy, keeping for backwards compatibility or simple systems)
const updateStock = (db) => async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const { quantity } = req.body; 

        if (typeof quantity !== 'number') {
            return next(new AppError('Quantity must be a number', 400));
        }

        const result = await db.query(
            "UPDATE inventory_items SET quantity = $1, last_updated = CURRENT_TIMESTAMP WHERE item_id = $2 RETURNING *",
            [quantity, itemId]
        );

        if (result.rows.length === 0) {
            return next(new AppError('Item not found', 404));
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

// ─── Phase 13 Advanced Endpoints ──────────────────────────────────────────────

const consumeStock = (db) => async (req, res, next) => {
    let client;
    try {
        const data = consumeStockSchema.parse(req.body);
        const userId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        const itemResult = await client.query(`
            SELECT quantity, unit_price
            FROM inventory_items
            WHERE item_id = $1
            FOR UPDATE
        `, [data.itemId]);
        if (!itemResult.rows[0]) throw new AppError('Inventory item not found', 404);
        if (Number(itemResult.rows[0].quantity) < data.quantity) {
            throw new AppError('Insufficient total stock', 400);
        }

        const unitPrice = Number(itemResult.rows[0].unit_price || 0);
        const totalAmount = data.quantity * unitPrice;
        let remainingToConsume = data.quantity;

        // If batch is specified, deduct from it
        if (data.batchId) {
            const batchRes = await client.query(`SELECT quantity FROM inventory_batches WHERE batch_id = $1 AND item_id = $2 FOR UPDATE`, [data.batchId, data.itemId]);
            if (batchRes.rows.length === 0) throw new AppError('Batch not found', 404);
            if (batchRes.rows[0].quantity < remainingToConsume) throw new AppError('Insufficient quantity in batch', 400);

            await client.query(`UPDATE inventory_batches SET quantity = quantity - $1 WHERE batch_id = $2 AND quantity >= $1`, [remainingToConsume, data.batchId]);

            await client.query(`
                INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, unit_price, total_amount, reference_type, reference_id, notes, created_by)
                VALUES ($1, $2, 'Consume', $3, $4, $5, $6, $7, $8, $9)
            `, [data.itemId, data.batchId, -remainingToConsume, unitPrice, remainingToConsume * unitPrice, data.referenceType, data.referenceId || null, data.notes, userId]);

        } else {
            // FIFO: Find oldest non-expired batches with stock
            const batches = await client.query(`
                SELECT batch_id, quantity
                FROM inventory_batches
                WHERE item_id = $1 AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
                ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_date ASC
                FOR UPDATE
            `, [data.itemId]);

            for (const batch of batches.rows) {
                if (remainingToConsume <= 0) break;

                const deduct = Math.min(batch.quantity, remainingToConsume);
                remainingToConsume -= deduct;

                await client.query(`UPDATE inventory_batches SET quantity = quantity - $1 WHERE batch_id = $2 AND quantity >= $1`, [deduct, batch.batch_id]);

                await client.query(`
                    INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, unit_price, total_amount, reference_type, reference_id, notes, created_by)
                    VALUES ($1, $2, 'Consume', $3, $4, $5, $6, $7, $8, $9)
                `, [data.itemId, batch.batch_id, -deduct, unitPrice, deduct * unitPrice, data.referenceType, data.referenceId || null, data.notes, userId]);
            }

            if (remainingToConsume > 0) {
                // Hybrid system: not all items have batches, log a generic movement without a batch
                await client.query(`
                    INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, unit_price, total_amount, reference_type, reference_id, notes, created_by)
                    VALUES ($1, NULL, 'Consume', $2, $3, $4, $5, $6, $7, $8)
                `, [data.itemId, -remainingToConsume, unitPrice, remainingToConsume * unitPrice, data.referenceType, data.referenceId || null, data.notes, userId]);
            }
        }

        // Update total cache
        await client.query(`
            UPDATE inventory_items
            SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP
            WHERE item_id = $2 AND quantity >= $1
        `, [data.quantity, data.itemId]);

        await client.query('COMMIT');
        res.json({ message: 'Stock consumed successfully', quantity: data.quantity, unitPrice, totalAmount });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const adjustStock = (db) => async (req, res, next) => {
    let client;
    try {
        const data = adjustStockSchema.parse(req.body);
        const userId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        if (data.batchId) {
            const batchResult = await client.query(`
                UPDATE inventory_batches
                SET quantity = quantity + $1
                WHERE batch_id = $2
                  AND item_id = $3
                  AND quantity + $1 >= 0
                RETURNING batch_id
            `, [data.quantityChange, data.batchId, data.itemId]);
            if (!batchResult.rows[0]) {
                throw new AppError('Batch not found or adjustment would make batch stock negative', 400);
            }
        }

        await client.query(`
            INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, reference_type, notes, created_by)
            VALUES ($1, $2, 'Adjust', $3, 'Manual', $4, $5)
        `, [data.itemId, data.batchId || null, data.quantityChange, data.notes, userId]);

        const result = await client.query(`
            UPDATE inventory_items
            SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
            WHERE item_id = $2
              AND quantity + $1 >= 0
            RETURNING *
        `, [data.quantityChange, data.itemId]);
        if (!result.rows[0]) {
            throw new AppError('Item not found or adjustment would make stock negative', 400);
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getStockMovements = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT sm.*,
                   COALESCE(NULLIF(sm.unit_price, 0), i.unit_price, 0)::numeric AS unit_price,
                   COALESCE(NULLIF(sm.total_amount, 0), ABS(sm.quantity_change) * COALESCE(NULLIF(sm.unit_price, 0), i.unit_price, 0), 0)::numeric AS total_amount,
                   i.name as item_name, i.unit, b.lot_number, u.full_name as created_by_name,
                   p.first_name_enc as patient_first_name_enc, p.last_name_enc as patient_last_name_enc
            FROM stock_movements sm
            JOIN inventory_items i ON sm.item_id = i.item_id
            LEFT JOIN inventory_batches b ON sm.batch_id = b.batch_id
            LEFT JOIN users u ON sm.created_by = u.user_id
            LEFT JOIN examinations e ON sm.reference_type = 'Exam' AND sm.reference_id = e.exam_id
            LEFT JOIN patients p ON e.patient_id = p.patient_id
            ORDER BY sm.created_at DESC
            LIMIT 200
        `);

        const mappedRows = result.rows.map(row => {
            const mapped = { ...row };
            if (row.patient_first_name_enc || row.patient_last_name_enc) {
                mapped.patient_name = [decrypt(row.patient_first_name_enc), decrypt(row.patient_last_name_enc)]
                    .filter(Boolean)
                    .join(' ');
            }
            delete mapped.patient_first_name_enc;
            delete mapped.patient_last_name_enc;
            return mapped;
        });

        res.json(mappedRows);
    } catch (error) {
        next(error);
    }
};

const getExpiryAlerts = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT b.*, i.name as item_name, i.category
            FROM inventory_batches b
            JOIN inventory_items i ON b.item_id = i.item_id
            WHERE b.quantity > 0 
              AND b.expiry_date IS NOT NULL 
              AND b.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
            ORDER BY b.expiry_date ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

module.exports = { 
    getInventory, 
    addItem, 
    updateStock,
    consumeStock,
    adjustStock,
    getStockMovements,
    getExpiryAlerts
};
