-- Phase 9: Result delivery tracking and report access log

CREATE TABLE IF NOT EXISTS result_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    referring_doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE SET NULL,
    delivery_method VARCHAR(30) NOT NULL CHECK (delivery_method IN (
        'Printed', 'Email', 'SMS Link', 'WhatsApp Link', 'Patient Portal',
        'Doctor Portal', 'Physical Pickup'
    )),
    recipient_name VARCHAR(150),
    recipient_contact VARCHAR(150),
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (delivery_status IN (
        'Pending', 'Sent', 'Delivered', 'Failed', 'Acknowledged',
        'Picked Up', 'Accessed', 'Printed'
    )),
    delivered_by UUID REFERENCES users(user_id),
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    print_copy_count INTEGER NOT NULL DEFAULT 0 CHECK (print_copy_count >= 0),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by_name VARCHAR(150),
    notes TEXT,
    access_ip VARCHAR(80),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_result_deliveries_exam ON result_deliveries(exam_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_result_deliveries_patient ON result_deliveries(patient_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_result_deliveries_status ON result_deliveries(delivery_status);
