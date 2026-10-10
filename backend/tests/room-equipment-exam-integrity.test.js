// Import the real module — assertAppointmentScheduleRules calls service.getWorkingHours internally
// (where service === module.exports), so spyOn correctly overrides the functions.
const schedulingService = require('../src/services/schedulingService');

const { AppError } = require('../src/middleware/errorHandler');
const { getRooms, createRoom, updateRoom, deleteRoom, getClinicalHierarchyMatrix } = require('../src/controllers/roomController');
const { getExamTypes } = require('../src/controllers/examTypeController');
const { createAppointment } = require('../src/controllers/appointmentController');
const assertSchedulingRules = schedulingService.assertAppointmentScheduleRules;


describe('Room, Equipment & Clinical Examination Integrity', () => {

    describe('Room CRUD Controller', () => {
        let mockDb;
        let mockClient;
        let mockReq;
        let mockRes;
        let next;

        beforeEach(() => {
            mockClient = {
                query: jest.fn(),
                release: jest.fn()
            };
            mockDb = {
                connect: jest.fn().mockResolvedValue(mockClient),
                query: jest.fn().mockResolvedValue({ rows: [] })
            };
            mockReq = {
                user: { user_id: '00000000-0000-4000-8000-000000000001', role: 'Admin' },
                params: {},
                body: {},
                query: {},
                get: jest.fn(),
                ip: '127.0.0.1'
            };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('getRooms returns rooms with aggregated equipment count', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    {
                        room_id: 'room-1',
                        name: 'جناح الرنين المغناطيسي 1',
                        room_number: 'MRI-01',
                        type: 'Imaging',
                        status: 'Active',
                        total_machines: 1,
                        active_machines: 1,
                        machines: [{ modality_id: 'm-1', name: 'MRI 3T', type: 'MRI', status: 'Active' }]
                    }
                ]
            });

            await getRooms(mockDb)(mockReq, mockRes, next);

            expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    room_id: 'room-1',
                    room_number: 'MRI-01',
                    total_machines: 1,
                    active_machines: 1
                })
            ]));
        });

        test('createRoom rejects duplicate room_number with 409 Conflict', async () => {
            mockReq.body = {
                name: 'جناح الرنين 2',
                roomNumber: 'MRI-01',
                type: 'Imaging'
            };

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [{ room_id: 'existing-room' }] }); // Duplicate query

            await createRoom(mockDb)(mockReq, mockRes, next);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(409);
        });

        test('deleteRoom blocks deletion if active equipment is installed', async () => {
            mockReq.params = { id: 'room-1' };

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [{ room_id: 'room-1', name: 'جناح الرنين' }] }) // existing
                .mockResolvedValueOnce({ rows: [{ modality_id: 'm-1', name: 'MRI Scanner' }] }); // active equipment check

            await deleteRoom(mockDb)(mockReq, mockRes, next);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(409);
            expect(next.mock.calls[0][0].message).toContain('active imaging equipment');
        });
    });

    describe('assertSchedulingRules & Collision Invariants', () => {
        let mockDb;
        let getWorkingHoursSpy;
        let assertWithinWorkingHoursSpy;
        const now = new Date();
        const startTime = new Date(now.getTime() + 86400000).toISOString();
        const endTime = new Date(now.getTime() + 86400000 + 3600000).toISOString();

        beforeEach(() => {
            mockDb = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };
            // Spy on the exported service object \u2014 the same object assertAppointmentScheduleRules
            // uses internally (service === module.exports), so these spies are honoured.
            getWorkingHoursSpy = jest.spyOn(schedulingService, 'getWorkingHours')
                .mockResolvedValue({ start: 0, end: 24, timezone: 'UTC', holidays: [], workingDays: [0,1,2,3,4,5,6] });
            assertWithinWorkingHoursSpy = jest.spyOn(schedulingService, 'assertWithinWorkingHours')
                .mockImplementation(() => {});
        });

        afterEach(() => {
            getWorkingHoursSpy.mockRestore();
            assertWithinWorkingHoursSpy.mockRestore();
        });

        test('blocks appointment if the parent room is Under Maintenance', async () => {
            // Modality query returns a room under maintenance
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    modality_id: 'm-1',
                    name: 'MRI 1',
                    status: 'Active',
                    room_id: 'room-1',
                    room_name: 'جناح الرنين',
                    room_number: 'MRI-01',
                    room_status: 'Under Maintenance'
                }]
            });

            await expect(assertSchedulingRules(mockDb, 'm-1', startTime, endTime))
                .rejects.toThrow('under maintenance');
        });

        test('blocks appointment if scheduled equipment maintenance overlaps', async () => {
            // 1. Modality lookup returns active machine & active room
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    modality_id: 'm-1',
                    name: 'MRI 1',
                    status: 'Active',
                    room_id: 'room-1',
                    room_status: 'Active'
                }]
            });
            // 2. Downtime overlap query -> empty
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            // 3. Maintenance query -> overlapping scheduled calibration
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    maintenance_id: 'maint-1',
                    maintenance_type: 'Calibration',
                    status: 'Scheduled'
                }]
            });

            await expect(assertSchedulingRules(mockDb, 'm-1', startTime, endTime))
                .rejects.toThrow('maintenance scheduled');
        });

        test('blocks appointment if another machine in the same room has a scheduled appointment at the same time', async () => {
            // 1. Modality lookup
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    modality_id: 'm-2',
                    name: 'Portable X-Ray',
                    status: 'Active',
                    room_id: 'room-shared',
                    room_name: 'غرفة الإجراءات المشتركة',
                    room_number: 'PROC-01',
                    room_status: 'Active'
                }]
            });
            // 2. Downtime overlap -> empty
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            // 3. Maintenance -> empty
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            // 4. Room collision query -> another procedure running on m-1 in room-shared
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    appointment_id: 'appt-other-machine',
                    start_time: startTime,
                    end_time: endTime,
                    conflicting_machine: 'Fixed Ultrasound'
                }]
            });

            await expect(assertSchedulingRules(mockDb, 'm-2', startTime, endTime))
                .rejects.toThrow('occupied at this time by another procedure');
        });
    });

    describe('createAppointment Duration & Room Integrity', () => {
        let mockDb;
        let mockClient;
        let mockReq;
        let mockRes;
        let next;

        beforeEach(() => {
            mockClient = {
                query: jest.fn(),
                release: jest.fn()
            };
            mockDb = {
                connect: jest.fn().mockResolvedValue(mockClient),
                query: jest.fn().mockResolvedValue({ rows: [] })
            };
            mockReq = {
                user: { user_id: '00000000-0000-4000-8000-000000000001', role: 'Receptionist' },
                body: {
                    patientId: '00000000-0000-4000-8000-000000000002',
                    modalityId: '00000000-0000-4000-8000-000000000003',
                    examTypeId: '00000000-0000-4000-8000-000000000004',
                    startTime: '2030-01-15T10:00:00Z',
                    endTime: '2030-01-15T10:15:00Z' // 15 minutes requested
                },
                headers: {},
                get: jest.fn(),
                ip: '127.0.0.1'
            };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('rejects appointment creation when duration is less than exam minimum duration', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({
                    rows: [{
                        type_id: '00000000-0000-4000-8000-000000000004',
                        name: 'Brain MRI with Contrast',
                        duration_minutes: 45 // Exam requires 45 min, but request provided 15 min!
                    }]
                });

            await createAppointment(mockDb)(mockReq, mockRes, next);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
            expect(next.mock.calls[0][0].message).toContain('45 minutes');
        });
    });

    describe('Clinical Hierarchy Matrix & Room-Equipment-Exam Joining', () => {
        let mockDb;
        let mockReq;
        let mockRes;
        let next;

        beforeEach(() => {
            mockDb = {
                query: jest.fn()
            };
            mockReq = {
                query: {},
                params: {},
                user: { role: 'Admin', userId: 'user-1' }
            };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('getClinicalHierarchyMatrix builds 3-level tree: rooms -> machines -> procedures with KPIs', async () => {
            // 1. Rooms query
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    { room_id: 'room-1', name: 'جناح الرنين', room_number: 'MRI-01', type: 'Imaging', status: 'Active' },
                    { room_id: 'room-2', name: 'غرفة التحضير', room_number: 'PREP-01', type: 'Preparation', status: 'Active' }
                ]
            });

            // 2. Modalities query
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    { modality_id: 'm-1', name: 'MRI 3T', type: 'MRI', room_id: 'room-1', status: 'Active' },
                    { modality_id: 'm-2', name: 'Portable US', type: 'Ultrasound', room_id: null, status: 'Active' }
                ]
            });

            // 3. Procedures query
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    { type_id: 'p-1', modality_id: 'm-1', name: 'Brain MRI', duration_minutes: 45, price: 250, is_active: true, contrast_required: true },
                    { type_id: 'p-2', modality_id: 'm-1', name: 'Knee MRI', duration_minutes: 30, price: 180, is_active: true, contrast_required: false }
                ]
            });

            await getClinicalHierarchyMatrix(mockDb)(mockReq, mockRes, next);

            expect(mockRes.json).toHaveBeenCalled();
            const response = mockRes.json.mock.calls[0][0];

            expect(response.kpis).toBeDefined();
            expect(response.kpis.totalRooms).toBe(2);
            expect(response.kpis.totalMachines).toBe(2);
            expect(response.kpis.totalProcedures).toBe(2);

            expect(response.rooms).toHaveLength(2);
            const mriRoom = response.rooms.find(r => r.room_id === 'room-1');
            expect(mriRoom.machines).toHaveLength(1);
            expect(mriRoom.machines[0].procedures).toHaveLength(2);
            expect(mriRoom.total_procedures).toBe(2);

            expect(response.unassignedMachines).toHaveLength(1);
            expect(response.unassignedMachines[0].modality_id).toBe('m-2');
        });

        test('getExamTypes returns procedure records joined with room details', async () => {
            // Mock ensureExamTypeSoftDeleteSchema (columns query)
            mockDb.query.mockResolvedValueOnce({
                rows: [{ column_name: 'deleted_at' }]
            });

            // Mock getExamTypes SELECT
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    {
                        type_id: 'p-1',
                        name: 'Brain MRI with Contrast',
                        modality_id: 'm-1',
                        modality_name: 'Siemens 3T',
                        modality_type: 'MRI',
                        modality_status: 'Active',
                        room_id: 'room-1',
                        room_name: 'جناح الرنين المغناطيسي',
                        room_number: 'MRI-01',
                        room_status: 'Active',
                        duration_minutes: 45
                    }
                ]
            });

            mockReq.query = { roomId: 'room-1' };

            await getExamTypes(mockDb)(mockReq, mockRes, next);

            expect(mockRes.json).toHaveBeenCalled();
            const returnedExams = mockRes.json.mock.calls[0][0];
            expect(returnedExams).toHaveLength(1);
            expect(returnedExams[0].room_name).toBe('جناح الرنين المغناطيسي');
            expect(returnedExams[0].room_number).toBe('MRI-01');
            expect(returnedExams[0].room_status).toBe('Active');
        });
    });
});
