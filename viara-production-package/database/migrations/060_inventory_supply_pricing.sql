-- Track the billable/cost price of consumable supplies and preserve the
-- applied price on each movement for reliable historical totals.
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

UPDATE stock_movements sm
SET unit_price = COALESCE(ii.unit_price, 0),
    total_amount = ABS(sm.quantity_change) * COALESCE(ii.unit_price, 0)
FROM inventory_items ii
WHERE sm.item_id = ii.item_id
  AND (sm.unit_price = 0 OR sm.total_amount = 0);

CREATE INDEX IF NOT EXISTS idx_stock_movements_exam_amount
    ON stock_movements(reference_type, reference_id, total_amount)
    WHERE reference_type = 'Exam';
