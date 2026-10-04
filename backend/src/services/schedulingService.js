const { AppError } = require('../middleware/errorHandler');

const DEFAULT_WORKING_HOURS = { start: 0, end: 24, holidays: [], workingDays: [0, 1, 2, 3, 4, 5, 6] };

const parseWorkingHours = (raw) => {
    if (!raw) return { ...DEFAULT_WORKING_HOURS };
    let value;
    try {
        value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return { ...DEFAULT_WORKING_HOURS, timezone: 'Africa/Cairo' };
    }
    return {
        start: Number(value.start ?? value.startHour ?? DEFAULT_WORKING_HOURS.start),
        end: Number(value.end ?? value.endHour ?? DEFAULT_WORKING_HOURS.end),
        holidays: Array.isArray(value.holidays) ? value.holidays : [],
        workingDays: Array.isArray(value.workingDays)
            ? value.workingDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
            : [...DEFAULT_WORKING_HOURS.workingDays]
    };
};

const getWorkingHours = async (client) => {
    try {
        const settings = await client.query(`
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('center.working_hours', 'center.timezone')
        `);
        const values = Object.fromEntries(
            (settings.rows || []).map(row => [row.setting_key, row.setting_value])
        );
        if (values['center.working_hours']) {
            return {
                ...parseWorkingHours(values['center.working_hours']),
                timezone: values['center.timezone'] || 'Africa/Cairo'
            };
        }
    } catch {
        // Older deployments may only have center_settings; fall through to it.
    }

    try {
        const result = await client.query('SELECT working_hours FROM center_settings LIMIT 1');
        return { ...parseWorkingHours(result.rows[0]?.working_hours), timezone: 'Africa/Cairo' };
    } catch {
        return { ...DEFAULT_WORKING_HOURS };
    }
};

const getLocalDateParts = (date, timezone = 'UTC') => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
        return {
            date: `${values.year}-${values.month}-${values.day}`,
            weekday,
            hour: Number(values.hour) + Number(values.minute) / 60
        };
    } catch {
        return {
            date: date.toISOString().slice(0, 10),
            weekday: date.getUTCDay(),
            hour: date.getUTCHours() + date.getUTCMinutes() / 60
        };
    }
};

const assertWithinWorkingHours = (startTime, endTime, workingHours) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const {
        start: hourStart = 0,
        end: hourEnd = 24,
        holidays = [],
        workingDays = DEFAULT_WORKING_HOURS.workingDays,
        timezone = 'Africa/Cairo'
    } = workingHours || {};
    const localStart = getLocalDateParts(start, timezone);
    const localEnd = getLocalDateParts(end, timezone);

    if (holidays.includes(localStart.date) || holidays.includes(localEnd.date)) {
        throw new AppError('Appointments cannot be scheduled on a center holiday.', 400);
    }
    if (!workingDays.includes(localStart.weekday) || !workingDays.includes(localEnd.weekday)) {
        throw new AppError('Appointments cannot be scheduled on a non-working day.', 400);
    }

    // Support 24/7 radiology operations & flexible appointment booking
    // Only enforce if restrictive range is explicitly configured (e.g. non-24h)
    // and both start and end are restricted.
    if (hourStart === 0 && hourEnd >= 24) {
        return;
    }

    if (localStart.date !== localEnd.date || localStart.hour < hourStart || localEnd.hour > hourEnd) {
        throw new AppError(`Appointments must be within configured working hours (${hourStart}:00-${hourEnd}:00).`, 400);
    }
};

// The service object is exported by reference so that Jest spyOn / mock overrides
// on the required module object are visible inside assertAppointmentScheduleRules.
const service = {
    DEFAULT_WORKING_HOURS,
    getWorkingHours,
    assertWithinWorkingHours,
    parseWorkingHours,
    getLocalDateParts,
    assertAppointmentScheduleRules: null // defined below
};

const assertAppointmentScheduleRules = async (client, modalityId, startTime, endTime) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new AppError('Invalid appointment time range.', 400);
    }

    // Use service.X so Jest spyOn / factory mocks on the exported object are honoured.
    const workingHours = await service.getWorkingHours(client);
    service.assertWithinWorkingHours(startTime, endTime, workingHours);

    const machineResult = await client.query(`
        SELECT m.modality_id, m.name, m.status, m.room_id, m.room_number,
               r.name AS room_name, r.status AS room_status
        FROM modalities m
        LEFT JOIN rooms r ON m.room_id = r.room_id
        WHERE m.modality_id = $1 AND m.deleted_at IS NULL
    `, [modalityId]);
    if (!machineResult.rows.length) throw new AppError('Machine not found.', 404);
    const machine = machineResult.rows[0];
    if (machine.status !== 'Active') throw new AppError(`This machine is ${machine.status.toLowerCase()} and cannot be scheduled.`, 409);
    if (machine.room_status && machine.room_status !== 'Active') {
        throw new AppError(`Room (${machine.room_name || machine.room_number}) where this machine is located is currently ${machine.room_status.toLowerCase()} and cannot be scheduled.`, 409);
    }

    const downtime = await client.query(`
        SELECT downtime_id, reason FROM equipment_downtime
        WHERE modality_id = $1 AND status != 'Resolved'
          AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)
        LIMIT 1
    `, [modalityId, startTime, endTime]);
    if (downtime.rows.length) {
        throw new AppError(`This machine is under maintenance or experiencing downtime for the selected time slot. Reason: ${downtime.rows[0].reason}`, 409);
    }

    const localDate = getLocalDateParts(start, workingHours.timezone || 'Africa/Cairo').date;
    const maintenance = await client.query(`
        SELECT maintenance_id, maintenance_type
        FROM equipment_maintenance
        WHERE modality_id = $1 AND scheduled_date = $2
          AND status IN ('Scheduled', 'In Progress')
        LIMIT 1
    `, [modalityId, localDate]);
    if (maintenance.rows.length) {
        throw new AppError(`This machine has maintenance scheduled on this date (${maintenance.rows[0].maintenance_type}). Cannot schedule appointments during maintenance.`, 409);
    }

    if (machine.room_id) {
        const roomConflict = await client.query(`
            SELECT a.appointment_id, m.name AS conflicting_machine
            FROM appointments a
            JOIN modalities m ON a.modality_id = m.modality_id
            WHERE a.room_id = $1 AND a.modality_id <> $2
              AND a.status NOT IN ('Cancelled', 'No-Show', 'Completed')
              AND a.start_time < $4::timestamptz AND a.end_time > $3::timestamptz
            LIMIT 1
        `, [machine.room_id, modalityId, startTime, endTime]);
        if (roomConflict.rows.length) {
            throw new AppError(`Room (${machine.room_name || machine.room_number}) is occupied at this time by another procedure on ${roomConflict.rows[0].conflicting_machine}.`, 409);
        }
    }
    return machine;
};

service.assertAppointmentScheduleRules = assertAppointmentScheduleRules;

module.exports = service;
