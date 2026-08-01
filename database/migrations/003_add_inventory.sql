-- Migration: Add Inventory Table

CREATE TABLE IF NOT EXISTS inventory_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity INTEGER DEFAULT 0 NOT NULL,
    unit VARCHAR(50) DEFAULT 'units',
    min_level INTEGER DEFAULT 10,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed some initial items
INSERT INTO inventory_items (name, category, quantity, unit, min_level)
VALUES 
('MRI Contrast Dye (Gadolinium)', 'Pharmaceuticals', 50, 'vials', 20),
('CT Contrast (Iodine)', 'Pharmaceuticals', 40, 'bottles', 15),
('X-Ray Film (Large)', 'Consumables', 200, 'sheets', 50),
('Disposable Gloves (M)', 'Consumables', 500, 'pairs', 100),
('Syringes (10ml)', 'Consumables', 300, 'units', 50);
