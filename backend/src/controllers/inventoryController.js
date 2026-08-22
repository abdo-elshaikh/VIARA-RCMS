const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { scheduleJob, triggerEvent } = require('../services/notificationJobService');
const { decrypt } = require('../utils/crypto');
const { triggerEventForRole } = require('../services/notificationJobService');
const {
    createInventoryItemSchema,
    updateInventoryStockSchema,
    consumeStockSchema,
    adjustStockSchema
} = require('../schemas/inventorySchema');
const { recalculateInvoiceAfterItemChange } = require('./invoiceController');
const { moneyNumber } = require('../services/financialPostingService');

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
    let client;
    try {
        const data = createInventoryItemSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(
            "INSERT INTO inventory_items (name, category, quantity, unit, min_level, unit_price, is_contrast_agent) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            [data.name, data.category || null, data.quantity, data.unit || null, data.minLevel, data.unitPrice ?? 0, data.isContrastAgent]
        );

        if (data.quantity > 0) {
            await client.query(`
                INSERT INTO stock_movements (
                    item_id, movement_type, quantity_change, unit_price,
                    total_amount, reference_type, notes, created_by
                )
                VALUES ($1, 'Adjust', $2, $3, $4, 'Manual', 'Initial stock balance', $5)
            `, [
                result.rows[0].item_id,
                data.quantity,
                moneyNumber(data.unitPrice),
                moneyNumber(data.quantity * data.unitPrice),
                req.user.user_id
            ]);
        }

        await client.query('COMMIT');

        res.status(201).json(result.rows[0]);
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

// Flexible inventory update
const updateStock = (db) => async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const data = updateInventoryStockSchema.parse(req.body);

        const price = data.unitPrice !== undefined ? data.unitPrice : data.unit_price;
        const minLvl = data.minLevel !== undefined ? data.minLevel : data.min_level;

        const result = await db.query(`
            UPDATE inventory_items
            SET unit_price = COALESCE($1, unit_price),
                name = COALESCE($2, name),
                unit = COALESCE($3, unit),
                min_level = COALESCE($4, min_level),
                category = COALESCE($5, category),
                is_contrast_agent = COALESCE($6, is_contrast_agent),
                last_updated = CURRENT_TIMESTAMP
            WHERE item_id = $7
            RETURNING *
        `, [
            price !== undefined ? price : null,
            data.name || null,
            data.unit || null,
            minLvl !== undefined ? minLvl : null,
            data.category || null,
            data.isContrastAgent !== undefined ? data.isContrastAgent : null,
            itemId
        ]);

        if (result.rows.length === 0) {
            return next(new AppError('Item not found', 404));
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

// ─── Phase 13 Advanced Endpoints ──────────────────────────────────────────────

const defaultConsumeStockSchema = z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1),
    batchId: z.string().uuid().optional(),
    referenceType: z.enum(['Exam', 'Manual']).default('Manual'),
    referenceId: z.string().uuid().optional(),
    notes: z.string().optional()
});

const consumeStock = (db) => async (req, res, next) => {
    let client;
    try {
        const schema = typeof consumeStockSchema !== 'undefined' && consumeStockSchema ? consumeStockSchema : defaultConsumeStockSchema;
        const data = schema.parse(req.body);
        const userId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        const itemResult = await client.query(`
            SELECT item_id, name, category, quantity, unit, unit_price
            FROM inventory_items
            WHERE item_id = $1
            FOR UPDATE
        `, [data.itemId]);
        if (!itemResult.rows[0]) throw new AppError('Inventory item not found', 404);
        if (Number(itemResult.rows[0].quantity) < data.quantity) {
            throw new AppError('Insufficient total stock', 400);
        }

        // Billing always uses the governed inventory price. Price maintenance
        // is a separate privileged operation and cannot be overridden while
        // consuming stock.
        const unitPrice = moneyNumber(itemResult.rows[0].unit_price);
        const totalAmount = moneyNumber(data.quantity * unitPrice);
        let remainingToConsume = data.quantity;

        // If batch is specified, deduct from it
        if (data.batchId) {
            const batchRes = await client.query(`
                SELECT quantity, expiry_date,
                       (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE) AS is_expired
                FROM inventory_batches
                WHERE batch_id = $1 AND item_id = $2
                FOR UPDATE
            `, [data.batchId, data.itemId]);
            if (batchRes.rows.length === 0) throw new AppError('Batch not found', 404);
            if (batchRes.rows[0].is_expired) {
                throw new AppError('Expired inventory batches cannot be consumed', 409);
            }
            if (batchRes.rows[0].quantity < remainingToConsume) throw new AppError('Insufficient quantity in batch', 400);

            await client.query(`UPDATE inventory_batches SET quantity = quantity - $1 WHERE batch_id = $2 AND quantity >= $1`, [remainingToConsume, data.batchId]);

            await client.query(`
                INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, unit_price, total_amount, reference_type, reference_id, notes, created_by)
                VALUES ($1, $2, 'Consume', $3, $4, $5, $6, $7, $8, $9)
            `, [data.itemId, data.batchId, -remainingToConsume, unitPrice, remainingToConsume * unitPrice, data.referenceType, data.referenceId || null, data.notes, userId]);

        } else {
            // Lock all batches first so expired stock cannot accidentally be
            // treated as unbatched generic stock.
            const batches = await client.query(`
                SELECT batch_id, quantity, expiry_date,
                       (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AS is_eligible
                FROM inventory_batches
                WHERE item_id = $1 AND quantity > 0
                ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_date ASC
                FOR UPDATE
            `, [data.itemId]);

            const eligibleBatches = batches.rows.filter((batch) => batch.is_eligible);
            const batchedQuantity = batches.rows.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
            const eligibleBatchedQuantity = eligibleBatches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
            const unbatchedQuantity = Math.max(0, Number(itemResult.rows[0].quantity) - batchedQuantity);
            if (eligibleBatchedQuantity + unbatchedQuantity < data.quantity) {
                throw new AppError('Insufficient non-expired stock', 409);
            }

            for (const batch of eligibleBatches) {
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

        // If consumed for an exam, check if an active invoice already exists and auto-append the item
        if (data.referenceType === 'Exam' && data.referenceId) {
            const existingInvoice = await client.query(`
                SELECT invoice_id, subtotal_amount, total_amount, patient_payable_amount
                FROM invoices
                WHERE exam_id = $1 AND invoice_status <> 'Voided'
                ORDER BY generated_at DESC
                LIMIT 1
                FOR UPDATE
            `, [data.referenceId]);

            if (existingInvoice.rows.length > 0) {
                const inv = existingInvoice.rows[0];
                const itemName = itemResult.rows[0].name || 'مستلزمات فحص';

                await client.query(`
                    INSERT INTO invoice_items (
                        invoice_id, exam_id, description, quantity, unit_price,
                        discount_amount, tax_amount, total_amount
                    )
                    VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
                `, [
                    inv.invoice_id,
                    data.referenceId,
                    `مستلزم فحص: ${itemName}`,
                    data.quantity,
                    unitPrice,
                    totalAmount
                ]);

                await recalculateInvoiceAfterItemChange(client, inv.invoice_id, userId);
            }
        }

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

const defaultAdjustStockSchema = z.object({
    itemId: z.string().uuid(),
    quantityChange: z.number().int().refine(value => value !== 0, 'Quantity change cannot be zero'),
    batchId: z.string().uuid().optional(),
    notes: z.string().optional()
});

const adjustStock = (db) => async (req, res, next) => {
    let client;
    try {
        const schema = typeof adjustStockSchema !== 'undefined' && adjustStockSchema ? adjustStockSchema : defaultAdjustStockSchema;
        const data = schema.parse(req.body);
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
        const limit = Math.min(1000, Math.max(1, Number.parseInt(req.query.limit, 10) || 200));
        const referenceType = req.query.referenceType;
        const referenceIds = String(req.query.referenceIds || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (referenceIds.some((value) => !uuidPattern.test(value))) {
            throw new AppError('Invalid stock movement reference id', 400);
        }
        const values = [];
        const where = [];
        if (referenceType) {
            values.push(referenceType);
            where.push(`sm.reference_type = $${values.length}`);
        }
        if (referenceIds.length) {
            values.push(referenceIds);
            where.push(`sm.reference_id = ANY($${values.length}::uuid[])`);
        }
        values.push(limit);
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
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY sm.created_at DESC
            LIMIT $${values.length}
        `, values);

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
