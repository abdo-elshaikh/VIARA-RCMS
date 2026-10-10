-- Phase 13: Advanced Inventory & Consumables Schema

-- 1. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    status VARCHAR(20) DEFAULT 'Draft' 
        CHECK (status IN ('Draft', 'Sent', 'Partially Received', 'Completed', 'Cancelled')),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    total_amount NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(item_id) ON DELETE RESTRICT,
    ordered_quantity INTEGER NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INTEGER DEFAULT 0 CHECK (received_quantity >= 0),
    unit_price NUMERIC(10, 2) DEFAULT 0,
    total_price NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inventory Batches (for Lot/Expiry tracking)
CREATE TABLE IF NOT EXISTS inventory_batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    po_id UUID REFERENCES purchase_orders(po_id) ON DELETE SET NULL,
    lot_number VARCHAR(100),
    expiry_date DATE,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    received_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Stock Movements (Audit log)
CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    batch_id UUID REFERENCES inventory_batches(batch_id) ON DELETE SET NULL,
    movement_type VARCHAR(20) NOT NULL 
        CHECK (movement_type IN ('Receive', 'Consume', 'Adjust', 'Return', 'Expire')),
    quantity_change INTEGER NOT NULL, -- positive for receive/return, negative for consume/expire/adjust_down
    reference_type VARCHAR(50), -- 'PO', 'Exam', 'Manual'
    reference_id UUID, -- po_id, exam_id, etc.
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item ON inventory_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(expiry_date) WHERE quantity > 0;
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_type, reference_id);

-- Optional: Initial trigger to update total quantity on inventory_items when batch quantity changes?
-- For simplicity, we will handle aggregation in the service layer when receiving/consuming, 
-- but a trigger could enforce data integrity. We will stick to service-level updates to match existing patterns.
