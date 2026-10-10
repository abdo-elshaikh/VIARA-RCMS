const { submitSafetyResponse } = require('../src/controllers/safetyController');
const { verifyReportAuthenticity } = require('../src/controllers/publicLandingController');
const { amendReport } = require('../src/controllers/examController');
const { getClaims, exportClaims } = require('../src/controllers/claimsController');
const { getWaitingList } = require('../src/controllers/waitingListController');
const { getDicomStorageStatus } = require('../src/services/postgresBackupService');

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

describe('Phase 2 (P1 & P2) Defect Remediation Suite', () => {

    describe('BUG-13: MRI / CT Safety Contraindication Auto-Hold', () => {
        test('pacemaker answer triggers automatic exam hold and marks implant safety At Risk', async () => {
            const examId = '00000000-0000-4000-8000-000000000401';
            const templateId = '00000000-0000-4000-8000-000000000402';
            const nurseId = '00000000-0000-4000-8000-000000000403';

            const queries = [];
            const client = {
                query: jest.fn(async (sql, params) => {
                    queries.push({ sql: String(sql), params });
                    if (String(sql).includes('INSERT INTO system_logs')) {
                        return { rows: [{ log_id: 'safety-audit-log' }] };
                    }
                    if (String(sql).includes('SELECT e.status')) {
                        return { rows: [{ status: 'Checked-in' }] };
                    }
                    if (String(sql).includes('FROM safety_templates')) {
                        return { rows: [{ '?column?': 1 }] };
                    }
                    if (String(sql).includes('INSERT INTO exam_safety_responses')) {
                        return { rows: [{ response_id: 1, exam_id: examId, template_id: templateId }] };
                    }
                    if (String(sql).includes('UPDATE examinations') && String(sql).includes('is_on_hold = TRUE')) {
                        return { rows: [{ exam_id: examId, is_on_hold: true }] };
                    }
                    return { rows: [] };
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client), query: jest.fn().mockResolvedValue({ rows: [] }) };

            const req = {
                params: { examId },
                body: {
                    templateId,
                    answers: { pacemaker: true, claustrophobic: false }
                },
                user: { user_id: nurseId, role: 'Nurse' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await submitSafetyResponse(db)(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                contraindicationDetected: true,
                isOnHold: true
            }));

            const holdUpdate = queries.find(q => q.sql.includes('UPDATE examinations') && q.sql.includes('is_on_hold = TRUE'));
            expect(holdUpdate).toBeDefined();
            expect(holdUpdate.sql).toContain('implant_safety_status');
        });

        test('safe responses without contraindications do not trigger exam hold', async () => {
            const examId = '00000000-0000-4000-8000-000000000401';
            const templateId = '00000000-0000-4000-8000-000000000402';
            const nurseId = '00000000-0000-4000-8000-000000000403';

            const queries = [];
            const client = {
                query: jest.fn(async (sql, params) => {
                    queries.push({ sql: String(sql), params });
                    if (String(sql).includes('INSERT INTO system_logs')) {
                        return { rows: [{ log_id: 'safety-audit-log' }] };
                    }
                    if (String(sql).includes('SELECT e.status')) return { rows: [{ status: 'Checked-in' }] };
                    if (String(sql).includes('FROM safety_templates')) return { rows: [{ '?column?': 1 }] };
                    if (String(sql).includes('INSERT INTO exam_safety_responses')) {
                        return { rows: [{ response_id: 2, exam_id: examId, template_id: templateId }] };
                    }
                    return { rows: [] };
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client), query: jest.fn().mockResolvedValue({ rows: [] }) };

            const req = {
                params: { examId },
                body: {
                    templateId,
                    answers: { pacemaker: false, metallic_implants: false, pregnant: false }
                },
                user: { user_id: nurseId, role: 'Nurse' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await submitSafetyResponse(db)(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                contraindicationDetected: false,
                isOnHold: false
            }));

            const holdUpdate = queries.find(q => q.sql.includes('UPDATE examinations') && q.sql.includes('is_on_hold = TRUE'));
            expect(holdUpdate).toBeUndefined();
        });
    });

    describe('BUG-09: Public Report Verification IDOR Protection', () => {
        test('rejects predictable short codes and sequential order numbers with 400', async () => {
            const db = { query: jest.fn() };
            const req = { params: { hash: 'ORD-2026-001' }, query: {} };
            const res = mockResponse();
            const next = jest.fn();

            await verifyReportAuthenticity(db)(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                verified: false,
                error: expect.stringContaining('Valid digital signature verification hash is required')
            }));
            expect(db.query).not.toHaveBeenCalled();
        });

        test('queries exclusively by digital_signature_hash when valid hash is supplied', async () => {
            const validHash = 'a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0';
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('WHERE UPPER(e.digital_signature_hash) = UPPER($1)')) {
                        return {
                            rows: [{
                                exam_id: 'e-1',
                                order_number: 'ORD-1001',
                                status: 'Finalized',
                                report_status: 'Finalized',
                                digital_signature_hash: validHash,
                                first_name_enc: null,
                                last_name_enc: null
                            }]
                        };
                    }
                    if (text.includes('system_settings')) {
                        return { rows: [] };
                    }
                    return { rows: [] };
                })
            };
            const req = { params: { hash: validHash }, query: {} };
            const res = mockResponse();
            const next = jest.fn();

            await verifyReportAuthenticity(db)(req, res, next);

            expect(db.query).toHaveBeenCalled();
            const querySql = db.query.mock.calls[0][0];
            expect(querySql).toContain('UPPER(e.digital_signature_hash) = UPPER($1)');
            expect(querySql).not.toContain('e.order_number = UPPER($1)');
            expect(querySql).not.toContain('e.exam_id::text = UPPER($1)');
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                verified: true,
                integrityConfirmed: true
            }));
        });
    });

    describe('BUG-07: Supervisor Report Amendment Authorization', () => {
        test('blocks a supervisor (Admin/Developer) from amending clinical report content', async () => {
            const examId = '00000000-0000-4000-8000-000000000701';
            const authorDoctorId = '00000000-0000-4000-8000-000000000702';
            const supervisorId = '00000000-0000-4000-8000-000000000703';

            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('SELECT * FROM examinations WHERE exam_id = $1 FOR UPDATE')) {
                        return {
                            rows: [{
                                exam_id: examId,
                                performing_radiologist_id: authorDoctorId,
                                report_locked: true,
                                report_status: 'Finalized',
                                report_content: '<p>Original findings</p>',
                                report_sections: { findings: 'Original findings' }
                            }]
                        };
                    }
                    if (text.includes('INSERT INTO report_amendments')) {
                        return { rows: [{ amendment_id: 'amend-1' }] };
                    }
                    if (text.includes('UPDATE examinations')) {
                        return { rows: [{ exam_id: examId, report_status: 'Amended' }] };
                    }
                    return { rows: [] };
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: examId },
                body: {
                    amendmentReason: 'Corrected measurement per peer review',
                    reportContent: '<p>Amended findings: nodule is 4mm</p>'
                },
                user: { user_id: supervisorId, role: 'Developer' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await amendReport(db)(req, res, next);

            expect(client.query).toHaveBeenCalledWith('ROLLBACK');
            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 403,
                message: 'Only an authorized radiologist may amend clinical report content'
            }));
            expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE examinations'));
            expect(res.json).not.toHaveBeenCalled();
        });

        test('blocks a non-author radiologist without supervisor permission with 403', async () => {
            const examId = '00000000-0000-4000-8000-000000000701';
            const authorDoctorId = '00000000-0000-4000-8000-000000000702';
            const otherDoctorId = '00000000-0000-4000-8000-000000000704';

            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('SELECT * FROM examinations WHERE exam_id = $1 FOR UPDATE')) {
                        return {
                            rows: [{
                                exam_id: examId,
                                performing_radiologist_id: authorDoctorId,
                                report_locked: true,
                                report_status: 'Finalized'
                            }]
                        };
                    }
                    if (text.includes('role_permissions')) {
                        return { rows: [] }; // no AMEND_FINALIZED_REPORTS permission
                    }
                    return { rows: [] };
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: examId },
                body: { amendmentReason: 'Unauthorized edit' },
                user: { user_id: otherDoctorId, role: 'Radiologist' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await amendReport(db)(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 403,
                message: expect.stringContaining('AMEND_FINALIZED_REPORTS permission is required')
            }));
        });
    });

    describe('BUG-06: Insurance Claims Branch Scoping', () => {
        test('applies branch_id filter when user belongs to a specific branch', async () => {
            const branchId = '00000000-0000-4000-8000-000000000601';
            let capturedSql = '';
            let capturedParams = [];

            const db = {
                query: jest.fn(async (sql, params) => {
                    capturedSql = String(sql);
                    capturedParams = params;
                    return { rows: [] };
                })
            };

            const req = {
                query: { status: 'Approved' },
                user: { user_id: 'user-1', role: 'Accountant', branch_id: branchId }
            };
            const res = mockResponse();
            const next = jest.fn();

            await getClaims(db)(req, res, next);

            expect(capturedSql).toContain('c.branch_id = $');
            expect(capturedParams).toContain(branchId);
        });

        test('applies branch_id in exportClaims for scoped branch user', async () => {
            const branchId = '00000000-0000-4000-8000-000000000601';
            let capturedSql = '';
            let capturedParams = [];

            const db = {
                query: jest.fn(async (sql, params) => {
                    capturedSql = String(sql);
                    capturedParams = params;
                    return { rows: [] };
                })
            };

            const req = {
                query: { format: 'json' },
                user: { user_id: 'user-1', role: 'Insurance_Staff', branch_id: branchId }
            };
            const res = mockResponse();
            const next = jest.fn();

            await exportClaims(db)(req, res, next);

            expect(capturedSql).toContain('c.branch_id = $');
            expect(capturedParams).toContain(branchId);
        });
    });

    describe('BUG-14: Waiting List Pre-Pagination Search Filter', () => {
        test('embeds search term q into SQL query before LIMIT and OFFSET', async () => {
            let capturedSql = '';
            let capturedParams = [];

            const db = {
                query: jest.fn(async (sql, params) => {
                    capturedSql = String(sql);
                    capturedParams = params;
                    return { rows: [] };
                })
            };

            const req = {
                query: { q: 'MRI-KNEE', limit: '20', offset: '40' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await getWaitingList(db)(req, res, next);

            expect(capturedSql).toContain('p.mrn ILIKE $');
            expect(capturedSql).toContain('et.name ILIKE $');
            expect(capturedSql).toContain('LIMIT $');
            expect(capturedParams).toContain('%MRI-KNEE%');
        });
    });

    describe('BUG-11: DICOM Storage Status Helper', () => {
        test('getDicomStorageStatus returns directory configuration and accessibility status', async () => {
            const status = await getDicomStorageStatus();
            expect(status).toHaveProperty('configured_path');
            expect(status).toHaveProperty('accessible');
            expect(typeof status.accessible).toBe('boolean');
        });
    });
});
