const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { createSupplierSchema, updateSupplierSchema } = require('../schemas/inventorySchema');

const getSuppliers = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT * FROM suppliers 
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getSupplierById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`SELECT * FROM suppliers WHERE supplier_id = $1`, [id]);
        
        if (result.rows.length === 0) {
            return next(new AppError('Supplier not found', 404));
        }
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const createSupplier = (db) => async (req, res, next) => {
    try {
        const data = createSupplierSchema.parse(req.body);
        
        const result = await db.query(`
            INSERT INTO suppliers (name, contact_name, email, phone, address, tax_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [data.name, data.contactName, data.email, data.phone, data.address, data.taxId, data.status]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

const updateSupplier = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateSupplierSchema.parse(req.body);
        
        const existing = await db.query(`SELECT * FROM suppliers WHERE supplier_id = $1`, [id]);
        if (existing.rows.length === 0) {
            return next(new AppError('Supplier not found', 404));
        }
        
        const current = existing.rows[0];
        const updated = {
            name: data.name ?? current.name,
            contact_name: data.contactName ?? current.contact_name,
            email: data.email ?? current.email,
            phone: data.phone ?? current.phone,
            address: data.address ?? current.address,
            tax_id: data.taxId ?? current.tax_id,
            status: data.status ?? current.status
        };
        
        const result = await db.query(`
            UPDATE suppliers 
            SET name = $1, contact_name = $2, email = $3, phone = $4, address = $5, tax_id = $6, status = $7, updated_at = CURRENT_TIMESTAMP
            WHERE supplier_id = $8
            RETURNING *
        `, [updated.name, updated.contact_name, updated.email, updated.phone, updated.address, updated.tax_id, updated.status, id]);
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    }
};

module.exports = {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier
};
