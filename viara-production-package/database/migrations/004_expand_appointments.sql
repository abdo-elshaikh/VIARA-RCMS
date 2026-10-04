-- Add new columns for expanded booking details
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS referring_doctor VARCHAR(255);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES users(user_id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS nurse_id UUID REFERENCES users(user_id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS radiologist_id UUID REFERENCES users(user_id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50); -- Cash, Insurance, Card
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS transaction_ref VARCHAR(100); -- Check number, Auth Code
