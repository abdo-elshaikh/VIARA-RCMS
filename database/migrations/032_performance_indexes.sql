-- Phase 3: Performance Optimization Indexes

-- Improve date range queries for invoicing and closures
CREATE INDEX IF NOT EXISTS idx_invoices_generated_at ON invoices(generated_at);

-- Improve date range and sorting queries for appointments
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);

-- Improve compound work-queue queries (queue state lives on examinations).
CREATE INDEX IF NOT EXISTS idx_examinations_queue_stage_created
ON examinations(queue_stage, created_at);

-- Additional indexing for patient search and waiting list dates
CREATE INDEX IF NOT EXISTS idx_waiting_list_preferred_date ON waiting_list(preferred_date);
