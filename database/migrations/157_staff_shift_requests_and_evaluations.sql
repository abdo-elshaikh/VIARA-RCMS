-- 157_staff_shift_requests_and_evaluations.sql
-- Migration: Add tables for Shift Swap/Modification Requests and Staff Performance Evaluations

-- 1. Staff Shift Requests (Swap & Modification)
CREATE TABLE IF NOT EXISTS staff_shift_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    shift_id UUID REFERENCES staff_shifts(shift_id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    target_shift_id UUID REFERENCES staff_shifts(shift_id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('Swap', 'Modification', 'Drop')),
    requested_start_time TIMESTAMP WITH TIME ZONE,
    requested_end_time TIMESTAMP WITH TIME ZONE,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_requests_user ON staff_shift_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_requests_target_user ON staff_shift_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_requests_status ON staff_shift_requests(status);
CREATE INDEX IF NOT EXISTS idx_staff_shift_requests_created ON staff_shift_requests(created_at DESC);

-- 2. Staff Evaluations
CREATE TABLE IF NOT EXISTS staff_evaluations (
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    evaluation_period VARCHAR(50) NOT NULL DEFAULT '2026-Q1',
    overall_rating NUMERIC(3, 2) NOT NULL CHECK (overall_rating >= 1.0 AND overall_rating <= 5.0),
    punctuality_score INT DEFAULT 5 CHECK (punctuality_score BETWEEN 1 AND 5),
    clinical_quality_score INT DEFAULT 5 CHECK (clinical_quality_score BETWEEN 1 AND 5),
    teamwork_score INT DEFAULT 5 CHECK (teamwork_score BETWEEN 1 AND 5),
    productivity_score INT DEFAULT 5 CHECK (productivity_score BETWEEN 1 AND 5),
    strengths TEXT,
    areas_for_improvement TEXT,
    goals TEXT,
    status VARCHAR(50) DEFAULT 'Finalized' CHECK (status IN ('Draft', 'Finalized', 'Acknowledged')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_evaluations_user ON staff_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_evaluations_period ON staff_evaluations(evaluation_period);
CREATE INDEX IF NOT EXISTS idx_staff_evaluations_created ON staff_evaluations(created_at DESC);
