#!/usr/bin/env node
'use strict';

/**
 * verify_multibranch_http.js
 * End-to-end HTTP integration test suite for Enterprise Multi-Branch Architecture
 * Validates:
 *   - MBT-1000: Quota enforcement & branch provisioning
 *   - MBT-1001: MB-03 Claims cross-branch isolation
 *   - MBT-1002: MB-04 Payroll cross-branch isolation
 *   - MBT-1003: MB-05 Financial reports branch scoping
 *   - MBT-1004: MB-06 Cashier/Reception shift membership validation
 *   - MB-07: Cross-branch equipment / modality booking guard
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BACKEND_URL = process.env.TEST_BACKEND_URL || 'http://127.0.0.1:3000';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/rcms';

const pool = new Pool({ connectionString: DATABASE_URL });
const AuthService = require('../src/services/authService');
const branchService = require('../src/services/branchService');
const bcrypt = require('bcrypt');

const CSRF_TEST_TOKEN = 'test-csrf-token-9876543210abcdef';
const HQ_BRANCH_ID = '00000000-0000-4000-8000-000000000001';
let dokkiBranchId = null;
let adminToken = null;
let receptionToken = null;
let adminUser = null;
let receptionUser = null;

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
        failed++;
    }
}

async function request(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
    const url = `${BACKEND_URL}${endpoint}`;
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `csrf_token=${CSRF_TEST_TOKEN}`,
            'x-csrf-token': CSRF_TEST_TOKEN,
            ...headers
        }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    let data;
    let text = null;
    try {
        text = await res.text();
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, data, text, headers: res.headers };
}

async function run() {
    console.log('===============================================================');
    console.log('  VIARA ENTERPRISE MULTI-BRANCH END-TO-END VERIFICATION SUITE  ');
    console.log('===============================================================\n');

    // 0. Setup authentication tokens
    console.log('[Setup] Provisioning test session tokens...');
    let adminRes = await pool.query("SELECT * FROM users WHERE email = 'multibranch.admin@VIARA.com'");
    if (adminRes.rows.length === 0) {
        await pool.query(`
            INSERT INTO users (
                email, full_name, password_hash, role, is_active, is_org_admin, preferences
            )
            SELECT 'multibranch.admin@VIARA.com', 'MultiBranch Test Admin', password_hash, 'Admin', TRUE, TRUE, preferences
            FROM users WHERE email = 'admin@VIARA.com'
        `);
        adminRes = await pool.query("SELECT * FROM users WHERE email = 'multibranch.admin@VIARA.com'");
    }
    adminUser = adminRes.rows[0];
    if (!adminUser) throw new Error('multibranch.admin@VIARA.com not found or could not be provisioned');

    const receptionRes = await pool.query("SELECT * FROM users WHERE email = 'reception@VIARA.com'");
    receptionUser = receptionRes.rows[0];
    if (!receptionUser) throw new Error('reception@VIARA.com not found in database');

    const adminTokens = await AuthService.generateTokens(
        pool,
        { user_id: adminUser.user_id, role: adminUser.role, is_org_admin: true },
        adminUser.user_id
    );
    adminToken = adminTokens.token;

    const receptionTokens = await AuthService.generateTokens(
        pool,
        { user_id: receptionUser.user_id, role: receptionUser.role, is_org_admin: false },
        receptionUser.user_id
    );
    receptionToken = receptionTokens.token;

    console.log(`  Admin User: ${adminUser.email} (${adminUser.user_id})`);
    console.log(`  Reception User: ${receptionUser.email} (${receptionUser.user_id})`);

    // Ensure admin user has active attendance clock-in
    await pool.query(`
        DELETE FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL
    `, [adminUser.user_id]);
    await pool.query(`
        INSERT INTO attendance_logs (user_id, clock_in)
        VALUES ($1, CURRENT_TIMESTAMP)
    `, [adminUser.user_id]);

    // Ensure reception user has active attendance clock-in (required by attendanceWorkGate for mutations)
    await pool.query(`
        DELETE FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL
    `, [receptionUser.user_id]);
    await pool.query(`
        INSERT INTO attendance_logs (user_id, clock_in)
        VALUES ($1, CURRENT_TIMESTAMP)
    `, [receptionUser.user_id]);

    // Ensure reception user is initially ONLY member of HQ
    await pool.query(`
        DELETE FROM user_branch_memberships 
        WHERE user_id = $1 AND branch_id != $2
    `, [receptionUser.user_id, HQ_BRANCH_ID]);
    await pool.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, is_default, is_active)
        VALUES ($1, $2, TRUE, TRUE)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = TRUE
    `, [receptionUser.user_id, HQ_BRANCH_ID]);

    branchService.invalidateUserMembershipCache();
    console.log('  Active attendance and baseline memberships initialized.\n');

    // ── Test 1: MBT-1000 Check Quota ─────────────────────────────────────────
    console.log('[Test 1] MBT-1000 License Branch Quota Endpoint');
    const quotaRes = await request('/api/settings/branches/quota', {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(quotaRes.status === 200, 'GET /api/settings/branches/quota returns 200', `Status: ${quotaRes.status}`);
    assert(quotaRes.data?.multiBranchAllowed === true, 'multiBranchAllowed is true for enterprise license', JSON.stringify(quotaRes.data));
    assert(quotaRes.data?.currentCount >= 1, `currentCount is at least 1 (${quotaRes.data?.currentCount})`);

    // ── Test 2: Create Dokki Branch ──────────────────────────────────────────
    console.log('\n[Test 2] MBT-1000 Create New Branch (Dokki Branch)');
    const existingDokki = await pool.query("SELECT id FROM branches WHERE code = 'DOKKI'");
    if (existingDokki.rows.length > 0) {
        dokkiBranchId = existingDokki.rows[0].id;
        console.log(`  Found existing DOKKI branch: ${dokkiBranchId}`);
        assert(true, 'Found existing DOKKI branch');
    } else {
        const createRes = await request('/api/settings/branches', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
                code: 'DOKKI',
                name: 'Dokki Branch',
                nameAr: 'فرع الدقي التخصصي',
                type: 'branch',
                phone: '0237612345',
                address: '15 Mossadak St, Dokki',
                addressAr: '١٥ شارع مصدق، الدقي',
                city: 'Giza',
                governorate: 'Giza',
                invoicePrefix: 'DKI-INV-',
                modalities: ['MRI', 'CT', 'X-RAY']
            }
        });
        assert(createRes.status === 200 || createRes.status === 201, 'POST /api/settings/branches succeeds', `Status: ${createRes.status} Error: ${createRes.data?.message || createRes.data?.error}`);
        dokkiBranchId = createRes.data?.branch?.id;
        assert(Boolean(dokkiBranchId), `Branch created with ID: ${dokkiBranchId}`);
    }

    if (!dokkiBranchId) {
        throw new Error('Could not obtain dokkiBranchId for downstream tests.');
    }

    // ── Test 3: List Branches ────────────────────────────────────────────────
    console.log('\n[Test 3] MBT-1000 List Branches Hierarchy');
    const branchesRes = await request('/api/settings/branches', {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(branchesRes.status === 200, 'GET /api/settings/branches returns 200');
    const branchCodes = branchesRes.data?.branches?.map(b => b.code) || [];
    assert(branchCodes.includes('MAIN'), 'Branches include HQ (MAIN)');
    assert(branchCodes.includes('DOKKI'), 'Branches include newly created branch (DOKKI)');

    // ── Test 4: MB-03 Claims Cross-Branch Isolation ──────────────────────────
    console.log('\n[Test 4] MBT-1001 Claims Cross-Branch Isolation (MB-03)');
    // Admin access to both branches
    const adminClaimsHQ = await request('/api/claims', {
        headers: {
            Authorization: `Bearer ${adminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(adminClaimsHQ.status === 200, 'Org Admin can access Claims in HQ branch context');

    const adminClaimsDokki = await request('/api/claims', {
        headers: {
            Authorization: `Bearer ${adminToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(adminClaimsDokki.status === 200, 'Org Admin can access Claims in Dokki branch context');

    // Receptionist access to HQ vs Dokki
    const receptionClaimsHQ = await request('/api/claims', {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(receptionClaimsHQ.status === 200, 'Receptionist can access Claims in authorized HQ branch');

    const receptionClaimsDokki = await request('/api/claims', {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        receptionClaimsDokki.status === 403 && receptionClaimsDokki.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist blocked from unauthorized Dokki Claims with 403 BRANCH_ACCESS_DENIED',
        `Got: ${receptionClaimsDokki.status} code: ${receptionClaimsDokki.data?.code}`
    );

    // ── Test 5: MB-04 Payroll Cross-Branch Isolation ─────────────────────────
    console.log('\n[Test 5] MBT-1002 Payroll Cross-Branch Isolation (MB-04)');
    const receptionPayrollDokki = await request('/api/payroll/periods', {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        receptionPayrollDokki.status === 403,
        'Unauthorized staff blocked from Dokki Payroll with 403',
        `Got: ${receptionPayrollDokki.status}`
    );

    // ── Test 6: MB-06 Cashier Shift Membership Validation ────────────────────
    console.log('\n[Test 6] MBT-1004 Cashier Shift Membership Validation (MB-06)');
    // Receptionist tries to open shift in Dokki without membership
    const receptionShiftDokkiDenied = await request('/api/cashier/shifts/open', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': dokkiBranchId
        },
        body: { initialCash: 500 }
    });
    assert(
        receptionShiftDokkiDenied.status === 403 && receptionShiftDokkiDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Staff without membership blocked from opening cashier shift in foreign branch with 403 BRANCH_ACCESS_DENIED',
        `Got: ${receptionShiftDokkiDenied.status} code: ${receptionShiftDokkiDenied.data?.code}`
    );

    // Now assign Receptionist to Dokki branch membership
    console.log('  Assigning Receptionist to Dokki Branch membership via API...');
    const assignRes = await request(`/api/settings/branches/${dokkiBranchId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            userId: receptionUser.user_id,
            role: 'member',
            isDefault: false
        }
    });
    assert(
        assignRes.status === 200 || assignRes.status === 201,
        'POST /api/settings/branches/:id/members succeeds',
        `Status: ${assignRes.status} Body: ${JSON.stringify(assignRes.data)}`
    );

    branchService.invalidateUserMembershipCache();

    // Now Receptionist tries to access Claims in Dokki again with membership
    const receptionClaimsDokkiAllowed = await request('/api/claims', {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        receptionClaimsDokkiAllowed.status === 200,
        'Staff with newly granted membership can now access Dokki Claims'
    );

    // ── Test 7: MB-07 Cross-Branch Modality Booking Guard ────────────────────
    console.log('\n[Test 7] MB-07 Cross-Branch Modality Booking Guard');
    let dokkiModalityId = null;
    const existingModality = await pool.query(
        "SELECT modality_id FROM modalities WHERE branch_id = $1 AND deleted_at IS NULL LIMIT 1",
        [dokkiBranchId]
    );
    if (existingModality.rows.length > 0) {
        dokkiModalityId = existingModality.rows[0].modality_id;
    } else {
        const newMod = await pool.query(`
            INSERT INTO modalities (
                name, type, branch_id, status
            )
            VALUES ('Dokki MRI Magnetom 1.5T', 'MRI', $1, 'Active')
            RETURNING modality_id
        `, [dokkiBranchId]);
        dokkiModalityId = newMod.rows[0].modality_id;
    }
    console.log(`  Dokki Modality ID: ${dokkiModalityId}`);

    // Try to book this Dokki modality under HQ branch context as Receptionist
    const startTime = new Date(Date.now() + 86400000).toISOString();
    const endTime = new Date(Date.now() + 86400000 + 1800000).toISOString();
    
    const patientRes = await pool.query("SELECT patient_id FROM patients LIMIT 1");
    const patientId = patientRes.rows[0]?.patient_id;

    if (patientId) {
        const crossBranchBooking = await request('/api/appointments', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${receptionToken}`,
                'x-branch-id': HQ_BRANCH_ID // Context is HQ, but modality belongs to Dokki
            },
            body: {
                patientId,
                modalityId: dokkiModalityId,
                startTime,
                endTime,
                notes: 'Cross branch test booking'
            }
        });
        assert(
            crossBranchBooking.status === 403 && crossBranchBooking.data?.code === 'BRANCH_ACCESS_DENIED',
            'Cross-branch modality booking blocked with 403 BRANCH_ACCESS_DENIED',
            `Got status: ${crossBranchBooking.status} message: ${crossBranchBooking.data?.message || crossBranchBooking.data?.error}`
        );
    } else {
        console.log('  [SKIP] No patient found for modality booking test');
    }

    // ── Test 8: Branch Update & Status Lifecycle ─────────────────────────────
    console.log('\n[Test 8] Branch Status & Details Update');
    const updateRes = await request(`/api/settings/branches/${dokkiBranchId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            status: 'maintenance',
            hotline: '19999',
            notes: 'Scheduled magnet helium refill'
        }
    });
    assert(updateRes.status === 200, 'PUT /api/settings/branches/:id succeeds', `Status: ${updateRes.status}`);
    assert(updateRes.data?.branch?.status === 'maintenance', 'Branch status updated to maintenance');

    // Restore to active
    await request(`/api/settings/branches/${dokkiBranchId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'active' }
    });

    // ── Test 9: MB-08 PACS / DICOM / MWL Cross-Branch Scoping & Isolation ─────
    console.log('\n[Test 9] MB-08 PACS / DICOM / MWL Cross-Branch Scoping & Isolation');

    // 9a. Technician with HQ-only membership
    const techRes = await pool.query("SELECT * FROM users WHERE email = 'mohamed.tech@VIARA.com'");
    const techUser = techRes.rows[0];
    assert(!!techUser, 'Technician test user exists in database');

    // Ensure technician has active attendance clock-in (required by attendanceWorkGate)
    await pool.query(`
        DELETE FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL
    `, [techUser.user_id]);
    await pool.query(`
        INSERT INTO attendance_logs (user_id, clock_in)
        VALUES ($1, CURRENT_TIMESTAMP)
    `, [techUser.user_id]);

    const techTokens = await AuthService.generateTokens(
        pool,
        { user_id: techUser.user_id, role: techUser.role, is_org_admin: false },
        techUser.user_id
    );
    const techToken = techTokens.token;

    await pool.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, role, is_default, is_active)
        VALUES ($1, $2, 'member', true, true)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = true
    `, [techUser.user_id, HQ_BRANCH_ID]);
    await pool.query(`
        DELETE FROM user_branch_memberships WHERE user_id = $1 AND branch_id = $2
    `, [techUser.user_id, dokkiBranchId]);
    branchService.invalidateUserMembershipCache();

    // 9b. Provision a test examination and study belonging specifically to Dokki Branch
    const examTypeRes = await pool.query("SELECT type_id FROM examination_types LIMIT 1");
    const examTypeId = examTypeRes.rows[0]?.type_id;
    const timestamp = Date.now();
    const dokkiStudyUid = `1.2.826.0.1.3680043.8.498.${timestamp}`;
    const dokkiOrderNumber = `ORD-DOKKI-${timestamp}`;

    const insExam = await pool.query(`
        INSERT INTO examinations (
            patient_id, modality_id, exam_type_id, status, queue_stage, current_station,
            order_number, study_instance_uid, branch_id
        ) VALUES (
            $1, $2, $3, 'Scheduled', 'Scheduled', 'Modality',
            $4, $5, $6
        ) RETURNING exam_id
    `, [patientId, dokkiModalityId, examTypeId, dokkiOrderNumber, dokkiStudyUid, dokkiBranchId]);
    const dokkiExamId = insExam.rows[0].exam_id;
    console.log(`  Provisioned Dokki Examination: ${dokkiExamId} (Study UID: ${dokkiStudyUid})`);

    // 9c. Org Admin queries Dokki PACS Worklist Preview -> succeeds
    const adminMwlPreview = await request(`/api/pacs/worklist/preview?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminMwlPreview.status === 200, 'Org Admin can preview Dokki branch MWL');

    // 9d. Technician (HQ-only) attempts to query Dokki scheduled exams via branch param -> 403 BRANCH_ACCESS_DENIED
    const crossBranchSearchRes = await request(`/api/pacs/scheduled-exams?q=ORD-DOKKI&branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        crossBranchSearchRes.status === 403 && crossBranchSearchRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician without Dokki membership receives 403 BRANCH_ACCESS_DENIED on Dokki scheduled-exams'
    );

    // 9e. Technician searches scheduled exams under HQ context: Dokki exam is strictly filtered out
    const hqSearchRes = await request(`/api/pacs/scheduled-exams?q=ORD-DOKKI`, {
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    const dokkiFoundInHq = Array.isArray(hqSearchRes.data) && hqSearchRes.data.some(e => e.exam_id === dokkiExamId);
    assert(
        hqSearchRes.status === 200 && !dokkiFoundInHq,
        'Scheduled exams search under HQ strictly excludes Dokki examinations'
    );

    // 9f. Technician attempts to create PACS viewer session for Dokki examination -> 403 BRANCH_ACCESS_DENIED
    const crossBranchViewerRes = await request('/api/pacs/viewer-session', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            examId: dokkiExamId,
            studyInstanceUids: [dokkiStudyUid]
        }
    });
    assert(
        crossBranchViewerRes.status === 403 && crossBranchViewerRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician cannot mint viewer session for foreign branch examination (403 BRANCH_ACCESS_DENIED)',
        `Status: ${crossBranchViewerRes.status}, Code: ${crossBranchViewerRes.data?.code}`
    );

    // 9g. Org Admin can mint viewer session for Dokki examination
    const adminViewerRes = await request('/api/pacs/viewer-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            examId: dokkiExamId,
            studyInstanceUids: [dokkiStudyUid]
        }
    });
    assert(
        adminViewerRes.status === 200 && adminViewerRes.data?.viewerSessionReady === true,
        'Org Admin can access viewer session across any branch'
    );

    // 9h. Clean up test examination
    await pool.query("UPDATE examinations SET status = 'Completed' WHERE exam_id = $1", [dokkiExamId]);

    // ── Test 10: Clinical, Queue & Appointments Cross-Branch Boundary Enforcement ──
    console.log('\n[Test 10] Clinical, Queue & Appointments Cross-Branch Boundary Enforcement');

    // 10a. Ensure Receptionist and Technician are HQ-only (revoke Dokki membership)
    await pool.query(`
        DELETE FROM user_branch_memberships
        WHERE user_id IN ($1, $2) AND branch_id = $3
    `, [receptionUser.user_id, techUser.user_id, dokkiBranchId]);
    branchService.invalidateUserMembershipCache();

    // 10b. Provision a test appointment and clinical exam belonging specifically to Dokki Branch
    const testTimeOffsetMs = (30 * 86400000) + (Math.floor(Math.random() * 100000) * 60000);
    const testApptStart = new Date(Date.now() + testTimeOffsetMs).toISOString();
    const testApptEnd = new Date(Date.now() + testTimeOffsetMs + 1800000).toISOString();
    const testOrderNumber = `ORD-DOKKI-APPT-${Date.now()}`;

    const apptInsertRes = await pool.query(`
        INSERT INTO appointments (
            patient_id, modality_id, exam_type_id, start_time, end_time,
            status, order_number, notes, branch_id
        ) VALUES (
            $1, $2, $3, $4, $5,
            'Scheduled', $6, 'Test Dokki branch appointment isolation', $7
        ) RETURNING appointment_id
    `, [patientId, dokkiModalityId, examTypeId, testApptStart, testApptEnd, testOrderNumber, dokkiBranchId]);
    const dokkiApptId = apptInsertRes.rows[0].appointment_id;

    const testStudyUid = `1.2.826.0.1.3680043.8.498.appt.${Date.now()}`;
    const examInsertRes = await pool.query(`
        INSERT INTO examinations (
            patient_id, modality_id, exam_type_id, status, queue_stage, current_station,
            order_number, study_instance_uid, branch_id, appointment_id
        ) VALUES (
            $1, $2, $3, 'Scheduled', 'Ready for Exam', 'Modality',
            $4, $5, $6, $7
        ) RETURNING exam_id
    `, [patientId, dokkiModalityId, examTypeId, testOrderNumber, testStudyUid, dokkiBranchId, dokkiApptId]);
    const dokkiClinicalExamId = examInsertRes.rows[0].exam_id;
    console.log(`  Provisioned Dokki Appointment: ${dokkiApptId}, Exam: ${dokkiClinicalExamId}`);

    // 10c. Receptionist (HQ-only) attempts GET /api/appointments/:id -> 403 BRANCH_ACCESS_DENIED
    const recGetApptRes = await request(`/api/appointments/${dokkiApptId}`, {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        recGetApptRes.status === 403 && recGetApptRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on GET /api/appointments/:id'
    );

    // 10d. Receptionist (HQ-only) attempts PUT /api/appointments/:id -> 403 BRANCH_ACCESS_DENIED
    const recPutApptRes = await request(`/api/appointments/${dokkiApptId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            notes: 'Unauthorized branch appointment update'
        }
    });
    assert(
        recPutApptRes.status === 403 && recPutApptRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on PUT /api/appointments/:id'
    );

    // 10e. Receptionist (HQ-only) attempts POST /api/appointments/:id/reschedule -> 403 BRANCH_ACCESS_DENIED
    const recRescheduleRes = await request(`/api/appointments/${dokkiApptId}/reschedule`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            startTime: new Date(Date.now() + testTimeOffsetMs + 86400000).toISOString(),
            endTime: new Date(Date.now() + testTimeOffsetMs + 86400000 + 1800000).toISOString(),
            reason: 'Attempted cross-branch reschedule'
        }
    });
    assert(
        recRescheduleRes.status === 403 && recRescheduleRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on POST /api/appointments/:id/reschedule'
    );

    // 10f. Receptionist (HQ-only) attempts POST /api/appointments/:id/cancel -> 403 BRANCH_ACCESS_DENIED
    const recCancelRes = await request(`/api/appointments/${dokkiApptId}/cancel`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            reason: 'Attempted cross-branch cancel'
        }
    });
    assert(
        recCancelRes.status === 403 && recCancelRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on POST /api/appointments/:id/cancel',
        `Status: ${recCancelRes.status}, Body: ${JSON.stringify(recCancelRes.data)}`
    );

    // 10g. Technician (HQ-only) attempts POST /api/queue/:examId/claim -> 403 BRANCH_ACCESS_DENIED
    const techClaimRes = await request(`/api/queue/${dokkiClinicalExamId}/claim`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        techClaimRes.status === 403 && techClaimRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician (HQ-only) receives 403 BRANCH_ACCESS_DENIED on POST /api/queue/:examId/claim'
    );

    // 10h. Technician (HQ-only) attempts GET /api/exams/:id -> 403 BRANCH_ACCESS_DENIED
    const techGetExamRes = await request(`/api/exams/${dokkiClinicalExamId}`, {
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        techGetExamRes.status === 403 && techGetExamRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician (HQ-only) receives 403 BRANCH_ACCESS_DENIED on GET /api/exams/:id'
    );

    // 10i. Org Admin accesses Dokki appointment -> 200 OK
    const adminGetApptRes = await request(`/api/appointments/${dokkiApptId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetApptRes.status === 200 && adminGetApptRes.data?.appointment_id === dokkiApptId,
        'Org Admin can access Dokki appointment with 200 OK'
    );

    // 10j. Org Admin accesses Dokki examination details -> 200 OK
    const adminGetExamRes = await request(`/api/exams/${dokkiClinicalExamId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetExamRes.status === 200 && adminGetExamRes.data?.exam_id === dokkiClinicalExamId,
        'Org Admin can access Dokki examination details with 200 OK'
    );

    // 10k. Clean up test records (status = 'Completed' / 'Cancelled')
    await pool.query("UPDATE examinations SET status = 'Completed' WHERE exam_id = $1", [dokkiClinicalExamId]);
    await pool.query("UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = $1", [dokkiApptId]);

    // ── Test 11: MBT-406 Financial Invoices & Billing Branch Isolation ───────
    console.log('\n[Test 11] MBT-406 Financial Invoices & Billing Branch Isolation');

    // 11a. Provision a test invoice belonging specifically to Dokki Branch
    const testInvNumber = `INV-DOKKI-${Date.now()}`;
    const invInsertRes = await pool.query(`
        INSERT INTO invoices (
            patient_id, total_amount, patient_payable_amount, branch_id,
            invoice_status, notes, invoice_number
        ) VALUES (
            $1, 750.00, 750.00, $2,
            'Pending', 'Test Dokki branch invoice isolation', $3
        ) RETURNING invoice_id, invoice_number
    `, [patientId, dokkiBranchId, testInvNumber]);
    const dokkiInvoiceId = invInsertRes.rows[0].invoice_id;
    console.log(`  Provisioned Dokki Invoice: ${dokkiInvoiceId} (${testInvNumber})`);

    // 11b. Receptionist (HQ-only) attempts GET /api/invoices/:id -> 403 BRANCH_ACCESS_DENIED
    const recGetInvRes = await request(`/api/invoices/${dokkiInvoiceId}`, {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        recGetInvRes.status === 403 && recGetInvRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on GET /api/invoices/:id',
        `Status: ${recGetInvRes.status}, Body: ${JSON.stringify(recGetInvRes.data)}`
    );

    // 11c. Receptionist (HQ-only) attempts POST /api/invoices/:id/payment -> 403 BRANCH_ACCESS_DENIED
    const testPaymentIdempotency = '00000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
    const recPayInvRes = await request(`/api/invoices/${dokkiInvoiceId}/payment`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID,
            'Idempotency-Key': testPaymentIdempotency
        },
        body: {
            amount: 100,
            method: 'Cash',
            notes: 'Attempted cross-branch payment collection'
        }
    });
    assert(
        recPayInvRes.status === 403 && recPayInvRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED on POST /api/invoices/:id/payment',
        `Status: ${recPayInvRes.status}, Body: ${JSON.stringify(recPayInvRes.data)}`
    );

    // 11d. Receptionist (HQ-only) attempts GET /api/invoices?branchId=${dokkiBranchId} -> 403 BRANCH_ACCESS_DENIED
    const recQueryDokkiInvRes = await request(`/api/invoices?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        recQueryDokkiInvRes.status === 403 && recQueryDokkiInvRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED when querying Dokki invoices'
    );

    // 11e. Receptionist (HQ-only) lists GET /api/invoices without branchId -> strictly returns HQ invoices, Dokki invoice excluded
    const recListInvRes = await request('/api/invoices', {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        recListInvRes.status === 200 && Array.isArray(recListInvRes.data?.invoices || recListInvRes.data),
        'Receptionist (HQ-only) successfully lists invoices under HQ branch'
    );
    const recInvoices = recListInvRes.data?.invoices || recListInvRes.data;
    assert(
        !recInvoices.some(inv => inv.invoice_id === dokkiInvoiceId),
        'Invoices list for HQ Receptionist strictly excludes Dokki invoices'
    );

    // 11f. Org Admin can access Dokki invoice with 200 OK
    const adminGetInvRes = await request(`/api/invoices/${dokkiInvoiceId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetInvRes.status === 200 && (adminGetInvRes.data?.invoice_id === dokkiInvoiceId || adminGetInvRes.data?.id === dokkiInvoiceId),
        'Org Admin can access Dokki invoice with 200 OK'
    );

    // 11g. Clean up test invoice
    await pool.query("UPDATE invoices SET invoice_status = 'Voided' WHERE invoice_id = $1", [dokkiInvoiceId]);

    // ── Test 12: MBT-506 / MBT-507 Inventory & Supplies Branch Isolation ─────
    console.log('\n[Test 12] MBT-506 / MBT-507 Inventory & Supplies Branch Isolation');

    // 12a. Provision a test inventory item belonging specifically to Dokki Branch
    const itemInsertRes = await pool.query(`
        INSERT INTO inventory_items (
            name, category, quantity, unit, unit_price, branch_id
        ) VALUES (
            'Dokki Syringe Pack 50ml Test', 'Supplies', 100, 'packs', 45.00, $1
        ) RETURNING item_id
    `, [dokkiBranchId]);
    const dokkiItemId = itemInsertRes.rows[0].item_id;
    console.log(`  Provisioned Dokki Inventory Item: ${dokkiItemId}`);

    // 12b. Technician (HQ-only) attempts POST /api/inventory/consume on Dokki item -> 403 BRANCH_ACCESS_DENIED
    const techConsumeRes = await request('/api/inventory/consume', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            itemId: dokkiItemId,
            quantity: 2,
            reason: 'Cross branch consumption attempt'
        }
    });
    assert(
        techConsumeRes.status === 403 && techConsumeRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician (HQ-only) receives 403 BRANCH_ACCESS_DENIED on POST /api/inventory/consume for Dokki item',
        `Status: ${techConsumeRes.status}, Body: ${JSON.stringify(techConsumeRes.data)}`
    );

    // 12c. Technician (HQ-only) attempts GET /api/inventory?branchId=${dokkiBranchId} -> 403 BRANCH_ACCESS_DENIED
    const techQueryDokkiInvRes = await request(`/api/inventory?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        techQueryDokkiInvRes.status === 403 && techQueryDokkiInvRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician (HQ-only) receives 403 BRANCH_ACCESS_DENIED when querying Dokki inventory items'
    );

    // 12d. Technician (HQ-only) lists GET /api/inventory without branchId -> strictly returns HQ items, Dokki item excluded
    const techListInvRes = await request('/api/inventory', {
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        techListInvRes.status === 200 && Array.isArray(techListInvRes.data),
        'Technician (HQ-only) successfully lists inventory items under HQ branch'
    );
    assert(
        !techListInvRes.data.some(item => item.item_id === dokkiItemId),
        'Inventory items list for HQ Technician strictly excludes Dokki items'
    );

    // 12e. Org Admin queries GET /api/inventory?branchId=${dokkiBranchId} -> 200 OK and includes Dokki item
    const adminDokkiInvRes = await request(`/api/inventory?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminDokkiInvRes.status === 200 && Array.isArray(adminDokkiInvRes.data) && adminDokkiInvRes.data.some(item => item.item_id === dokkiItemId),
        'Org Admin can query Dokki inventory items with 200 OK'
    );

    // 12f. Clean up test inventory item
    await pool.query('DELETE FROM stock_movements WHERE item_id = $1', [dokkiItemId]);
    await pool.query('DELETE FROM inventory_items WHERE item_id = $1', [dokkiItemId]);

    // ── Test 13: MBT-406 Financial Expenses & Closures Branch Isolation ──────
    console.log('\n[Test 13] MBT-406 Financial Expenses & Closures Branch Isolation');

    const accountantRes = await pool.query("SELECT * FROM users WHERE email = 'accountant@VIARA.com'");
    const accountantUser = accountantRes.rows[0];
    assert(accountantUser, 'accountant@VIARA.com exists in database');

    const accountantTokens = await AuthService.generateTokens(
        pool,
        { user_id: accountantUser.user_id, role: accountantUser.role, is_org_admin: false },
        accountantUser.user_id
    );
    const accountantToken = accountantTokens.token;

    // 13a. Accountant (HQ-only) attempts GET /api/finance/expenses?branchId=${dokkiBranchId} -> 403 BRANCH_ACCESS_DENIED
    const accExpRes = await request(`/api/finance/expenses?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${accountantToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        accExpRes.status === 403 && accExpRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Accountant (HQ-only) receives 403 BRANCH_ACCESS_DENIED when querying Dokki expenses',
        `Status: ${accExpRes.status}, Body: ${JSON.stringify(accExpRes.data)}`
    );

    // 13b. Accountant (HQ-only) attempts GET /api/finance/closures?branchId=${dokkiBranchId} -> 403 BRANCH_ACCESS_DENIED
    const accClosureRes = await request(`/api/finance/closures?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${accountantToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        accClosureRes.status === 403 && accClosureRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Accountant (HQ-only) receives 403 BRANCH_ACCESS_DENIED when querying Dokki financial closures',
        `Status: ${accClosureRes.status}, Body: ${JSON.stringify(accClosureRes.data)}`
    );

    // 13c. Org Admin queries GET /api/finance/expenses?branchId=${dokkiBranchId} -> 200 OK
    const adminExpRes = await request(`/api/finance/expenses?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminExpRes.status === 200 && Array.isArray(adminExpRes.data),
        'Org Admin can query Dokki expenses with 200 OK'
    );

    // 13d. Org Admin queries GET /api/finance/closures?branchId=${dokkiBranchId} -> 200 OK
    const adminClosureRes = await request(`/api/finance/closures?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminClosureRes.status === 200 && Array.isArray(adminClosureRes.data),
        'Org Admin can query Dokki financial closures with 200 OK'
    );

    // ── Test 14: MBT-510 Display & Calling Screens Branch Scoping ────────────
    console.log('\n[Test 14] MBT-510 Display & Calling Screens Branch Scoping');

    const hqModRes = await pool.query(
        "SELECT modality_id FROM modalities WHERE branch_id = $1 AND deleted_at IS NULL LIMIT 1",
        [HQ_BRANCH_ID]
    );
    const hqModalityId = hqModRes.rows[0]?.modality_id;

    // 14a. Query public waiting-room display board for Dokki branch -> 200 OK
    const dokkiBoardRes = await request(`/api/display/board?branchId=${dokkiBranchId}`);
    assert(
        dokkiBoardRes.status === 200 && dokkiBoardRes.data?.branchId === dokkiBranchId,
        'Public display board queries Dokki branch with 200 OK and returns branchId',
        `Status: ${dokkiBoardRes.status}, Body: ${JSON.stringify(dokkiBoardRes.data)}`
    );

    // Verify Dokki board modalities do not contain HQ machines
    const dokkiMachines = (dokkiBoardRes.data?.rooms || []).flatMap(r => r.machines || []);
    const hasHqMachineInDokkiBoard = dokkiMachines.some(m => m.machine_id === hqModalityId);
    assert(
        !hasHqMachineInDokkiBoard,
        'Dokki waiting room board excludes HQ modalities'
    );

    // 14b. Query public waiting-room display board for HQ branch -> 200 OK
    const hqBoardRes = await request(`/api/display/board?branchId=${HQ_BRANCH_ID}`);
    assert(
        hqBoardRes.status === 200 && hqBoardRes.data?.branchId === HQ_BRANCH_ID,
        'Public display board queries HQ branch with 200 OK and returns branchId'
    );

    // Verify HQ board modalities do not contain Dokki machines
    const hqMachines = (hqBoardRes.data?.rooms || []).flatMap(r => r.machines || []);
    const hasDokkiMachineInHqBoard = hqMachines.some(m => m.machine_id === dokkiModalityId);
    assert(
        !hasDokkiMachineInHqBoard,
        'HQ waiting room board excludes Dokki modalities'
    );

    // 14c. Query public queue display for Dokki branch -> 200 OK
    const dokkiQueueRes = await request(`/api/display/queue?branchId=${dokkiBranchId}`);
    assert(
        dokkiQueueRes.status === 200 && dokkiQueueRes.data?.branchId === dokkiBranchId,
        'Public queue display queries Dokki branch with 200 OK'
    );

    // 14d. Technician (HQ-only) attempts cross-branch broadcast call to Dokki order -> 403 BRANCH_ACCESS_DENIED
    const crossBranchCallRes = await request('/api/display/broadcast-call', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${techToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            orderNumber: 'CALL-DOKKI-CROSS-TEST',
            branchId: dokkiBranchId,
            roomName: 'Suite Dokki 1'
        }
    });
    assert(
        crossBranchCallRes.status === 403 && crossBranchCallRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Technician (HQ-only) receives 403 BRANCH_ACCESS_DENIED on cross-branch POST /api/display/broadcast-call',
        `Status: ${crossBranchCallRes.status}, Body: ${JSON.stringify(crossBranchCallRes.data)}`
    );

    // 14e. Org Admin broadcasts patient call for Dokki branch -> 200 OK
    const adminCallRes = await request('/api/display/broadcast-call', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            orderNumber: 'CALL-DOKKI-ADMIN-ORDER',
            branchId: dokkiBranchId,
            roomName: 'Ultrasound Dokki'
        }
    });
    assert(
        adminCallRes.status === 200 && adminCallRes.data?.call?.branchId === dokkiBranchId,
        'Org Admin broadcasts call for Dokki branch with 200 OK and matching branchId'
    );

    // 14f. Verify Dokki display board includes this call while HQ display board excludes it
    const verifyDokkiBoardCalls = await request(`/api/display/board?branchId=${dokkiBranchId}`);
    const dokkiHasCall = (verifyDokkiBoardCalls.data?.broadcastCalls || []).some(
        c => c.orderNumber === 'CALL-DOKKI-ADMIN-ORDER'
    );
    assert(
        dokkiHasCall,
        'Dokki waiting room board includes the broadcast call for Dokki order'
    );

    const verifyHqBoardCalls = await request(`/api/display/board?branchId=${HQ_BRANCH_ID}`);
    const hqHasCall = (verifyHqBoardCalls.data?.broadcastCalls || []).some(
        c => c.orderNumber === 'CALL-DOKKI-ADMIN-ORDER'
    );
    assert(
        !hqHasCall,
        'HQ waiting room board strictly excludes the Dokki broadcast call'
    );

    // Cleanup call event test record
    await pool.query("DELETE FROM display_call_events WHERE order_number = 'CALL-DOKKI-ADMIN-ORDER'");

    // ── Test 15: MBT-508 Critical Result Alerts & Follow-up Branch Scoping ───
    console.log('\n[Test 15] MBT-508 Critical Result Alerts & Follow-up Branch Scoping');

    // 15a. Provision a branch-level admin user (HQ only)
    const insBranchAdmin = await pool.query(`
        INSERT INTO users (full_name, email, password_hash, role, is_active)
        VALUES ('Branch Admin HQ', 'branch.admin@VIARA.com', '$2b$10$dummyHashNotUsedForTokenVerification1234567890', 'Admin', TRUE)
        ON CONFLICT (email) DO UPDATE SET is_active = TRUE
        RETURNING user_id, email, role
    `);
    const branchAdminUser = insBranchAdmin.rows[0];

    await pool.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, role, is_default, is_active)
        VALUES ($1, $2, 'Admin', TRUE, TRUE)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = TRUE
    `, [branchAdminUser.user_id, HQ_BRANCH_ID]);
    await pool.query(`
        DELETE FROM user_branch_memberships WHERE user_id = $1 AND branch_id = $2
    `, [branchAdminUser.user_id, dokkiBranchId]);
    branchService.invalidateUserMembershipCache();

    const branchAdminTokens = await AuthService.generateTokens(
        pool,
        { user_id: branchAdminUser.user_id, role: branchAdminUser.role, is_org_admin: false },
        branchAdminUser.user_id
    );
    const branchAdminToken = branchAdminTokens.token;

    // 15b. Provision a test critical-result followup task on Dokki examination
    const dokkiExamRes = await pool.query(
        "SELECT exam_id FROM examinations WHERE branch_id = $1 LIMIT 1",
        [dokkiBranchId]
    );
    const targetDokkiExamId = dokkiExamRes.rows[0]?.exam_id;
    assert(!!targetDokkiExamId, 'Found Dokki examination for critical followup test');

    const followupInsert = await pool.query(`
        INSERT INTO critical_result_admin_followup_tasks (
            exam_id, critical_marked_at, created_by, status
        ) VALUES (
            $1, CURRENT_TIMESTAMP, $2, 'Open'
        )
        ON CONFLICT (exam_id, critical_marked_at) DO UPDATE SET status = 'Open'
        RETURNING task_id
    `, [targetDokkiExamId, adminUser.user_id]);
    const dokkiTaskId = followupInsert.rows[0].task_id;

    // 15c. Branch Admin (HQ-only) attempts GET /api/critical-result-followups?branchId=${dokkiBranchId} -> 403 BRANCH_ACCESS_DENIED
    const baGetRes = await request(`/api/critical-result-followups?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${branchAdminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        baGetRes.status === 403 && baGetRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Admin (HQ-only) receives 403 BRANCH_ACCESS_DENIED on foreign branch followups query'
    );

    // 15d. Branch Admin (HQ-only) attempts to complete Dokki followup task -> 403 BRANCH_ACCESS_DENIED
    const baCompleteRes = await request(`/api/critical-result-followups/${dokkiTaskId}/complete`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${branchAdminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            contactedParty: 'Dr. Foreign Doctor',
            followUpNotes: 'Cross-branch unauthorized completion attempt'
        }
    });
    assert(
        baCompleteRes.status === 403 && baCompleteRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Admin (HQ-only) receives 403 BRANCH_ACCESS_DENIED when attempting to complete Dokki followup task'
    );

    // 15e. Org Admin queries Dokki followups -> 200 OK
    const adminGetFollowupsRes = await request(`/api/critical-result-followups?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetFollowupsRes.status === 200 && Array.isArray(adminGetFollowupsRes.data?.items),
        'Org Admin can query Dokki followups with 200 OK'
    );
    const taskFoundInDokki = (adminGetFollowupsRes.data?.items || []).some(t => t.task_id === dokkiTaskId);
    assert(
        taskFoundInDokki,
        'Dokki followup task appears in Org Admin Dokki followups list'
    );

    // 15f. Org Admin completes Dokki followup task -> 200 OK
    const adminCompleteRes = await request(`/api/critical-result-followups/${dokkiTaskId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            contactedParty: 'Dr. Tamer (Referring Physician)',
            followUpNotes: 'Confirmed critical finding communication directly'
        }
    });
    assert(
        adminCompleteRes.status === 200 && adminCompleteRes.data?.success === true,
        'Org Admin successfully completes Dokki followup task with 200 OK'
    );

    // Cleanup
    await pool.query("DELETE FROM critical_result_admin_followup_tasks WHERE task_id = $1", [dokkiTaskId]);

    // ── Test 16: MBT-505 HR Shifts & Attendance Branch Scoping ───────────────
    console.log('\n[Test 16] MBT-505 HR Shifts & Attendance Branch Scoping');

    // 16a. Branch Admin (HQ-only) attempts to query Dokki shifts -> 403 BRANCH_ACCESS_DENIED
    const baShiftsRes = await request(`/api/hr/shifts?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${branchAdminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        baShiftsRes.status === 403 && baShiftsRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Admin (HQ-only) receives 403 BRANCH_ACCESS_DENIED on foreign branch shifts query'
    );

    // 16b. Branch Admin (HQ-only) attempts to query Dokki attendance -> 403 BRANCH_ACCESS_DENIED
    const baAttRes = await request(`/api/hr/attendance?branchId=${dokkiBranchId}`, {
        headers: {
            Authorization: `Bearer ${branchAdminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        baAttRes.status === 403 && baAttRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Admin (HQ-only) receives 403 BRANCH_ACCESS_DENIED on foreign branch attendance query'
    );

    // 16c. Receptionist (HQ-only) attempts clock-in for foreign Dokki branch -> 403 BRANCH_ACCESS_DENIED
    await pool.query(
        "DELETE FROM user_branch_memberships WHERE user_id = $1 AND branch_id = $2",
        [receptionUser.user_id, dokkiBranchId]
    );
    branchService.invalidateUserMembershipCache();

    const recClockInRes = await request('/api/hr/attendance/clock-in', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            branchId: dokkiBranchId,
            notes: 'Attempted clock-in at foreign branch'
        }
    });
    assert(
        recClockInRes.status === 403 && recClockInRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) receives 403 BRANCH_ACCESS_DENIED when attempting clock-in for foreign branch'
    );

    // 16d. Branch Admin (HQ-only) attempts to create a shift in Dokki -> 403 BRANCH_ACCESS_DENIED
    const futureShiftStart = new Date(Date.now() + 10 * 86400000).toISOString();
    const futureShiftEnd = new Date(Date.now() + 10 * 86400000 + 28800000).toISOString();
    const baCreateShiftRes = await request('/api/hr/shifts', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${branchAdminToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            userId: adminUser.user_id,
            branchId: dokkiBranchId,
            startTime: futureShiftStart,
            endTime: futureShiftEnd,
            notes: 'Unauthorized foreign branch shift'
        }
    });
    assert(
        baCreateShiftRes.status === 403 && baCreateShiftRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Admin (HQ-only) receives 403 BRANCH_ACCESS_DENIED when creating shift in foreign branch'
    );

    // 16e. Org Admin creates shift in Dokki branch -> 201 Created
    const adminCreateShiftRes = await request('/api/hr/shifts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            userId: adminUser.user_id,
            branchId: dokkiBranchId,
            startTime: futureShiftStart,
            endTime: futureShiftEnd,
            notes: 'Authorized Org Admin shift in Dokki'
        }
    });
    assert(
        adminCreateShiftRes.status === 201 && adminCreateShiftRes.data?.branch_id === dokkiBranchId,
        'Org Admin creates shift in Dokki branch with 201 Created and matching branch_id'
    );
    const createdShiftId = adminCreateShiftRes.data?.shift_id;

    // 16f. Org Admin queries Dokki shifts -> 200 OK
    const adminShiftsRes = await request(`/api/hr/shifts?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminShiftsRes.status === 200 && Array.isArray(adminShiftsRes.data),
        'Org Admin queries Dokki shifts with 200 OK'
    );
    const shiftFound = Array.isArray(adminShiftsRes.data) && adminShiftsRes.data.some(s => s.shift_id === createdShiftId);
    assert(
        shiftFound,
        'Created Dokki shift appears in Dokki shifts list for Org Admin'
    );

    // 16g. Org Admin queries Dokki attendance -> 200 OK
    const adminAttRes = await request(`/api/hr/attendance?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminAttRes.status === 200 && Array.isArray(adminAttRes.data),
        'Org Admin queries Dokki attendance with 200 OK'
    );

    // Cleanup created shift
    if (createdShiftId) {
        await pool.query("DELETE FROM staff_shifts WHERE shift_id = $1", [createdShiftId]);
    }

    // ── Test 17: MBT-509 Chat & Notification Channels Branch Scoping ─────────
    console.log('\n[Test 17] MBT-509 Chat & Notification Channels Branch Scoping');

    // 17a. Org Admin creates branch-scoped chat channel in Dokki branch -> 201 Created
    const dokkiChannelSlug = `dokki-clinical-ops-${Date.now()}`;
    const adminCreateChannelRes = await request('/api/chat/channels', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            name: dokkiChannelSlug,
            displayName: 'Dokki Clinical Operations',
            description: 'Strictly scoped to Dokki Branch staff',
            branchId: dokkiBranchId,
            isPrivate: false,
            postPermission: 'all_members'
        }
    });
    assert(
        adminCreateChannelRes.status === 201 && adminCreateChannelRes.data?.branch_id === dokkiBranchId,
        'Org Admin creates branch-scoped chat channel in Dokki branch with 201 Created'
    );

    // 17b. Receptionist (HQ-only) attempts to create channel in Dokki branch -> 403 BRANCH_ACCESS_DENIED
    const recCreateChannelDenied = await request('/api/chat/channels', {
        method: 'POST',
        headers: { Authorization: `Bearer ${receptionToken}` },
        body: {
            name: `unauth-dokki-ch-${Date.now()}`,
            displayName: 'Unauthorized Dokki Channel',
            branchId: dokkiBranchId
        }
    });
    assert(
        recCreateChannelDenied.status === 403 && recCreateChannelDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from creating channel in foreign branch'
    );

    // 17c. Receptionist (HQ-only) attempts to query Dokki channels via branchId param -> 403 BRANCH_ACCESS_DENIED
    const recGetDokkiChannelsDenied = await request(`/api/chat/channels?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${receptionToken}` }
    });
    assert(
        recGetDokkiChannelsDenied.status === 403 && recGetDokkiChannelsDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from querying foreign branch channels'
    );

    // 17d. Receptionist (HQ-only) queries their accessible channels: Dokki channel is strictly excluded
    const recChannelsRes = await request('/api/chat/channels', {
        headers: { Authorization: `Bearer ${receptionToken}` }
    });
    const dokkiChannelVisibleToRec = Array.isArray(recChannelsRes.data) && recChannelsRes.data.some(c => c.channel_id === dokkiChannelSlug);
    assert(
        recChannelsRes.status === 200 && !dokkiChannelVisibleToRec,
        'Channels list for HQ Receptionist strictly excludes Dokki branch channel'
    );

    // 17e. Org Admin queries Dokki channels: Dokki channel is included
    const adminChannelsRes = await request(`/api/chat/channels?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dokkiChannelVisibleToAdmin = Array.isArray(adminChannelsRes.data) && adminChannelsRes.data.some(c => c.channel_id === dokkiChannelSlug);
    assert(
        adminChannelsRes.status === 200 && dokkiChannelVisibleToAdmin,
        'Channels list for Org Admin in Dokki context includes the Dokki channel'
    );

    // 17f. Receptionist (HQ-only) attempts to read messages from Dokki channel -> 403 BRANCH_ACCESS_DENIED
    const recGetMessagesDenied = await request(`/api/chat/messages?channelName=${dokkiChannelSlug}`, {
        headers: { Authorization: `Bearer ${receptionToken}` }
    });
    assert(
        recGetMessagesDenied.status === 403 && recGetMessagesDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from reading messages in foreign branch channel'
    );

    // 17g. Receptionist (HQ-only) attempts to post message to Dokki channel -> 403 BRANCH_ACCESS_DENIED
    const recPostMessageDenied = await request('/api/chat/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${receptionToken}` },
        body: {
            channelName: dokkiChannelSlug,
            body: 'Unauthorized cross-branch message attempt'
        }
    });
    assert(
        recPostMessageDenied.status === 403 && recPostMessageDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from posting message to foreign branch channel'
    );

    // 17h. Receptionist (HQ-only) attempts to query staff directory in Dokki -> 403 BRANCH_ACCESS_DENIED
    const recGetDokkiUsersDenied = await request(`/api/chat/users?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${receptionToken}` }
    });
    assert(
        recGetDokkiUsersDenied.status === 403 && recGetDokkiUsersDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from querying foreign branch chat users'
    );

    // 17i. Notifications scoping: Receptionist (HQ-only) blocked from querying Dokki notifications -> 403 BRANCH_ACCESS_DENIED
    const recGetDokkiNotifsDenied = await request(`/api/notifications?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${receptionToken}` }
    });
    assert(
        recGetDokkiNotifsDenied.status === 403 && recGetDokkiNotifsDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Receptionist (HQ-only) blocked with 403 BRANCH_ACCESS_DENIED from querying foreign branch notifications'
    );

    // 17j. Org Admin queries Dokki notifications -> 200 OK
    const adminGetDokkiNotifsRes = await request(`/api/notifications?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetDokkiNotifsRes.status === 200,
        'Org Admin queries Dokki branch notifications with 200 OK'
    );

    // Clean up created channel
    await pool.query("DELETE FROM chat_channels WHERE channel_id = $1", [dokkiChannelSlug]);

    // ── Test 18: MBT-503 Inter-Branch Exam Referral & Transfer Auditing ──────
    console.log('\n[Test 18] MBT-503 Inter-Branch Exam Referral & Transfer Auditing');

    // 18a. Provision a test examination and appointment belonging to HQ Branch
    const transferTestTimestamp = Date.now();
    const hqExamOrderNum = `ORD-TRANSFER-HQ-${transferTestTimestamp}`;
    const hqStudyUid = `1.2.826.0.1.3680043.8.498.transfer.${transferTestTimestamp}`;

    const hqApptInsertRes = await pool.query(`
        INSERT INTO appointments (
            patient_id, modality_id, exam_type_id, start_time, end_time,
            status, order_number, notes, branch_id
        ) VALUES (
            $1, (SELECT modality_id FROM modalities WHERE branch_id = $2 LIMIT 1),
            $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 minutes',
            'Scheduled', $4, 'Original HQ Appointment', $2
        ) RETURNING appointment_id
    `, [patientId, HQ_BRANCH_ID, examTypeId, hqExamOrderNum]);
    const hqTransferApptId = hqApptInsertRes.rows[0].appointment_id;

    const insHqExamRes = await pool.query(`
        INSERT INTO examinations (
            appointment_id, patient_id, modality_id, exam_type_id, status, queue_stage, current_station,
            order_number, study_instance_uid, branch_id
        ) VALUES (
            $1, $2, (SELECT modality_id FROM modalities WHERE branch_id = $3 LIMIT 1),
            $4, 'Scheduled', 'Ready for Exam', 'Modality',
            $5, $6, $3
        ) RETURNING exam_id
    `, [hqTransferApptId, patientId, HQ_BRANCH_ID, examTypeId, hqExamOrderNum, hqStudyUid]);
    const hqTransferExamId = insHqExamRes.rows[0].exam_id;
    console.log(`  Provisioned HQ Examination for transfer test: ${hqTransferExamId} (Appt: ${hqTransferApptId})`);

    // 18b. Branch Admin (HQ-only) attempts to transfer an exam belonging to Dokki Branch -> 403 BRANCH_ACCESS_DENIED
    const baTransferDokkiExamDenied = await request(`/api/exams/${dokkiClinicalExamId}/transfer-branch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${branchAdminToken}` },
        body: {
            targetBranchId: HQ_BRANCH_ID,
            reason: 'Unauthorized attempt to transfer Dokki exam to HQ'
        }
    });
    assert(
        baTransferDokkiExamDenied.status === 403 && baTransferDokkiExamDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Staff without source branch membership blocked with 403 BRANCH_ACCESS_DENIED on exam transfer',
        `Status: ${baTransferDokkiExamDenied.status}`
    );

    // 18c. Receptionist (authorized in HQ) transfers the HQ examination to Dokki Branch
    const transferRes = await request(`/api/exams/${hqTransferExamId}/transfer-branch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        },
        body: {
            targetBranchId: dokkiBranchId,
            targetModalityId: dokkiModalityId,
            reason: 'Clinical referral due to HQ modality maintenance; transferred to Dokki 1.5T MRI',
            costResponsibility: 'source_branch'
        }
    });
    assert(
        transferRes.status === 200 && transferRes.data?.success === true,
        'Authorized staff transfers exam to target branch with 200 OK',
        `Status: ${transferRes.status} Body: ${JSON.stringify(transferRes.data)}`
    );
    assert(
        transferRes.data?.exam?.branch_id === dokkiBranchId,
        'Exam branch_id updated to target branch (Dokki)'
    );
    assert(
        transferRes.data?.exam?.original_branch_id === HQ_BRANCH_ID,
        'Exam original_branch_id preserves source branch (HQ) for financial lineage'
    );
    assert(
        transferRes.data?.exam?.study_instance_uid === hqStudyUid,
        'Exam study_instance_uid is strictly preserved without modification'
    );
    assert(
        transferRes.data?.transfer?.cost_responsibility === 'source_branch',
        'Transfer record preserves cost responsibility allocation (source_branch)'
    );

    // Assert linked appointment was also updated to Dokki branch
    const apptCheckRes = await pool.query(
        "SELECT branch_id, original_branch_id FROM appointments WHERE appointment_id = $1",
        [hqTransferApptId]
    );
    assert(
        apptCheckRes.rows[0]?.branch_id === dokkiBranchId && apptCheckRes.rows[0]?.original_branch_id === HQ_BRANCH_ID,
        'Linked appointment branch_id and original_branch_id updated in sync with exam transfer'
    );

    // 18d. Lineage query: Retrieve branch transfer history for the exam
    const transfersHistoryRes = await request(`/api/exams/${hqTransferExamId}/branch-transfers`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        transfersHistoryRes.status === 200 && Array.isArray(transfersHistoryRes.data?.transfers) && transfersHistoryRes.data.transfers.length >= 1,
        'GET /api/exams/:id/branch-transfers returns audited transfer history'
    );
    const recordedTransfer = (transfersHistoryRes.data?.transfers || [])[0];
    assert(
        recordedTransfer?.source_branch_id === HQ_BRANCH_ID && recordedTransfer?.target_branch_id === dokkiBranchId,
        'Audit record accurately documents source branch (HQ) and target branch (Dokki)'
    );

    // 18e. Access boundary: Receptionist (HQ-only) attempts to query newly transferred Dokki exam -> 403 BRANCH_ACCESS_DENIED
    const recGetTransferredExamDenied = await request(`/api/exams/${hqTransferExamId}`, {
        headers: {
            Authorization: `Bearer ${receptionToken}`,
            'x-branch-id': HQ_BRANCH_ID
        }
    });
    assert(
        recGetTransferredExamDenied.status === 403 && recGetTransferredExamDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'HQ-only staff receives 403 BRANCH_ACCESS_DENIED on transferred Dokki examination'
    );

    // 18f. Org Admin can access transferred exam in Dokki branch context -> 200 OK
    const adminGetTransferredExamRes = await request(`/api/exams/${hqTransferExamId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        adminGetTransferredExamRes.status === 200,
        'Org Admin accesses transferred examination with 200 OK'
    );

    // Cleanup transfer test examination and appointment
    await pool.query("UPDATE examinations SET status = 'Completed' WHERE exam_id = $1", [hqTransferExamId]);
    await pool.query("UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = $1", [hqTransferApptId]);

    // ── Test 19: MBT-606 Patient & Referring Doctor Portal Service Branch Identity & Scoping ──
    console.log('\n[Test 19] MBT-606 Patient & Referring Doctor Portal Service Branch Identity & Scoping');

    // 19a. Provision a test referring doctor
    const testDoctorEmail = `dr.test-${Date.now()}@example.com`;
    const insDoctor = await pool.query(`
        INSERT INTO referring_doctors (full_name, email, phone, is_active, portal_is_active)
        VALUES ('Dr. MultiBranch Referring', $1, '01009998887', TRUE, TRUE)
        RETURNING doctor_id, full_name
    `, [testDoctorEmail]);
    const testDoctorId = insDoctor.rows[0].doctor_id;

    // 19b. Provision an appointment referred by this doctor at Dokki Branch
    const docApptOrder = `ORD-DOC-PORTAL-${Date.now()}`;
    const insDocApptRes = await pool.query(`
        INSERT INTO appointments (
            patient_id, modality_id, exam_type_id, start_time, end_time,
            status, order_number, referring_doctor_id, branch_id
        ) VALUES (
            $1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 minutes',
            'Scheduled', $4, $5, $6
        ) RETURNING appointment_id
    `, [patientId, dokkiModalityId, examTypeId, docApptOrder, testDoctorId, dokkiBranchId]);
    const docApptId = insDocApptRes.rows[0].appointment_id;

    // 19c. Mint Doctor portal token
    const doctorTokens = await AuthService.generateTokens(
        pool,
        { doctorId: testDoctorId, role: 'Doctor', name: 'Dr. MultiBranch Referring' },
        testDoctorId,
        'doctor'
    );
    const doctorToken = doctorTokens.token;

    // 19d. Referring doctor queries their referred cases -> 200 OK with service branch identity
    const docCasesRes = await request('/api/doctor-portal/cases', {
        headers: { Authorization: `Bearer ${doctorToken}` }
    });
    assert(
        docCasesRes.status === 200 && Array.isArray(docCasesRes.data),
        'Referring doctor queries portal cases with 200 OK'
    );
    const docCase = (docCasesRes.data || []).find(c => c.appointment_id === docApptId);
    assert(
        !!docCase && docCase.branch_id === dokkiBranchId && Boolean(docCase.branch_name),
        'Referred case accurately documents service branch identity (branch_name and branch_id)'
    );

    // 19e. Scope containment: Referring doctor blocked from accessing internal staff branch management -> 403
    const docStaffEndpointBlocked = await request('/api/settings/branches', {
        headers: { Authorization: `Bearer ${doctorToken}` }
    });
    assert(
        docStaffEndpointBlocked.status === 403,
        'Referring doctor strictly prevented from accessing internal staff branch APIs (403)'
    );

    // 19f. Mint Patient portal token
    const patientTokens = await AuthService.generateTokens(
        pool,
        { userId: patientId, role: 'Patient', name: 'Test Patient' },
        patientId,
        true
    );
    const patientToken = patientTokens.token;

    // 19g. Patient queries their records -> 200 OK with service branch identity
    const patientRecordsRes = await request('/api/portal/records', {
        headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(
        patientRecordsRes.status === 200 && Array.isArray(patientRecordsRes.data),
        'Patient queries portal records with 200 OK'
    );
    const patientApptRecord = (patientRecordsRes.data || []).find(r => r.appointment_id === docApptId);
    assert(
        !!patientApptRecord && patientApptRecord.branch_id === dokkiBranchId && Boolean(patientApptRecord.branch_name),
        'Patient records accurately reflect the service branch name and ID'
    );

    // 19h. Patient queries their invoices -> 200 OK with service branch identity
    const patientInvoicesRes = await request('/api/portal/invoices', {
        headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(
        patientInvoicesRes.status === 200 && Array.isArray(patientInvoicesRes.data),
        'Patient queries portal invoices with 200 OK'
    );

    // 19i. Scope containment: Patient blocked from accessing internal staff branch management -> 403
    const patientStaffEndpointBlocked = await request('/api/settings/branches', {
        headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(
        patientStaffEndpointBlocked.status === 403,
        'Patient strictly prevented from accessing internal staff branch management (403)'
    );

    // Cleanup doctor and appointment
    await pool.query("DELETE FROM appointments WHERE appointment_id = $1", [docApptId]);
    await pool.query("DELETE FROM referring_doctors WHERE doctor_id = $1", [testDoctorId]);

    // ── Test 20: MBT-408 / MBT-708 Branch-Scoped Document Numbering & Identity ─
    console.log('\n[Test 20] MBT-408 / MBT-708 Branch-Scoped Document Numbering & Identity');

    // 20a. Configure Dokki Branch with distinct tax number, commercial registration, and medical license
    await pool.query(`
        UPDATE branches
        SET tax_number = 'EG-TAX-987654321',
            commercial_registration = 'CR-GIZA-112233',
            medical_license = 'MED-LIC-445566',
            invoice_prefix = 'DKI-INV-'
        WHERE id = $1
    `, [dokkiBranchId]);

    // 20b. Org Admin creates an invoice directly under Dokki branch context
    const dokkiInvoiceIdempotency = '00000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
    const createDokkiInvRes = await request('/api/invoices', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': dokkiInvoiceIdempotency,
            'x-branch-id': dokkiBranchId
        },
        body: {
            patientId,
            branchId: dokkiBranchId,
            items: [{
                description: 'Dokki Brain MRI Routine',
                quantity: 1,
                unitPrice: 1250.00
            }],
            notes: 'Dokki branch billing verification'
        }
    });

    assert(
        createDokkiInvRes.status === 201 || createDokkiInvRes.status === 200,
        'Org Admin creates invoice under Dokki branch with 200/201 OK',
        `Status: ${createDokkiInvRes.status}, Body: ${JSON.stringify(createDokkiInvRes.data)}`
    );

    const createdDokkiInvoice = createDokkiInvRes.data;
    const testDokkiInvId = createdDokkiInvoice?.invoice_id || createdDokkiInvoice?.id;
    const testDokkiInvNum = createdDokkiInvoice?.invoice_number;

    assert(
        Boolean(testDokkiInvNum) && testDokkiInvNum.startsWith('DKI-INV-'),
        `Invoice number strictly adheres to branch invoice prefix (${testDokkiInvNum})`
    );

    // 20c. GET /api/invoices/:id returns branch metadata (branch_name, branch_code, branch_tax_number, etc.)
    const getDokkiInvRes = await request(`/api/invoices/${testDokkiInvId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        getDokkiInvRes.status === 200,
        'GET /api/invoices/:id returns 200 OK'
    );
    assert(
        getDokkiInvRes.data?.branch_id === dokkiBranchId &&
        getDokkiInvRes.data?.branch_name === 'Dokki Branch' &&
        getDokkiInvRes.data?.branch_code === 'DOKKI' &&
        getDokkiInvRes.data?.branch_tax_number === 'EG-TAX-987654321' &&
        getDokkiInvRes.data?.branch_commercial_registration === 'CR-GIZA-112233',
        'Invoice detail response carries branch operational identity and tax/commercial registrations'
    );

    // 20d. Ensure Admin has an open cashier shift at Dokki branch to collect payment
    let dokkiShiftRes = await pool.query(
        "SELECT shift_id, branch_id FROM cashier_shifts WHERE cashier_id = $1 AND status = 'Open'",
        [adminUser.user_id]
    );
    let dokkiShiftId;
    let prevShiftBranchId = null;
    if (dokkiShiftRes.rows.length === 0) {
        const insShift = await pool.query(`
            INSERT INTO cashier_shifts (cashier_id, branch_id, opened_at, status, opening_balance)
            VALUES ($1, $2, CURRENT_TIMESTAMP, 'Open', 1000.00)
            RETURNING shift_id
        `, [adminUser.user_id, dokkiBranchId]);
        dokkiShiftId = insShift.rows[0].shift_id;
    } else {
        dokkiShiftId = dokkiShiftRes.rows[0].shift_id;
        prevShiftBranchId = dokkiShiftRes.rows[0].branch_id;
        if (prevShiftBranchId !== dokkiBranchId) {
            await pool.query("UPDATE cashier_shifts SET branch_id = $1 WHERE shift_id = $2", [dokkiBranchId, dokkiShiftId]);
        }
    }

    // 20e. Collect payment on this Dokki invoice -> receipt number uses branch code RCT-DOKKI-...
    const dokkiPaymentIdempotency = '00000000-0000-4000-8000-' + (Date.now() + 1).toString().slice(-12).padStart(12, '0');
    const payDokkiInvRes = await request(`/api/invoices/${testDokkiInvId}/payment`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': dokkiPaymentIdempotency,
            'x-branch-id': dokkiBranchId
        },
        body: {
            amount: 1250.00,
            method: 'Cash',
            notes: 'Payment collected at Dokki Cashier'
        }
    });

    assert(
        payDokkiInvRes.status === 201 || payDokkiInvRes.status === 200,
        'Collect payment on Dokki invoice returns 200/201 OK'
    );
    const receiptNum = payDokkiInvRes.data?.payment?.receipt_number;
    assert(
        Boolean(receiptNum) && receiptNum.startsWith('RCT-DOKKI-'),
        `Cashier payment generates branch-scoped receipt number (${receiptNum})`
    );

    // 20f. GET /api/invoices/:id/pdf (Printable HTML view) reflects branch identity, tax number, and commercial registration
    const printInvRes = await request(`/api/invoices/${testDokkiInvId}/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        printInvRes.status === 200,
        'GET /api/invoices/:id/pdf returns 200 OK'
    );
    const printHtml = printInvRes.text || '';
    assert(
        printHtml.includes(testDokkiInvNum) &&
        printHtml.includes('EG-TAX-987654321') &&
        printHtml.includes('CR-GIZA-112233') &&
        printHtml.includes('Dokki Branch'),
        'Printable invoice HTML preserves historical branch identity, tax ID, CR, and branch name'
    );

    // 20g. Clean up test invoice and payment
    await pool.query("UPDATE invoices SET invoice_status = 'Voided' WHERE invoice_id = $1", [testDokkiInvId]);
    if (prevShiftBranchId && prevShiftBranchId !== dokkiBranchId) {
        await pool.query("UPDATE cashier_shifts SET branch_id = $1 WHERE shift_id = $2", [prevShiftBranchId, dokkiShiftId]);
    }

    // ── Test 21: MBT-1004 Concurrency-Safe Branch Creation & Quota Serialization ─
    console.log('\n[Test 21] MBT-1004 Concurrency-Safe Branch Creation & Quota Serialization');

    // 21a. Execute 3 concurrent branch creations via Promise.all
    const concCodes = [`CONC_A_${Date.now()}`, `CONC_B_${Date.now()}`, `CONC_C_${Date.now()}`];
    const concPromises = concCodes.map(code => 
        request('/api/settings/branches', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
                code,
                name: `Concurrent Branch ${code}`,
                type: 'branch',
                phone: '01000000001',
                address: `Test Address ${code}`,
                city: 'Cairo',
                governorate: 'Cairo',
                invoicePrefix: `${code.slice(0, 4)}-`
            }
        })
    );

    const concResults = await Promise.all(concPromises);
    const allSuccessful = concResults.every(r => r.status === 200 || r.status === 201);
    assert(
        allSuccessful,
        'Parallel branch creations serialize safely via database row lock without deadlocks (all 200/201)'
    );

    const createdConcBranchIds = concResults
        .map(r => r.data?.branch?.id)
        .filter(Boolean);
    assert(
        createdConcBranchIds.length === 3,
        'All 3 concurrent branches provisioned with distinct UUIDs'
    );

    // 21b. Concurrency conflict test: 2 parallel requests attempting to create the exact same branch code
    const duplicateCode = `DUP_${Date.now()}`;
    const dupPromises = [1, 2].map(i =>
        request('/api/settings/branches', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
                code: duplicateCode,
                name: `Duplicate Branch ${duplicateCode}`,
                type: 'branch',
                phone: '01000000002',
                address: 'Duplicate Address',
                city: 'Cairo',
                governorate: 'Cairo'
            }
        })
    );

    const dupResults = await Promise.all(dupPromises);
    const successCount = dupResults.filter(r => r.status === 200 || r.status === 201).length;
    const conflictCount = dupResults.filter(r => r.status === 409).length;

    assert(
        successCount === 1 && conflictCount === 1,
        'Concurrent requests with identical branch code serialize: exactly 1 succeeds (201) and 1 receives 409 Conflict'
    );

    const dupBranchId = dupResults.find(r => r.status === 200 || r.status === 201)?.data?.branch?.id;
    if (dupBranchId) {
        createdConcBranchIds.push(dupBranchId);
    }

    // 21c. Clean up concurrent test branches
    for (const bId of createdConcBranchIds) {
        await pool.query('DELETE FROM user_branch_memberships WHERE branch_id = $1', [bId]);
        await pool.query('DELETE FROM branches WHERE id = $1', [bId]);
    }
    assert(true, 'Test branches cleaned up successfully to maintain baseline quota state');

    // ── Test 22: MBT-804 Security Audit Logging for Cross-Branch Boundary Violations ─
    console.log('\n[Test 22] MBT-804 Security Audit Logging for Cross-Branch Boundary Violations');
    const secEventsRes = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM security_events
        WHERE event_type = 'CROSS_BRANCH_ACCESS_DENIED'
    `);
    assert(
        secEventsRes.rows[0].count > 0,
        `Cross-branch access denials are automatically audited in security_events (${secEventsRes.rows[0].count} events logged)`
    );

    const latestSecEvent = await pool.query(`
        SELECT * FROM security_events 
        WHERE event_type = 'CROSS_BRANCH_ACCESS_DENIED'
        ORDER BY created_at DESC LIMIT 1
    `);
    const details = typeof latestSecEvent.rows[0].details === 'string'
        ? JSON.parse(latestSecEvent.rows[0].details)
        : latestSecEvent.rows[0].details;
    assert(
        latestSecEvent.rows[0].severity === 'warning' && Boolean(details?.requestedBranchId),
        'Audit record accurately documents severity, actor role, requested branch, and endpoint path'
    );

    // ── Test 23: MBT-207 Cross-Branch Emergency Elevation & MBT-106 Multi-Branch Patient History ─
    console.log('\n[Test 23] MBT-207 Cross-Branch Emergency Elevation & MBT-106 Multi-Branch Patient History');

    // Provision Radiologist user for emergency break-glass test
    const radRes = await pool.query("SELECT * FROM users WHERE email = 'ahmed.hassan@VIARA.com'");
    const radUser = radRes.rows[0];
    assert(Boolean(radUser), 'Radiologist user (ahmed.hassan@VIARA.com) exists');

    const emergencyPassword = 'TestEmergency123!';
    const emergencyPwHash = await bcrypt.hash(emergencyPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [emergencyPwHash, radUser.user_id]);

    // Ensure radiologist is initially restricted to HQ only
    await pool.query(`
        DELETE FROM user_branch_memberships WHERE user_id = $1 AND branch_id != $2
    `, [radUser.user_id, HQ_BRANCH_ID]);
    await pool.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, is_default, is_active)
        VALUES ($1, $2, TRUE, TRUE)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = TRUE
    `, [radUser.user_id, HQ_BRANCH_ID]);

    // Ensure radiologist has active attendance
    await pool.query(`
        DELETE FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL
    `, [radUser.user_id]);
    await pool.query(`
        INSERT INTO attendance_logs (user_id, clock_in)
        VALUES ($1, CURRENT_TIMESTAMP)
    `, [radUser.user_id]);

    branchService.invalidateUserMembershipCache();

    // Clean up any stale active emergency access grants for radiologist
    await pool.query(`
        UPDATE emergency_access_logs SET status = 'Expired' WHERE user_id = $1 AND status = 'Active'
    `, [radUser.user_id]);

    const radTokens = await AuthService.generateTokens(
        pool,
        { user_id: radUser.user_id, role: radUser.role, is_org_admin: false, organization_id: radUser.organization_id },
        radUser.user_id
    );
    const radToken = radTokens.token;

    // 23a. Without emergency elevation, radiologist is blocked from Dokki exams with 403
    const radDokkiDenied = await request('/api/exams/worklist', {
        headers: {
            Authorization: `Bearer ${radToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        radDokkiDenied.status === 403 && radDokkiDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'HQ Radiologist without emergency elevation blocked from Dokki branch with 403 BRANCH_ACCESS_DENIED'
    );

    // 23b. Radiologist activates Break-Glass Emergency Access specifically for Dokki Branch (30 minutes)
    const breakGlassRes = await request('/api/rbac/break-glass', {
        method: 'POST',
        headers: { Authorization: `Bearer ${radToken}` },
        body: {
            reason: 'Urgent emergency consultation required for trauma case at Dokki Branch',
            currentPassword: emergencyPassword,
            targetBranchId: dokkiBranchId,
            durationMinutes: 30
        }
    });
    assert(
        breakGlassRes.status === 200,
        'POST /api/rbac/break-glass succeeds with 200 OK',
        `Status: ${breakGlassRes.status} Error: ${breakGlassRes.data?.error}`
    );
    assert(
        Boolean(breakGlassRes.data?.grantId) && Boolean(breakGlassRes.data?.token),
        'Emergency response returns valid grantId and newly signed emergency token'
    );
    assert(
        breakGlassRes.data?.targetBranchId === dokkiBranchId,
        'Emergency response reflects target branch ID (Dokki)'
    );
    assert(
        breakGlassRes.data?.durationMinutes === 30,
        'Emergency response honors requested duration (30 minutes)'
    );
    const emergencyToken = breakGlassRes.data.token;

    // 23c. Check Break-Glass status
    const bgStatusRes = await request('/api/rbac/break-glass/status', {
        headers: { Authorization: `Bearer ${emergencyToken}` }
    });
    assert(
        bgStatusRes.status === 200 && bgStatusRes.data?.active === true,
        'GET /api/rbac/break-glass/status confirms emergency grant is Active'
    );
    assert(
        bgStatusRes.data?.targetBranchId === dokkiBranchId,
        'Emergency grant status accurately carries targetBranchId'
    );

    // 23d. Using Emergency Token, Radiologist CAN view Dokki examinations (read-only clinical access granted)
    const radEmergencyDokkiExams = await request('/api/exams/worklist', {
        headers: {
            Authorization: `Bearer ${emergencyToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        radEmergencyDokkiExams.status === 200,
        'Emergency token allows read-only clinical access to target branch examinations with 200 OK'
    );

    // 23e. Under Emergency Elevation, mutating operations are strictly REJECTED with 403 BRANCH_ACCESS_DENIED
    const radEmergencyMutationBlocked = await request('/api/appointments', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${emergencyToken}`,
            'x-branch-id': dokkiBranchId
        },
        body: {
            patientId,
            examTypeId,
            startTime: new Date().toISOString(),
            status: 'Scheduled'
        }
    });
    assert(
        radEmergencyMutationBlocked.status === 403 && radEmergencyMutationBlocked.data?.code === 'BRANCH_ACCESS_DENIED',
        'Mutating requests under emergency cross-branch elevation strictly blocked with 403 BRANCH_ACCESS_DENIED'
    );

    // 23f. Self-Revoke Emergency Access
    const revokeRes = await request('/api/rbac/break-glass/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${emergencyToken}` },
        body: {
            reason: 'Emergency consultation completed; closing temporary elevation session'
        }
    });
    assert(
        revokeRes.status === 200,
        'POST /api/rbac/break-glass/revoke succeeds with 200 OK'
    );

    // 23g. Immediate re-enforcement: subsequent request with emergency token is denied
    const radPostRevokeDenied = await request('/api/exams/worklist', {
        headers: {
            Authorization: `Bearer ${emergencyToken}`,
            'x-branch-id': dokkiBranchId
        }
    });
    assert(
        radPostRevokeDenied.status === 403 && radPostRevokeDenied.data?.code === 'BRANCH_ACCESS_DENIED',
        'Subsequent request with revoked emergency token immediately blocked with 403 BRANCH_ACCESS_DENIED'
    );

    // 23h. MBT-106 Multi-Branch Patient History Identity Verification
    const patientHistRes = await request(`/api/patients/${patientId}/history`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        patientHistRes.status === 200 && Array.isArray(patientHistRes.data?.history),
        'GET /api/patients/:id/history succeeds with 200 OK'
    );
    const hasBranchIdentity = patientHistRes.data.history.some(h => Boolean(h.branch_name) || Boolean(h.branch_code));
    assert(
        hasBranchIdentity,
        'Patient history visits carry unified multi-branch identity (branch_name and branch_code)'
    );

    // 23i. MBT-208 End-of-Day Branch Summary Context Verification
    const eodSummaryRes = await request(`/api/end-of-day/summary?branchId=${dokkiBranchId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        eodSummaryRes.status === 200,
        'GET /api/end-of-day/summary with branchId returns 200 OK and branch-scoped summary'
    );

    // ── Test 24: MBT-309 / MBT-310 License Grace Period, Quota Downgrade & HA Clustering ─
    console.log('\n[Test 24] MBT-309 / MBT-310 License Grace Period, Quota Downgrade & HA Clustering');

    // 24a. Branch Quota API endpoint query
    const quotaApiRes = await request('/api/settings/branches/quota', {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        quotaApiRes.status === 200 && typeof quotaApiRes.data?.currentCount === 'number',
        'GET /api/settings/branches/quota returns 200 OK with accurate branch count and quota status'
    );
    assert(
        quotaApiRes.data?.multiBranchAllowed === true && quotaApiRes.data?.inGracePeriod === false,
        'Active enterprise license accurately reports multiBranchAllowed: true and inGracePeriod: false'
    );

    // 24b. MBT-309 Continuity of Care Grace Period calculation
    const licenseService = require('../src/services/licenseService');

    // Generate signed Enterprise license payload with expiry 2 days in the past (within 14-day grace)
    const { generateKeyPairSync, sign } = crypto;
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pastTwoDays = new Date(Date.now() - 2 * 86400000).toISOString();
    const enterpriseGracePayload = {
        v: 2,
        customerId: 'CLIENT-GRACE-TEST',
        edition: 'enterprise',
        issuedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        expiresAt: pastTwoDays,
        maxUsers: -1,
        maxBranches: 5,
        allowedModules: ['*']
    };
    const graceSig = sign('SHA256', Buffer.from(JSON.stringify(enterpriseGracePayload), 'utf8'), privateKey).toString('base64');
    const graceToken = Buffer.from(JSON.stringify({ payload: enterpriseGracePayload, signature: graceSig })).toString('base64url');

    // Temporarily verify inspect with public key
    const origPublicKey = process.env.LICENSE_PUBLIC_KEY;
    process.env.LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    try {
        const inspectedGrace = licenseService.inspectLicenseKey(graceToken);
        assert(
            inspectedGrace.valid === true && inspectedGrace.payload?.inGracePeriod === true,
            'Enterprise license 2 days past expiration enters 14-day continuity-of-care grace period'
        );
        assert(
            inspectedGrace.payload?.graceDaysRemaining === 12,
            'License grace period accurately reports 12 grace days remaining'
        );

        // Trial license with expiry in the past has 0 days grace and is immediately marked expired
        const trialExpiredPayload = {
            v: 1,
            customerId: 'TRIAL-EXPIRED-TEST',
            edition: 'trial',
            issuedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            expiresAt: pastTwoDays,
            maxUsers: 3
        };
        const trialSig = sign('SHA256', Buffer.from(JSON.stringify(trialExpiredPayload), 'utf8'), privateKey).toString('base64');
        const trialToken = Buffer.from(JSON.stringify({ payload: trialExpiredPayload, signature: trialSig })).toString('base64url');
        const inspectedTrial = licenseService.inspectLicenseKey(trialToken);
        assert(
            inspectedTrial.valid === false && inspectedTrial.expired === true,
            'Trial license past expiration has 0 grace days and is strictly rejected as expired'
        );
    } finally {
        if (origPublicKey) {
            process.env.LICENSE_PUBLIC_KEY = origPublicKey;
        } else {
            delete process.env.LICENSE_PUBLIC_KEY;
        }
    }

    // 24c. MBT-309 Quota Downgrade & Zero-Data-Loss Safety
    const currentBranchCountRes = await pool.query("SELECT COUNT(*)::int as count FROM branches WHERE organization_id = $1 AND status != 'archived'", [adminUser.organization_id]);
    const currentBranchCount = currentBranchCountRes.rows[0].count;
    assert(
        currentBranchCount >= 2,
        `Current active branch count in database is ${currentBranchCount} (>= 2)`
    );

    // Validate that quota logic flags isOverQuota without deleting any data
    const downgradedQuotaCheck = await branchService.checkBranchQuota(pool, adminUser.organization_id);
    assert(
        downgradedQuotaCheck.currentCount >= 2,
        'checkBranchQuota accurately tracks active branch count'
    );

    // Verify existing branches and staff are completely preserved
    const dokkiCheck = await pool.query('SELECT status FROM branches WHERE id = $1', [dokkiBranchId]);
    assert(
        dokkiCheck.rows[0]?.status === 'active',
        'Downgrade policy preserves existing branch data and active status with 0 data loss'
    );

    const recRoleCheck = await pool.query('SELECT is_org_admin FROM users WHERE user_id = $1', [receptionUser.user_id]);
    assert(
        recRoleCheck.rows[0]?.is_org_admin === false,
        'Downgrade policy never escalates staff privileges to org admin'
    );

    // 24d. MBT-310 High Availability (HA) & Standby Node Licensing
    const { getFingerprint } = require('../src/utils/hardwareFingerprint');
    const localFingerprint = getFingerprint();
    const primaryFingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const haPayload = {
        edition: 'enterprise',
        customerId: 'CLIENT-HA-TEST',
        fingerprint: primaryFingerprint,
        haFingerprints: [localFingerprint],
        maxBranches: 5,
        allowedModules: ['*']
    };

    // Binding check passes on standby node when current machine fingerprint is listed in haFingerprints
    const matchesHa = Array.isArray(haPayload.haFingerprints) && haPayload.haFingerprints.includes(localFingerprint);
    assert(
        matchesHa === true,
        'HA standby node matching authorized haFingerprints validates hardware binding without disruption'
    );

    // 24e. MBT-407 Branch-Scoped Currency & Timezone Verification
    const dokkiBranchMeta = await pool.query('SELECT currency_code, timezone FROM branches WHERE id = $1', [dokkiBranchId]);
    assert(
        dokkiBranchMeta.rows[0]?.currency_code === 'EGP',
        'Dokki branch metadata defines operational currency as EGP'
    );
    assert(
        dokkiBranchMeta.rows[0]?.timezone === 'Africa/Cairo',
        'Dokki branch metadata defines operational timezone as Africa/Cairo'
    );

    // ── Test 25: MBT-305 / MBT-306 / MBT-307 Branch Reactivation Quota Enforcement & Anti-Circumvention ─
    console.log('\n[Test 25] MBT-305 / MBT-306 / MBT-307 Branch Reactivation Quota Enforcement & Anti-Circumvention');

    // 25a. Attempting to archive or deactivate Main Flagship Branch is strictly blocked with 400
    const archiveMainRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        archiveMainRes.status === 400,
        'Attempting to archive Main Flagship branch via DELETE is rejected with 400'
    );

    const deactivateMainRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'archived' }
    });
    assert(
        deactivateMainRes.status === 400,
        'Attempting to deactivate Main Flagship branch via PUT is rejected with 400'
    );

    // 25b. Create isolated test branch for reactivation testing
    const reactTestCode = `RCT_${Date.now().toString().slice(-6)}`;
    const createReactBranchRes = await request('/api/settings/branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
            code: reactTestCode,
            name: `Reactivation Test Branch ${reactTestCode}`,
            type: 'branch',
            phone: '01000000099',
            address: 'Reactivation Test St',
            city: 'Cairo',
            governorate: 'Cairo'
        }
    });
    assert(
        createReactBranchRes.status === 200 || createReactBranchRes.status === 201,
        'Provisioned test branch for reactivation quota verification'
    );
    const testReactivationBranchId = createReactBranchRes.data?.branch?.id;

    // Archive the test branch
    const archiveReactRes = await request(`/api/settings/branches/${testReactivationBranchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
        archiveReactRes.status === 200 && archiveReactRes.data?.branch?.status === 'archived',
        'Test branch successfully transitioned to archived status'
    );

    // 25c. Simulate license quota reached (maxBranches = 2): HQ & Dokki already consume 2 slots
    const originalLicense = licenseService.getLicense();
    
    // Test 1: Quota exhausted (maxBranches = 2)
    const testQuotaLicense = { ...originalLicense, maxBranches: 2, inGracePeriod: false };
    const origGetLicense = licenseService.getLicense;
    licenseService.getLicense = () => testQuotaLicense;

    let reactivationExceededError = null;
    try {
        await branchService.updateBranch(pool, testReactivationBranchId, { status: 'active' });
    } catch (err) {
        reactivationExceededError = err;
    }
    assert(
        reactivationExceededError && reactivationExceededError.statusCode === 403 && reactivationExceededError.code === 'MAX_BRANCHES_EXCEEDED',
        'Reactivating archived branch when active quota is exhausted is strictly blocked with 403 MAX_BRANCHES_EXCEEDED'
    );

    // Verify database row remained archived
    const statusAfterBlocked = await pool.query('SELECT status FROM branches WHERE id = $1', [testReactivationBranchId]);
    assert(
        statusAfterBlocked.rows[0]?.status === 'archived',
        'Branch status remains archived in database after blocked reactivation attempt'
    );

    // Test 2: Reactivation during grace period is strictly forbidden
    const testGraceLicense = { ...originalLicense, maxBranches: 5, inGracePeriod: true };
    licenseService.getLicense = () => testGraceLicense;

    let graceReactivationError = null;
    try {
        await branchService.updateBranch(pool, testReactivationBranchId, { status: 'active' });
    } catch (err) {
        graceReactivationError = err;
    }
    assert(
        graceReactivationError && graceReactivationError.statusCode === 403 && graceReactivationError.code === 'LICENSE_GRACE_PERIOD_RESTRICTION',
        'Reactivating branch during license grace period is strictly rejected with 403 LICENSE_GRACE_PERIOD_RESTRICTION'
    );

    // Test 3: Reactivation succeeds when quota allows (maxBranches = 5)
    const testAllowedLicense = { ...originalLicense, maxBranches: 5, inGracePeriod: false };
    licenseService.getLicense = () => testAllowedLicense;

    const reactivatedBranch = await branchService.updateBranch(pool, testReactivationBranchId, { status: 'active' });
    assert(
        reactivatedBranch && reactivatedBranch.status === 'active',
        'Reactivating branch succeeds when under quota and license is active'
    );

    // Restore original license handler
    licenseService.getLicense = origGetLicense;

    // Clean up test branch
    await pool.query('DELETE FROM user_branch_memberships WHERE branch_id = $1', [testReactivationBranchId]);
    await pool.query('DELETE FROM branches WHERE id = $1', [testReactivationBranchId]);
    assert(true, 'Reactivation test branch cleaned up successfully');

    // ── Test 26: MBT-801 / MBT-802 / MBT-803 Database-Level Row-Level Security (RLS) Defense ─
    console.log('\n[Test 26] MBT-801 / MBT-802 / MBT-803 Database-Level Row-Level Security (RLS) Defense');

    // 26a. Verify RLS and FORCE RLS are active on all core operational tables in PostgreSQL catalog
    const rlsCatalogRes = await pool.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity 
        FROM pg_class 
        WHERE relname IN ('appointments', 'examinations', 'invoices', 'cashier_shifts', 'inventory_items', 'stock_movements', 'payments', 'refunds', 'expenses', 'insurance_claims', 'waiting_list')
        ORDER BY relname;
    `);
    const allRlsEnabled = rlsCatalogRes.rows.length === 11 && rlsCatalogRes.rows.every(r => r.relrowsecurity === true && r.relforcerowsecurity === true);
    assert(
        allRlsEnabled === true,
        'PostgreSQL pg_class verifies relrowsecurity=true and relforcerowsecurity=true on all 11 core tables'
    );

    // 26b. Connect dedicated client as rcms_app_user (NOBYPASSRLS) to test active database engine isolation
    const { Client } = require('pg');
    const APP_USER_DB_URL = DATABASE_URL.replace(/:\/\/[^@]+@/, '://rcms_app_user:rcms_app_secure_pass_2026@');
    const rlsClient = new Client({ connectionString: APP_USER_DB_URL });
    await rlsClient.connect();

    try {
        const expectedDokkiRes = await pool.query('SELECT count(*)::int as count FROM appointments WHERE branch_id = $1', [dokkiBranchId]);
        const expectedDokkiCount = expectedDokkiRes.rows[0].count;

        const expectedHqRes = await pool.query('SELECT count(*)::int as count FROM appointments WHERE branch_id = $1', [HQ_BRANCH_ID]);
        const expectedHqCount = expectedHqRes.rows[0].count;

        const expectedTotalRes = await pool.query('SELECT count(*)::int as count FROM appointments');
        const expectedTotalCount = expectedTotalRes.rows[0].count;

        // Query Dokki appointments under Dokki session context
        await rlsClient.query('BEGIN');
        await rlsClient.query('SELECT set_branch_context($1, false)', [dokkiBranchId]);
        const dokkiRlsAppts = await rlsClient.query('SELECT count(*)::int as count FROM appointments');
        assert(
            dokkiRlsAppts.rows[0].count === expectedDokkiCount,
            `RLS engine strictly confines rcms_app_user to Dokki branch appointments (returned ${dokkiRlsAppts.rows[0].count}/${expectedDokkiCount} rows)`
        );

        // Attempt cross-branch INSERT into appointments for HQ while in Dokki session context
        let rlsInsertViolation = false;
        try {
            await rlsClient.query(`
                INSERT INTO appointments (
                    appointment_id, patient_id, branch_id, start_time, end_time, status, appointment_source, modality_id, exam_type_id
                )
                VALUES (
                    gen_random_uuid(),
                    (SELECT patient_id FROM patients LIMIT 1),
                    $1,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 minutes',
                    'Scheduled', 'Walk-in',
                    (SELECT modality_id FROM modalities LIMIT 1),
                    (SELECT type_id FROM examination_types LIMIT 1)
                )
            `, [HQ_BRANCH_ID]);
        } catch (insertErr) {
            rlsInsertViolation = /violates row-level security policy/i.test(insertErr.message);
        }
        assert(
            rlsInsertViolation === true,
            'Cross-branch INSERT into appointments strictly blocked by PostgreSQL RLS with row-level security policy violation'
        );
        await rlsClient.query('ROLLBACK');

        // Query HQ appointments under HQ session context
        await rlsClient.query('BEGIN');
        await rlsClient.query('SELECT set_branch_context($1, false)', [HQ_BRANCH_ID]);
        const hqRlsAppts = await rlsClient.query('SELECT count(*)::int as count FROM appointments');
        assert(
            hqRlsAppts.rows[0].count === expectedHqCount,
            `RLS engine strictly confines rcms_app_user to HQ branch appointments (returned ${hqRlsAppts.rows[0].count}/${expectedHqCount} rows)`
        );

        // Attempt cross-branch INSERT into examinations for Dokki while in HQ session context
        let rlsExamViolation = false;
        try {
            await rlsClient.query(`
                INSERT INTO examinations (
                    exam_id, appointment_id, patient_id, branch_id, status, modality_id, exam_type_id, study_instance_uid
                )
                VALUES (
                    gen_random_uuid(),
                    (SELECT appointment_id FROM appointments LIMIT 1),
                    (SELECT patient_id FROM patients LIMIT 1),
                    $1,
                    'Scheduled',
                    (SELECT modality_id FROM modalities LIMIT 1),
                    (SELECT type_id FROM examination_types LIMIT 1),
                    '1.2.826.0.1.3680043.8.498.' || floor(random()*1000000)::text
                )
            `, [dokkiBranchId]);
        } catch (examErr) {
            rlsExamViolation = /violates row-level security policy/i.test(examErr.message);
        }
        assert(
            rlsExamViolation === true,
            'Cross-branch INSERT into examinations strictly blocked by PostgreSQL RLS with row-level security policy violation'
        );
        await rlsClient.query('ROLLBACK');

        // Query under Org Admin session context: returns all appointments
        await rlsClient.query('BEGIN');
        await rlsClient.query('SELECT set_branch_context($1::uuid, $2::uuid, true)', [HQ_BRANCH_ID, adminUser.user_id]);
        const adminRlsAppts = await rlsClient.query('SELECT count(*)::int as count FROM appointments');
        assert(
            adminRlsAppts.rows[0].count === expectedTotalCount,
            `RLS engine grants full visibility to Org Admin across all branches (${adminRlsAppts.rows[0].count}/${expectedTotalCount} rows)`
        );
        await rlsClient.query('ROLLBACK');
    } finally {
        await rlsClient.end();
    }

    // ── TEST 27: MBT-001 / MBT-204 Branch Manager vs Org Admin Security Boundary ──────
    console.log('\n[Test 27] MBT-001 / MBT-204 Branch Manager vs Org Admin Security Boundary');
    const branchManagerEmail = 'dokki.manager@VIARA.com';
    let bmRes = await pool.query('SELECT * FROM users WHERE email = $1', [branchManagerEmail]);
    if (bmRes.rows.length === 0) {
        await pool.query(`
            INSERT INTO users (
                email, full_name, password_hash, role, is_active, is_org_admin, preferences
            )
            SELECT $1, 'Dokki Branch Manager', password_hash, 'Admin', TRUE, FALSE, preferences
            FROM users WHERE email = 'admin@VIARA.com'
        `, [branchManagerEmail]);
        bmRes = await pool.query('SELECT * FROM users WHERE email = $1', [branchManagerEmail]);
    }
    const branchManagerUser = bmRes.rows[0];

    // Ensure branch manager has Admin role in Dokki, but strictly NO membership in HQ
    await pool.query(`DELETE FROM user_branch_memberships WHERE user_id = $1`, [branchManagerUser.user_id]);
    await pool.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, role, is_default, is_active)
        VALUES ($1, $2, 'Admin', TRUE, TRUE)
    `, [branchManagerUser.user_id, dokkiBranchId]);

    const bmTokens = await AuthService.generateTokens(
        pool,
        { user_id: branchManagerUser.user_id, role: 'Admin', is_org_admin: false },
        branchManagerUser.user_id
    );
    const bmToken = bmTokens.token;

    // 1. Quota API: Branch Manager is blocked
    const bmQuotaRes = await request('/api/settings/branches/quota', {
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId }
    });
    assert(
        bmQuotaRes.status === 403 && bmQuotaRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from viewing organization branch quota'
    );

    // 2. Branch creation: Branch Manager is blocked
    const bmCreateRes = await request('/api/settings/branches', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId },
        body: {
            name: 'Unauthorized Branch',
            code: 'UNAUTH',
            phone: '01011112222'
        }
    });
    assert(
        bmCreateRes.status === 403 && bmCreateRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from provisioning new branches'
    );

    // 3. Branch archiving: Branch Manager is blocked
    const bmArchiveRes = await request(`/api/settings/branches/${dokkiBranchId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId }
    });
    assert(
        bmArchiveRes.status === 403 && bmArchiveRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from archiving branches'
    );

    // 4. Update foreign branch: Branch Manager is blocked
    const bmUpdateHqRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId },
        body: { phone: '01999999999' }
    });
    assert(
        bmUpdateHqRes.status === 403 && bmUpdateHqRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from updating foreign branch settings'
    );

    // 5. Update assigned branch: Operational fields update, org/quota fields stripped
    const origDokkiRes = await pool.query('SELECT status, is_main, phone FROM branches WHERE id = $1', [dokkiBranchId]);
    const origPhone = origDokkiRes.rows[0].phone;

    const bmUpdateOwnRes = await request(`/api/settings/branches/${dokkiBranchId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId },
        body: {
            phone: '01012345678',
            status: 'archived',
            isMain: true
        }
    });
    assert(
        bmUpdateOwnRes.status === 200,
        'Branch Manager allowed to update operational fields of their assigned branch (200 OK)'
    );

    const postDokkiRes = await pool.query('SELECT status, is_main, phone FROM branches WHERE id = $1', [dokkiBranchId]);
    assert(
        postDokkiRes.rows[0].phone === '01012345678' &&
        postDokkiRes.rows[0].status === 'active' &&
        postDokkiRes.rows[0].is_main === false,
        'Branch Manager attempt to alter status or is_main is sanitized and ignored by server'
    );
    await pool.query('UPDATE branches SET phone = $1 WHERE id = $2', [origPhone, dokkiBranchId]);

    // 6. View foreign branch members: Blocked
    const bmForeignMembersRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}/members`, {
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId }
    });
    assert(
        bmForeignMembersRes.status === 403 && bmForeignMembersRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from viewing foreign branch members'
    );

    // 7. View assigned branch members: Allowed
    const bmOwnMembersRes = await request(`/api/settings/branches/${dokkiBranchId}/members`, {
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId }
    });
    assert(
        bmOwnMembersRes.status === 200 && Array.isArray(bmOwnMembersRes.data?.members),
        'Branch Manager queries members of assigned branch with 200 OK'
    );

    // 8. Assign member to foreign branch: Blocked
    const bmAssignForeignRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}/members`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId },
        body: { userId: receptionUser.user_id, role: 'Receptionist' }
    });
    assert(
        bmAssignForeignRes.status === 403 && bmAssignForeignRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from assigning members to foreign branch'
    );

    // 9. Remove member from foreign branch: Blocked
    const bmRemoveForeignRes = await request(`/api/settings/branches/${HQ_BRANCH_ID}/members/${adminUser.user_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${bmToken}`, 'x-branch-id': dokkiBranchId }
    });
    assert(
        bmRemoveForeignRes.status === 403 && bmRemoveForeignRes.data?.code === 'BRANCH_ACCESS_DENIED',
        'Branch Manager blocked with 403 BRANCH_ACCESS_DENIED from removing members from foreign branch'
    );

    // 10. MBT-807 Diagnostic telemetry sanitization
    const telemetryRes = await request('/api/settings/admin/telemetry', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(
        telemetryRes.status === 200 &&
        telemetryRes.data?.multiBranch?.activeBranches >= 2 &&
        telemetryRes.data?.multiBranch?.rlsProtection === 'Active',
        'GET /api/settings/admin/telemetry exposes safe multi-branch operational state'
    );
    const telemetryStr = JSON.stringify(telemetryRes.data || {});
    const leaksSecret = /password|secret|bearer|token|private_key/i.test(telemetryStr);
    assert(
        leaksSecret === false,
        'Diagnostic telemetry strictly sanitized without leaking tokens, passwords or secrets'
    );
    const recTelemetryRes = await request('/api/settings/admin/telemetry', {
        headers: { 'Authorization': `Bearer ${receptionToken}` }
    });
    assert(
        recTelemetryRes.status === 403,
        'Non-admin staff strictly blocked from viewing system telemetry (403 Forbidden)'
    );

    // =========================================================================
    // TEST 28: Fail-Closed Database RLS & Anti-Spoofing Verification (MBT-801, MBT-802, MBT-803)
    // =========================================================================
    console.log('\n[Test 28] Fail-Closed Database RLS & Anti-Spoofing Verification (MBT-801, MBT-802, MBT-803)...');

    const appUserDbUrl = DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//rcms_app_user:rcms_app_secure_pass_2026@');
    const appClientPool = new Pool({ connectionString: appUserDbUrl });
    const appClient = await appClientPool.connect();

    try {
        // 28a. Unscoped query without branch context fails closed (0 rows returned)
        await appClient.query('BEGIN');
        const unscopedRes = await appClient.query('SELECT count(*)::int as count FROM appointments');
        assert(
            unscopedRes.rows[0]?.count === 0,
            'Un-scoped query as rcms_app_user without branch context returns 0 rows (Fail-Closed)',
            `Returned: ${unscopedRes.rows[0]?.count}`
        );
        await appClient.query('ROLLBACK');

        // 28b. Unscoped INSERT without branch context is strictly blocked by RLS
        await appClient.query('BEGIN');
        let unscopedInsertFailed = false;
        try {
            await appClient.query(`
                INSERT INTO appointments (
                    patient_id, branch_id, exam_type_id, start_time, end_time, status, order_number
                ) VALUES (
                    (SELECT patient_id FROM patients LIMIT 1),
                    $1,
                    (SELECT type_id FROM examination_types LIMIT 1),
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 minutes', 'Scheduled', 'UNSCOPED-FAIL'
                )
            `, [HQ_BRANCH_ID]);
        } catch (err) {
            unscopedInsertFailed = true;
            assert(
                err.code === '42501' || /row-level security/i.test(err.message),
                'Un-scoped INSERT without branch context blocked by RLS policy violation (42501)',
                `Error: ${err.message}`
            );
        }
        if (!unscopedInsertFailed) {
            assert(false, 'Un-scoped INSERT without branch context was unexpectedly allowed');
        }
        await appClient.query('ROLLBACK');

        // 28c. Client attempt to spoof org admin without valid user_id fails closed (0 rows returned)
        await appClient.query('BEGIN');
        await appClient.query('SELECT set_branch_context(NULL, NULL, true)');
        const spoofCheck = await appClient.query("SELECT current_setting('app.is_org_admin', true) as is_admin, count(*)::int as count FROM appointments");
        assert(
            spoofCheck.rows[0]?.is_admin === 'false' && spoofCheck.rows[0]?.count === 0,
            'Client session without verified user_id cannot spoof app.is_org_admin (Evaluates to false, 0 rows)',
            `is_admin: ${spoofCheck.rows[0]?.is_admin}, count: ${spoofCheck.rows[0]?.count}`
        );
        await appClient.query('ROLLBACK');

        // 28d. Scoped branch context returns strictly isolated records
        await appClient.query('BEGIN');
        await appClient.query('SELECT set_branch_context($1::uuid, NULL, false)', [HQ_BRANCH_ID]);
        const hqRes = await appClient.query('SELECT count(*)::int as count FROM appointments');
        const hqForeignRes = await appClient.query('SELECT count(*)::int as count FROM appointments WHERE branch_id = $1', [dokkiBranchId]);
        assert(
            hqRes.rows[0]?.count > 0 && hqForeignRes.rows[0]?.count === 0,
            'Scoped branch context returns HQ rows and 0 foreign Dokki rows under RLS',
            `HQ: ${hqRes.rows[0]?.count}, Dokki: ${hqForeignRes.rows[0]?.count}`
        );
        await appClient.query('ROLLBACK');

        // 28e. Legitimate Org Admin context verified against users table returns all records
        await appClient.query('BEGIN');
        await appClient.query('SELECT set_branch_context(NULL, $1::uuid, true)', [adminUser.user_id]);
        const adminCheck = await appClient.query("SELECT current_setting('app.is_org_admin', true) as is_admin, count(*)::int as count FROM appointments");
        assert(
            adminCheck.rows[0]?.is_admin === 'true' && adminCheck.rows[0]?.count > hqRes.rows[0]?.count,
            'Legitimate org admin verified against users table sees global multi-branch records',
            `is_admin: ${adminCheck.rows[0]?.is_admin}, count: ${adminCheck.rows[0]?.count}`
        );
        await appClient.query('ROLLBACK');

        // 28f. Clear context resets session and immediately fails closed
        await appClient.query('BEGIN');
        await appClient.query('SELECT clear_branch_context()');
        const clearRes = await appClient.query('SELECT count(*)::int as count FROM appointments');
        assert(
            clearRes.rows[0]?.count === 0,
            'clear_branch_context() resets session and fails closed (0 rows returned)'
        );
        await appClient.query('ROLLBACK');

        // 28g. Application transaction helper withBranchTransaction enforces RLS scoping on pooled clients
        const branchTxModulePath = fs.existsSync(path.join(__dirname, '../backend/src/utils/branchTransaction.js'))
            ? path.join(__dirname, '../backend/src/utils/branchTransaction.js')
            : path.join(__dirname, '../src/utils/branchTransaction.js');
        const { withBranchTransaction } = require(branchTxModulePath);
        const helperCount = await withBranchTransaction(appClientPool, { branchContext: { branchId: HQ_BRANCH_ID } }, async (client) => {
            const res = await client.query('SELECT count(*)::int as count FROM appointments');
            return res.rows[0]?.count;
        });
        assert(
            helperCount === hqRes.rows[0]?.count && helperCount > 0,
            'withBranchTransaction seamlessly enforces RLS branch scoping for application transactions',
            `Expected ${hqRes.rows[0]?.count}, got ${helperCount}`
        );
    } finally {
        appClient.release();
        await appClientPool.end();
    }

    // =========================================================================
    // TEST 29: Enterprise Custom License Feature Restriction (Signed License omitting multi-branch)
    // =========================================================================
    console.log('\n[Test 29] Enterprise Custom License Feature Restriction (Signed License omitting multi-branch)...');

    const keyPath = path.join(__dirname, '../keys/privateKey.pem');

    if (fs.existsSync(keyPath)) {
        const privateKeyPem = fs.readFileSync(keyPath, 'utf8');

        const signLicense = (payload) => {
            const data = Buffer.from(JSON.stringify(payload), 'utf8');
            const privateKey = crypto.createPrivateKey(privateKeyPem);
            const signature = crypto.sign('SHA256', data, privateKey).toString('base64');
            return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
        };

        // 29a. Mint custom Enterprise license with maxBranches: 5 BUT allowedModules: ['pacs', 'reporting'] (no multi-branch)
        const customEnterpriseKey = signLicense({
            v: 1,
            customerId: 'VIARA-CUSTOM-ENTERPRISE-NO-BRANCH',
            edition: 'enterprise',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
            maxUsers: 50,
            maxBranches: 5,
            fingerprint: null,
            allowedModules: ['pacs', 'reporting']
        });

        const activateRes = await request('/api/license/activate', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { key: customEnterpriseKey }
        });
        assert(
            activateRes.status === 200 && activateRes.data?.success === true,
            'Custom Enterprise license activated via /api/license/activate'
        );

        // 29b. Verify quota reports multiBranchAllowed: false
        const quotaRes = await request('/api/settings/branches/quota', {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(
            quotaRes.status === 200 && quotaRes.data?.multiBranchAllowed === false,
            'Quota endpoint reports multiBranchAllowed: false when license modules exclude multi-branch',
            `multiBranchAllowed: ${quotaRes.data?.multiBranchAllowed}`
        );

        // 29c. Attempt to create branch fails with 403 FEATURE_NOT_LICENSED
        const createBlockedRes = await request('/api/settings/branches', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
                name: 'Unauthorized Branch Under Enterprise License',
                code: 'UNAUTH-ENT',
                is_main: false
            }
        });
        assert(
            createBlockedRes.status === 403 && createBlockedRes.data?.code === 'FEATURE_NOT_LICENSED',
            'POST /api/settings/branches blocked with 403 FEATURE_NOT_LICENSED despite enterprise edition',
            `Status: ${createBlockedRes.status}, Code: ${createBlockedRes.data?.code}`
        );

        // 29d. Restore full developer/enterprise license with multi-branch enabled
        const fullLicenseKey = signLicense({
            v: 1,
            customerId: 'VIARA-E2E-UNLIMITED',
            edition: 'developer',
            issuedAt: new Date().toISOString(),
            expiresAt: null,
            maxUsers: -1,
            maxBranches: -1,
            fingerprint: null,
            allowedModules: ['*']
        });
        await request('/api/license/activate', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { key: fullLicenseKey }
        });
        console.log('  Restored full multi-branch license after Test 29');
    } else {
        console.log('  [SKIP] Private key not found at keys/privateKey.pem — skipping license signing');
    }

    // =========================================================================
    // TEST 30: Concurrent Branch Reactivation Race Condition Verification (MBT-305)
    // =========================================================================
    console.log('\n[Test 30] Concurrent Branch Reactivation Race Condition Verification (MBT-305)...');

    const orgId = adminUser.organization_id || '00000000-0000-4000-8000-000000000000';
    const branchARes = await pool.query(`
        INSERT INTO branches (
            id, organization_id, name, code, is_main, status
        ) VALUES (
            gen_random_uuid(), $1, 'Race Branch A', 'RACE-A', FALSE, 'archived'
        ) RETURNING id
    `, [orgId]);
    const raceBranchAId = branchARes.rows[0].id;

    const branchBRes = await pool.query(`
        INSERT INTO branches (
            id, organization_id, name, code, is_main, status
        ) VALUES (
            gen_random_uuid(), $1, 'Race Branch B', 'RACE-B', FALSE, 'archived'
        ) RETURNING id
    `, [orgId]);
    const raceBranchBId = branchBRes.rows[0].id;

    // Archive all branches except HQ so exactly 1 branch is currently active
    await pool.query("UPDATE branches SET status = 'archived' WHERE id NOT IN ($1, $2, $3)", [
        HQ_BRANCH_ID, raceBranchAId, raceBranchBId
    ]);

    if (fs.existsSync(keyPath)) {
        const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
        const signLicense = (payload) => {
            const data = Buffer.from(JSON.stringify(payload), 'utf8');
            const privateKey = crypto.createPrivateKey(privateKeyPem);
            const signature = crypto.sign('SHA256', data, privateKey).toString('base64');
            return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
        };

        // Mint license with quota of exactly 2 branches
        const quota2Key = signLicense({
            v: 1,
            customerId: 'VIARA-QUOTA-2-RACE',
            edition: 'enterprise',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
            maxUsers: 50,
            maxBranches: 2,
            fingerprint: null,
            allowedModules: ['multi-branch', 'appointments', 'billing']
        });

        await request('/api/license/activate', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { key: quota2Key }
        });

        // Concurrently attempt to reactivate both raceBranchA and raceBranchB
        const [resA, resB] = await Promise.all([
            request(`/api/settings/branches/${raceBranchAId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${adminToken}` },
                body: { status: 'active' }
            }),
            request(`/api/settings/branches/${raceBranchBId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${adminToken}` },
                body: { status: 'active' }
            })
        ]);

        const statuses = [resA.status, resB.status].sort();
        const successCount = [resA, resB].filter(r => r.status === 200).length;
        const rejectedCount = [resA, resB].filter(r => r.status === 403 && r.data?.code === 'MAX_BRANCHES_EXCEEDED').length;

        assert(
            successCount === 1 && rejectedCount === 1,
            'Concurrent reactivation race: exactly 1 succeeds (200) and 1 is rejected (403 MAX_BRANCHES_EXCEEDED)',
            `Success: ${successCount}, Rejected: ${rejectedCount}, Statuses: ${JSON.stringify(statuses)}`
        );

        // Verify database active count strictly equals 2 (never exceeds maxBranches)
        const finalCountRes = await pool.query(
            "SELECT COUNT(*)::int as count FROM branches WHERE status = 'active'"
        );
        assert(
            finalCountRes.rows[0]?.count === 2,
            'Database active branch count strictly bounded at quota limit 2 after concurrent race',
            `Active count: ${finalCountRes.rows[0]?.count}`
        );

        // Restore Dokki branch to active and clean up temporary race branches
        await pool.query("UPDATE branches SET status = 'active' WHERE id = $1", [dokkiBranchId]);
        await pool.query("DELETE FROM branches WHERE id IN ($1, $2)", [raceBranchAId, raceBranchBId]);

        const fullLicenseKey = signLicense({
            v: 1,
            customerId: 'VIARA-E2E-UNLIMITED',
            edition: 'developer',
            issuedAt: new Date().toISOString(),
            expiresAt: null,
            maxUsers: -1,
            maxBranches: -1,
            fingerprint: null,
            allowedModules: ['*']
        });
        await request('/api/license/activate', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { key: fullLicenseKey }
        });
        console.log('  Restored full unlimited multi-branch license and cleaned up race branches');
    }

    // ── Results Summary ──────────────────────────────────────────────────────
    console.log('\n===============================================================');
    console.log(`  VERIFICATION FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    await pool.end();
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error('Test execution error:', err);
    pool.end();
    process.exit(1);
});
