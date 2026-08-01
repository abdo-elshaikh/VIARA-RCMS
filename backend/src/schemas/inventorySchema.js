const { z } = require('zod');

// ─── Inventory Items ─────────────────────────────────────────────────────────

const createInventoryItemSchema = z.object({
    name: z.string().min(1),
    category: z.string().optional(),
    quantity: z.number().int().min(0),
    unit: z.string().optional(),
    minLevel: z.number().int().min(0),
    unitPrice: z.number().min(0).default(0)
});

const updateInventoryStockSchema = z.object({
    quantity: z.number().int().min(0)
});

// ─── Suppliers ────────────────────────────────────────────────────────────────

const createSupplierSchema = z.object({
    name: z.string().min(1).max(255),
    contactName: z.string().max(255).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(50).optional(),
    address: z.string().optional(),
    taxId: z.string().max(100).optional(),
    status: z.enum(['Active', 'Inactive']).default('Active')
});

const updateSupplierSchema = createSupplierSchema.partial();

// ─── Purchase Orders ──────────────────────────────────────────────────────────

const createPurchaseOrderSchema = z.object({
    poNumber: z.string().min(1).max(50),
    supplierId: z.string().uuid(),
    status: z.enum(['Draft', 'Sent', 'Partially Received', 'Completed', 'Cancelled']).default('Draft'),
    expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().optional(),
    items: z.array(z.object({
        itemId: z.string().uuid(),
        orderedQuantity: z.number().int().min(1),
        unitPrice: z.number().min(0).default(0)
    })).min(1, "At least one item is required")
});

const updatePurchaseOrderStatusSchema = z.object({
    status: z.enum(['Draft', 'Sent', 'Partially Received', 'Completed', 'Cancelled'])
});

const receiveStockSchema = z.object({
    items: z.array(z.object({
        poItemId: z.string().uuid(),
        receivedQuantity: z.number().int().min(1),
        lotNumber: z.string().optional(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })).min(1, "At least one item must be received")
});

// ─── Stock Movements & Consumption ────────────────────────────────────────────

const consumeStockSchema = z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1),
    batchId: z.string().uuid().optional(), // Optional: if omitted, use FIFO
    referenceType: z.enum(['Exam', 'Manual']).default('Manual'),
    referenceId: z.string().uuid().optional(),
    notes: z.string().optional()
});

const adjustStockSchema = z.object({
    itemId: z.string().uuid(),
    quantityChange: z.number().int().refine(value => value !== 0, 'Quantity change cannot be zero'),
    batchId: z.string().uuid().optional(),
    notes: z.string().optional()
});

module.exports = {
    createInventoryItemSchema,
    updateInventoryStockSchema,
    createSupplierSchema,
    updateSupplierSchema,
    createPurchaseOrderSchema,
    updatePurchaseOrderStatusSchema,
    receiveStockSchema,
    consumeStockSchema,
    adjustStockSchema
};
