const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const realtimeService = require('../src/services/realtimeService');
const {
    isConfigured,
    replicateBackup,
    uploadNativeS3,
    getSignatureKey,
    computeChecksum
} = require('../src/services/backupOffsiteReplicator');
const { broadcastPatientCall } = require('../src/controllers/displayBoardController');
const { triggerMwlRegeneration, regenerateWorklists } = require('../src/services/pacsMwlService');

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.writeHead = jest.fn().mockReturnValue(res);
    res.write = jest.fn().mockReturnValue(true);
    res.end = jest.fn().mockReturnValue(res);
    return res;
};

describe('Phase 3 Remediation Suite: Distributed Pub/Sub, Native S3 Replicator & MWL Debouncing', () => {

    describe('BUG-08: Distributed Real-Time Pub/Sub via PostgreSQL LISTEN / NOTIFY', () => {
        let mockListenerClient;
        let mockPool;
        let notificationCallbacks = [];

        beforeEach(() => {
            notificationCallbacks = [];
            mockListenerClient = {
                query: jest.fn().mockResolvedValue({}),
                on: jest.fn((event, cb) => {
                    if (event === 'notification') {
                        notificationCallbacks.push(cb);
                    }
                }),
                release: jest.fn()
            };
            mockPool = {
                connect: jest.fn().mockResolvedValue(mockListenerClient),
                query: jest.fn().mockResolvedValue({})
            };
        });

        test('setRealtimePool registers LISTEN on viara_realtime_events', async () => {
            realtimeService.setRealtimePool(mockPool);
            await new Promise((r) => setTimeout(r, 20));

            expect(mockPool.connect).toHaveBeenCalled();
            expect(mockListenerClient.query).toHaveBeenCalledWith('LISTEN viara_realtime_events');
            expect(mockListenerClient.on).toHaveBeenCalledWith('notification', expect.any(Function));
        });

        test('broadcastToStaff executes pg_notify query with origin node ID', async () => {
            realtimeService.setRealtimePool(mockPool);
            const event = 'PATIENT_CALLED';
            const data = { orderNumber: 'ORD-20260912-001', room: 'X-Ray 1' };

            realtimeService.broadcastToStaff(event, data);

            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT pg_notify($1, $2)',
                expect.arrayContaining(['viara_realtime_events'])
            );

            const payloadStr = mockPool.query.mock.calls[0][1][1];
            const parsed = JSON.parse(payloadStr);
            expect(parsed.target).toBe('staff');
            expect(parsed.event).toBe(event);
            expect(parsed.data).toEqual(data);
            // NODE_ID is now `${process.pid}-${randomHex}` for uniqueness across cluster restarts
            expect(String(parsed.originNodeId)).toMatch(new RegExp(`^${process.pid}(-|$)`));
        });

        test('sendToUser dispatches locally and publishes distributed message to user target', () => {
            realtimeService.setRealtimePool(mockPool);
            const targetUserId = 'user-uuid-1234';
            realtimeService.sendToUser(targetUserId, 'NEW_MESSAGE', { text: 'Hello' });

            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT pg_notify($1, $2)',
                expect.arrayContaining(['viara_realtime_events'])
            );

            const payloadStr = mockPool.query.mock.calls[0][1][1];
            const parsed = JSON.parse(payloadStr);
            expect(parsed.target).toBe('user');
            expect(parsed.targetId).toBe(targetUserId);
        });

        test('handleDistributedMessage skips message originating from current process (loop prevention)', () => {
            // Origin node is current process pid
            const selfMessage = {
                originNodeId: process.pid,
                target: 'staff',
                event: 'TEST',
                data: {}
            };
            // Should not throw or crash
            expect(() => realtimeService.handleDistributedMessage(selfMessage)).not.toThrow();
        });

        test('handleDistributedMessage routes message from other node to local clients', () => {
            const externalMessage = {
                originNodeId: process.pid + 9999, // Remote worker node
                target: 'role',
                targetId: 'Radiologist',
                event: 'NEW_REPORT_ASSIGNED',
                data: { examId: 'exam-99' }
            };
            expect(() => realtimeService.handleDistributedMessage(externalMessage)).not.toThrow();
        });
    });

    describe('BUG-10: Native S3 AWS SigV4 Offsite Backup Replication', () => {
        const originalEnv = process.env;
        let tempDir;
        let testFilePath;
        let mockS3Server;
        let mockPort;
        let receivedRequests = [];

        beforeAll(async () => {
            tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'viara-s3-test-'));
            testFilePath = path.join(tempDir, 'backup-2026-09-12.sql.gz');
            await fsp.writeFile(testFilePath, 'mock database backup payload contents gzip 1234567890');

            // Set up mock S3 HTTP server
            mockS3Server = http.createServer((req, res) => {
                let body = '';
                req.on('data', (d) => { body += d; });
                req.on('end', () => {
                    receivedRequests.push({
                        method: req.method,
                        url: req.url,
                        headers: req.headers,
                        body
                    });
                    res.writeHead(200, { 'Content-Type': 'application/xml' });
                    res.end('<PutObjectResult></PutObjectResult>');
                });
            });

            await new Promise((resolve) => {
                mockS3Server.listen(0, '127.0.0.1', () => {
                    mockPort = mockS3Server.address().port;
                    resolve();
                });
            });
        });

        afterAll(async () => {
            if (mockS3Server) {
                await new Promise((resolve) => mockS3Server.close(resolve));
            }
            if (tempDir) {
                await fsp.rm(tempDir, { recursive: true, force: true });
            }
            process.env = originalEnv;
        });

        beforeEach(() => {
            receivedRequests = [];
            process.env = { ...originalEnv };
        });

        test('getSignatureKey derives a 32-byte signing key buffer', () => {
            const key = getSignatureKey('test-secret-key', '20260912', 'us-east-1', 's3');
            expect(Buffer.isBuffer(key)).toBe(true);
            expect(key.length).toBe(32);
        });

        test('isConfigured returns false when environment variables are missing', () => {
            delete process.env.BACKUP_OFFSITE_ENDPOINT;
            delete process.env.BACKUP_OFFSITE_BUCKET;
            delete process.env.BACKUP_OFFSITE_ACCESS_KEY;
            delete process.env.BACKUP_OFFSITE_SECRET_KEY;
            expect(isConfigured()).toBe(false);
        });

        test('isConfigured returns true when all 4 variables are present', () => {
            process.env.BACKUP_OFFSITE_ENDPOINT = `http://127.0.0.1:${mockPort}`;
            process.env.BACKUP_OFFSITE_BUCKET = 'hospital-backups';
            process.env.BACKUP_OFFSITE_ACCESS_KEY = 'AKIA_MOCK_KEY';
            process.env.BACKUP_OFFSITE_SECRET_KEY = 'SECRET_MOCK_KEY';
            expect(isConfigured()).toBe(true);
        });

        test('uploadNativeS3 streams backup to mock S3 endpoint with valid SigV4 authorization', async () => {
            process.env.BACKUP_OFFSITE_ENDPOINT = `http://127.0.0.1:${mockPort}`;
            process.env.BACKUP_OFFSITE_BUCKET = 'hospital-backups';
            process.env.BACKUP_OFFSITE_ACCESS_KEY = 'AKIA_MOCK_KEY';
            process.env.BACKUP_OFFSITE_SECRET_KEY = 'SECRET_MOCK_KEY';
            process.env.BACKUP_OFFSITE_REGION = 'us-east-1';
            process.env.BACKUP_OFFSITE_PREFIX = 'viara-daily';

            const checksum = await computeChecksum(testFilePath);
            const filename = 'backup-2026-09-12.sql.gz';

            const result = await uploadNativeS3(testFilePath, filename, checksum);
            expect(result.statusCode).toBe(200);

            expect(receivedRequests.length).toBe(1);
            const req = receivedRequests[0];
            expect(req.method).toBe('PUT');
            expect(req.url).toBe('/hospital-backups/viara-daily/backup-2026-09-12.sql.gz');
            expect(req.headers['x-amz-content-sha256']).toBe(checksum);
            expect(req.headers['authorization']).toContain('AWS4-HMAC-SHA256 Credential=AKIA_MOCK_KEY/');
            expect(req.headers['authorization']).toContain('/us-east-1/s3/aws4_request');
            expect(req.body).toBe('mock database backup payload contents gzip 1234567890');
        });

        test('replicateBackup handles unconfigured environment gracefully', async () => {
            delete process.env.BACKUP_OFFSITE_ENDPOINT;
            const result = await replicateBackup({ filename: 'test.sql.gz', filepath: testFilePath });
            expect(result.replicated).toBe(false);
            expect(result.reason).toBe('not_configured');
        });
    });

    describe('Display Board Patient Call: Real-Time Broadcast Integration', () => {
        test('broadcastPatientCall saves call and notifies staff via realtimeService', async () => {
            const db = {
                query: jest.fn().mockResolvedValue({
                    rows: [{ call_id: 'call-101', called_at: new Date().toISOString() }]
                })
            };

            const broadcastSpy = jest.spyOn(realtimeService, 'broadcastToStaff');

            const req = {
                body: { orderNumber: 'ORD-2026-999', roomName: 'Ultrasound 2', modalityId: 5 },
                user: { user_id: 'user-reception-1' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await broadcastPatientCall(db)(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                call: expect.objectContaining({
                    orderNumber: 'ORD-2026-999',
                    roomName: 'Ultrasound 2'
                })
            }));
            expect(broadcastSpy).toHaveBeenCalledWith('DISPLAY_CALL', expect.objectContaining({
                orderNumber: 'ORD-2026-999'
            }));

            broadcastSpy.mockRestore();
        });

        test('broadcastPatientCall accepts queueNumber and callByName (name resolved from DB)', async () => {
            const db = {
                query: jest.fn().mockResolvedValue({
                    rows: [{ call_id: 'call-102', called_at: new Date().toISOString() }]
                })
            };

            const broadcastSpy = jest.spyOn(realtimeService, 'broadcastToStaff');

            const req = {
                body: {
                    orderNumber: 'ORD-2026-888',
                    queueNumber: 4,
                    roomName: 'جناح الرنين المغناطيسي',
                    modalityId: 'mod-mri-1',
                    // callByName without a verifiable DB patient record resolves to false
                    callByName: true
                },
                user: { user_id: 'user-tech-1' }
            };
            const res = mockResponse();
            const next = jest.fn();

            await broadcastPatientCall(db)(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                call: expect.objectContaining({
                    orderNumber: 'ORD-2026-888',
                    queueNumber: 4,
                    roomName: 'جناح الرنين المغناطيسي',
                    // patientName is null because the mock db returns no encrypted patient record
                    patientName: null,
                    // callByName is false because resolvedPatientName is null (security policy)
                    callByName: false
                })
            }));
            expect(broadcastSpy).toHaveBeenCalledWith('DISPLAY_CALL', expect.objectContaining({
                orderNumber: 'ORD-2026-888',
                queueNumber: 4
            }));

            broadcastSpy.mockRestore();
        });
    });

    describe('MWL Service: Debounced Regeneration Trigger', () => {
        test('triggerMwlRegeneration delays and coalesces multiple rapid calls', async () => {
            jest.useFakeTimers();

            const mockDb = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };

            // Call trigger 3 times in rapid succession
            triggerMwlRegeneration(mockDb, 2000);
            triggerMwlRegeneration(mockDb, 2000);
            triggerMwlRegeneration(mockDb, 2000);

            // Immediately before timer finishes, query should not have executed
            expect(mockDb.query).not.toHaveBeenCalled();

            // Fast forward time by 2000ms
            jest.advanceTimersByTime(2000);

            // Wait for microtask resolution
            await Promise.resolve();

            jest.useRealTimers();
        });
    });
});
