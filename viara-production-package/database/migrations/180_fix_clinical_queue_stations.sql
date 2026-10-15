-- Migration 179: Align examinations.current_station with queue_stage
--
-- Fixes historical and seeded examinations where current_station was mistakenly set
-- to 'Nurse' for stages that belong to Reception ('Arrived') or Cashier ('Payment Pending').
-- Ensures examinations strictly align with STAGE_STATION mapping so nurses are not
-- presented with unclaimable pre-nursing tasks.

UPDATE examinations
SET current_station = 'Reception'
WHERE queue_stage IN ('Registered', 'Scheduled', 'Arrived')
  AND current_station <> 'Reception';

UPDATE examinations
SET current_station = 'Cashier'
WHERE queue_stage = 'Payment Pending'
  AND current_station <> 'Cashier';

UPDATE examinations
SET current_station = 'Nurse'
WHERE queue_stage = 'Prep Pending'
  AND current_station <> 'Nurse';

UPDATE examinations
SET current_station = 'Modality'
WHERE queue_stage IN ('Ready for Exam', 'In Exam')
  AND current_station <> 'Modality';

UPDATE examinations
SET current_station = 'Radiologist'
WHERE queue_stage = 'Reporting'
  AND current_station <> 'Radiologist';

UPDATE examinations
SET current_station = 'Delivery'
WHERE queue_stage IN ('Images Ready', 'Images Delivered', 'Finalized', 'Delivered')
  AND current_station <> 'Delivery';

-- Clear nurse assignment from appointments whose exams are still in pre-nursing stages (Arrived, Payment Pending, Scheduled)
UPDATE appointments a
SET nurse_id = NULL,
    nurse_assigned_at = NULL,
    nurse_task_available_at = NULL,
    nurse_task_started_at = NULL
FROM examinations e
WHERE e.appointment_id = a.appointment_id
  AND e.queue_stage IN ('Registered', 'Scheduled', 'Arrived', 'Payment Pending')
  AND a.nurse_id IS NOT NULL;
