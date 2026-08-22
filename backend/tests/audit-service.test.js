const { logAction } = require('../src/services/auditService');
const AuditService = require('../src/services/auditService');
const { runAuditPatternDetections } = require('../src/services/auditDetectionService');
const { logSystemAuditEvent } = require('../src/services/systemAuditService');

describe('audit logging resilience', () => {
    it('uses a savepoint before fallback logging so caller transactions remain usable', async () => {
        const calls = [];
        const db = {
            query: jest.fn(async (sql) => {
                calls.push(String(sql).trim());

                if (String(sql).includes('previous_value, new_value')) {
                    const error = new Error('column "previous_value" does not exist');
                    error.code = '42703';
                    throw error;
                }

                return { rows: [] };
            })
        };

        await logAction(db, {
            userId: 'user-1',
            action: 'EXAMINATION_TYPE_UPDATED',
            resourceId: 'exam-1',
            resourceTable: 'examination_types',
            details: { name: 'MRI Brain' }
        });

        expect(calls[0]).toMatch(/^SAVEPOINT audit_log_/);
        expect(calls.some((sql) => sql.startsWith('ROLLBACK TO SAVEPOINT audit_log_'))).toBe(true);
        expect(calls.some((sql) => sql.startsWith('RELEASE SAVEPOINT audit_log_'))).toBe(true);
        expect(calls).toEqual(expect.arrayContaining([
            expect.stringContaining('INSERT INTO system_logs'),
            expect.stringContaining('(user_id, action, resource_id, resource_table, ip_address, details)')
        ]));
    });

    it('writes structured actor, event, target, diff, and request context fields', async () => {
        const calls = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                calls.push({ sql: String(sql), params });
                if (String(sql).includes('INSERT INTO system_logs')) {
                    return { rows: [{ log_id: 101 }] };
                }
                return { rows: [] };
            })
        };

        const service = new AuditService(db);
        await service.logEvent({
            actor: {
                type: 'USER',
                userId: '00000000-0000-4000-8000-000000000001',
                role: 'Admin',
                name: 'System Admin',
            },
            event: {
                code: 'PATIENT.UPDATED',
                category: 'PHI_ACCESS',
                severity: 30,
            },
            target: {
                type: 'patients',
                id: '00000000-0000-4000-8000-000000000301',
                label: 'Patient profile',
            },
            related: {
                patientId: '00000000-0000-4000-8000-000000000301',
            },
            context: {
                requestId: 'req-123',
                ipAddress: '127.0.0.1',
                userAgent: 'jest',
                method: 'PATCH',
                path: '/api/patients/00000000-0000-4000-8000-000000000301',
            },
            change: {
                previousValue: { status: 'Active', phone: '123' },
                newValue: { status: 'Inactive', phone: '456' },
            },
            result: {
                outcome: 'success',
                statusCode: 200,
            },
        });

        const insert = calls.find(call => call.sql.includes('actor_type, actor_user_id'));
        expect(insert).toBeTruthy();
        expect(insert.params[13]).toBe('USER');
        expect(insert.params[15]).toBe('Admin');
        expect(insert.params[18]).toBe('req-123');
        expect(insert.params[19]).toBe('PATIENT.UPDATED');
        expect(insert.params[22]).toBe('patients');
        expect(JSON.parse(insert.params[36])).toEqual({
            status: { from: 'Active', to: 'Inactive' },
            phone: { from: '[REDACTED]', to: '[REDACTED]' },
        });
    });

    it('redacts sensitive fields recursively before audit persistence', () => {
        expect(AuditService.sanitizeForAudit({
            password: 'secret',
            profile: {
                email: 'patient@example.com',
                status: 'Active',
                patient_id: 'MRN-123',
                raw_patient_name: 'DOE^JANE',
                clinicalIndication: 'Persistent headache',
                icdCode: 'R51.9',
            },
        })).toEqual({
            password: '[REDACTED]',
            profile: {
                email: '[REDACTED]',
                status: 'Active',
                patient_id: '[REDACTED]',
                raw_patient_name: '[REDACTED]',
                clinicalIndication: '[REDACTED]',
                icdCode: '[REDACTED]',
            },
        });
    });

    it('throws when a required audit entry cannot be persisted', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await expect(logAction(db, {
            action: 'BILLING.PAYMENT_COLLECTED',
            resourceTable: 'invoices',
            required: true,
        })).rejects.toMatchObject({ code: 'AUDIT_LOG_REQUIRED_FAILED' });
    });

    it('creates alert records for sensitive or high-risk audit events', async () => {
        const calls = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                calls.push({ sql: String(sql), params });
                if (String(sql).includes('INSERT INTO system_logs')) {
                    return { rows: [{ log_id: 202 }] };
                }
                return { rows: [] };
            })
        };

        await AuditService.logEvent(db, {
            actor: {
                type: 'USER',
                userId: '00000000-0000-4000-8000-000000000001',
                role: 'Admin',
            },
            event: {
                code: 'RBAC.PERMISSION_GRANTED',
                category: 'RBAC',
                severity: 40,
            },
            target: {
                type: 'role_permissions',
                id: '00000000-0000-4000-8000-000000000401',
            },
            result: {
                outcome: 'success',
                statusCode: 200,
            },
        });

        const alertInsert = calls.find(call => call.sql.includes('INSERT INTO audit_alerts'));
        expect(alertInsert).toBeTruthy();
        expect(alertInsert.params[0]).toBe(202);
        expect(alertInsert.params[1]).toMatch(/HIGH_RISK_AUDIT_EVENT|SENSITIVE_ACTION/);
        expect(JSON.parse(alertInsert.params[8]).eventCode).toBe('RBAC.PERMISSION_GRANTED');
    });

    it('runs pattern detection rules and reports created alert counts', async () => {
        const statements = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                statements.push({ sql: String(sql), params });
                return { rows: [], rowCount: 1 };
            })
        };

        const result = await runAuditPatternDetections(db);

        expect(result.totalCreated).toBe(4);
        expect(result.rules.map(rule => rule.rule)).toEqual([
            'AUTH_FAILURE_BURST',
            'DENIED_ACCESS_BURST',
            'MASS_PHI_ACCESS',
            'SYSTEM_FAILURE',
        ]);
        expect(statements.every(statement => statement.sql.includes('INSERT INTO audit_alerts'))).toBe(true);
    });

    it('writes background job audit events as system actors', async () => {
        const calls = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                calls.push({ sql: String(sql), params });
                if (String(sql).includes('INSERT INTO system_logs')) {
                    return { rows: [{ log_id: 303 }] };
                }
                return { rows: [] };
            })
        };

        await logSystemAuditEvent(db, {
            eventCode: 'SYSTEM.JOB_COMPLETED',
            jobName: 'retention-test',
            sourceSystem: 'jest-job',
            details: { processed: 2 },
        });

        const insert = calls.find(call => call.sql.includes('actor_type, actor_user_id'));
        expect(insert).toBeTruthy();
        expect(insert.params[13]).toBe('SYSTEM');
        expect(insert.params[19]).toBe('SYSTEM.JOB_COMPLETED');
        expect(insert.params[22]).toBe('system_jobs');
        expect(insert.params[30]).toBe('jest-job');
        expect(JSON.parse(insert.params[5])).toEqual({ jobName: 'retention-test', processed: 2 });
    });
});
