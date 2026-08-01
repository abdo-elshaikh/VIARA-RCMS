const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { createPurchaseOrderSchema, updatePurchaseOrderStatusSchema, receiveStockSchema } = require('../schemas/inventorySchema');

const getPurchaseOrders = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT po.*, s.name as supplier_name,
                   (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.po_id) as item_count
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.supplier_id
            ORDER BY po.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getPurchaseOrderById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Get PO and supplier
        const poResult = await db.query(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.po_id = $1
        `, [id]);
        
        if (poResult.rows.length === 0) {
            return next(new AppError('Purchase Order not found', 404));
        }
        
        // Get items
        const itemsResult = await db.query(`
            SELECT poi.*, i.name as item_name, i.unit
            FROM purchase_order_items poi
            JOIN inventory_items i ON poi.item_id = i.item_id
            WHERE poi.po_id = $1
        `, [id]);
        
        const po = poResult.rows[0];
        po.items = itemsResult.rows;
        
        res.json(po);
    } catch (error) {
        next(error);
    }
};

const createPurchaseOrder = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createPurchaseOrderSchema.parse(req.body);
        const userId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        // Total amount calc
        const totalAmount = data.items.reduce((acc, item) => acc + (item.orderedQuantity * item.unitPrice), 0);

        const poResult = await client.query(`
            INSERT INTO purchase_orders (po_number, supplier_id, status, expected_date, notes, total_amount, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [data.poNumber, data.supplierId, data.status, data.expectedDate || null, data.notes, totalAmount, userId]);

        const poId = poResult.rows[0].po_id;

        // Insert items
        for (const item of data.items) {
            const totalPrice = item.orderedQuantity * item.unitPrice;
            await client.query(`
                INSERT INTO purchase_order_items (po_id, item_id, ordered_quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [poId, item.itemId, item.orderedQuantity, item.unitPrice, totalPrice]);
        }

        await client.query('COMMIT');
        res.status(201).json(poResult.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        if (error.code === '23505') { // unique violation
            return next(new AppError('PO Number already exists', 400));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updatePurchaseOrderStatus = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updatePurchaseOrderStatusSchema.parse(req.body);
        
        const result = await db.query(`
            UPDATE purchase_orders 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE po_id = $2
            RETURNING *
        `, [data.status, id]);
        
        if (result.rows.length === 0) {
            return next(new AppError('Purchase Order not found', 404));
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

// Receive stock against a PO
const receiveStock = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = receiveStockSchema.parse(req.body);
        const userId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        // Lock the order so concurrent receipts cannot over-receive the same lines.
        const poCheck = await client.query(`SELECT status FROM purchase_orders WHERE po_id = $1 FOR UPDATE`, [id]);
        if (poCheck.rows.length === 0) {
            throw new AppError('Purchase Order not found', 404);
        }
        if (poCheck.rows[0].status === 'Completed' || poCheck.rows[0].status === 'Cancelled') {
            throw new AppError(`Cannot receive stock for a ${poCheck.rows[0].status} PO`, 400);
        }

        for (const rItem of data.items) {
            const poiRes = await client.query(`SELECT * FROM purchase_order_items WHERE po_item_id = $1 AND po_id = $2 FOR UPDATE`, [rItem.poItemId, id]);
            if (poiRes.rows.length === 0) throw new AppError(`PO item ${rItem.poItemId} not found`, 404);
            const poi = poiRes.rows[0];
            const remaining = Number(poi.ordered_quantity) - Number(poi.received_quantity);
            if (rItem.receivedQuantity > remaining) {
                throw new AppError(`Cannot receive more than the remaining quantity for PO item ${rItem.poItemId}`, 400);
            }

            // Create Batch
            const batchRes = await client.query(`
                INSERT INTO inventory_batches (item_id, po_id, lot_number, expiry_date, quantity)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING batch_id
            `, [poi.item_id, id, rItem.lotNumber || null, rItem.expiryDate || null, rItem.receivedQuantity]);

            const batchId = batchRes.rows[0].batch_id;

            // Log Stock Movement
            await client.query(`
                INSERT INTO stock_movements (item_id, batch_id, movement_type, quantity_change, unit_price, total_amount, reference_type, reference_id, created_by)
                VALUES ($1, $2, 'Receive', $3, $4, $5, 'PO', $6, $7)
            `, [poi.item_id, batchId, rItem.receivedQuantity, Number(poi.unit_price || 0), rItem.receivedQuantity * Number(poi.unit_price || 0), id, userId]);

            // Update inventory_items cache
            await client.query(`
                UPDATE inventory_items
                SET quantity = quantity + $1, unit_price = $3, last_updated = CURRENT_TIMESTAMP
                WHERE item_id = $2
            `, [rItem.receivedQuantity, poi.item_id, Number(poi.unit_price || 0)]);

            // Update PO item received quantity
            await client.query(`
                UPDATE purchase_order_items
                SET received_quantity = received_quantity + $1
                WHERE po_item_id = $2
            `, [rItem.receivedQuantity, rItem.poItemId]);
        }

        // Complete the order only when every line has been received in full.
        await client.query(`
            UPDATE purchase_orders
            SET status = CASE
                    WHEN EXISTS (
                        SELECT 1 FROM purchase_order_items
                        WHERE po_id = $1 AND received_quantity < ordered_quantity
                    ) THEN 'Partially Received'
                    ELSE 'Completed'
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE po_id = $1
        `, [id]);

        await client.query('COMMIT');
        res.json({ message: 'Stock received successfully' });
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

module.exports = {
    getPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receiveStock
};
