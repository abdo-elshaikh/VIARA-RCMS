/**
 * @typedef {Object} EquipmentStatus
 * @property {'Active' | 'Under Maintenance' | 'Out of Service'} value
 */

/**
 * @typedef {Object} Room
 * @property {string} room_id
 * @property {string} name
 * @property {string} room_number
 * @property {string} type
 * @property {string} floor
 * @property {string} status
 * @property {string} notes
 * @property {Machine[]} machines
 * @property {number} total_procedures
 */

/**
 * @typedef {Object} Machine
 * @property {string} modality_id
 * @property {string} name
 * @property {string} type
 * @property {string} room_id
 * @property {string} room_number
 * @property {string} serial_number
 * @property {string} manufacturer
 * @property {string} model
 * @property {string} installation_date
 * @property {string} location
 * @property {string} status
 * @property {Procedure[]} procedures
 */

/**
 * @typedef {Object} Procedure
 * @property {string} type_id
 * @property {string} code
 * @property {string} name
 * @property {number} price
 * @property {number} duration_minutes
 * @property {string} body_part
 * @property {string} preparation_instructions
 * @property {boolean} contrast_required
 * @property {boolean} is_active
 * @property {string} modality_id
 * @property {string} modality_name
 * @property {string} modality_type
 * @property {string} room_number
 */

/**
 * @typedef {Object} MaintenanceRecord
 * @property {string} id
 * @property {string} machine_id
 * @property {string} machine_name
 * @property {string} type
 * @property {string} status
 * @property {string} scheduled_date
 * @property {string} completed_date
 * @property {string} notes
 * @property {string} technician_id
 */

/**
 * @typedef {Object} DowntimeRecord
 * @property {string} id
 * @property {string} machine_id
 * @property {string} machine_name
 * @property {string} status
 * @property {string} reported_at
 * @property {string} resolved_at
 * @property {string} description
 * @property {string} root_cause
 * @property {string} resolution
 */

/**
 * @typedef {Object} RoomFormData
 * @property {string} name
 * @property {string} roomNumber
 * @property {string} type
 * @property {string} floor
 * @property {string} status
 * @property {string} notes
 */

/**
 * @typedef {Object} MachineFormData
 * @property {string} name
 * @property {string} type
 * @property {string} roomId
 * @property {string} roomNumber
 * @property {string} serialNumber
 * @property {string} manufacturer
 * @property {string} model
 * @property {string} installationDate
 * @property {string} location
 * @property {string} status
 */

/**
 * @typedef {Object} ExamFormData
 * @property {string} modalityId
 * @property {string} code
 * @property {string} name
 * @property {string} price
 * @property {string} durationMinutes
 * @property {string} bodyPart
 * @property {string} preparationInstructions
 * @property {boolean} contrastRequired
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} MatrixData
 * @property {Room[]} rooms
 */

/**
 * @typedef {Object} EquipmentMetrics
 * @property {number} activeRooms
 * @property {number} totalRooms
 * @property {number} totalMachines
 * @property {number} activeMachines
 * @property {number} totalExams
 * @property {number} scheduledMaintenance
 * @property {number} activeDowntime
 */

/**
 * Equipment status constants
 * @readonly
 * @enum {string}
 */
export const EQUIPMENT_STATUS = {
    ACTIVE: 'Active',
    UNDER_MAINTENANCE: 'Under Maintenance',
    OUT_OF_SERVICE: 'Out of Service'
};

/**
 * Room type constants
 * @readonly
 * @enum {string}
 */
export const ROOM_TYPES = [
    'Imaging',
    'Preparation',
    'Recovery',
    'Reporting',
    'Consultation'
];

/**
 * Room status constants
 * @readonly
 * @enum {string}
 */
export const ROOM_STATUS = [
    'Active',
    'Under Maintenance',
    'Out of Service'
];

/**
 * Machine type constants
 * @readonly
 * @enum {string}
 */
export const MACHINE_TYPES = [
    'MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography',
    'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA'
];

/**
 * Maintenance status constants
 * @readonly
 * @enum {string}
 */
export const MAINTENANCE_STATUS = [
    'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Overdue'
];

/**
 * Downtime status constants
 * @readonly
 * @enum {string}
 */
export const DOWNTIME_STATUS = [
    'Reported', 'Investigating', 'In Repair', 'Resolved', 'Escalated'
];

/**
 * Empty room form default
 * @type {RoomFormData}
 */
export const emptyRoomForm = {
    name: '',
    roomNumber: '',
    type: 'Imaging',
    floor: '',
    status: 'Active',
    notes: ''
};

/**
 * Empty machine form default
 * @type {MachineFormData}
 */
export const emptyMachine = {
    name: '',
    type: 'MRI',
    roomId: '',
    roomNumber: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    installationDate: '',
    location: '',
    status: 'Active'
};

/**
 * Empty exam form default
 * @type {ExamFormData}
 */
export const emptyExam = {
    modalityId: '',
    code: '',
    name: '',
    price: '',
    durationMinutes: '30',
    bodyPart: '',
    preparationInstructions: '',
    contrastRequired: false,
    isActive: true
};

/**
 * Valid tab identifiers
 * @type {string[]}
 */
export const VALID_TABS = ['matrix', 'rooms', 'workstations', 'registry', 'procedures', 'maintenance', 'downtime'];

/**
 * Tab configuration
 * @typedef {Object} TabConfig
 * @property {string} id
 * @property {React.ComponentType} icon
 * @property {string} label
 * @property {number|null} count
 * @property {boolean} [visible]
 */