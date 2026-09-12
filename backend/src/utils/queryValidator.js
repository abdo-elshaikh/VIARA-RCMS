/**
 * Utility for validating dynamic SQL query parameters to prevent SQL injection
 */

const { AppError } = require('../middleware/errorHandler');

const VALID_INVOICE_STATUSES = ['Pending', 'Paid', 'Partial', 'Refunded', 'Voided'];
const VALID_QUEUE_STAGES = ['Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting', 'Finalized', 'Delivered', 'Cancelled'];
const VALID_STATIONS = ['Reception', 'Cashier', 'Nurse', 'Modality', 'Radiologist', 'Delivery'];
const VALID_PRIORITIES = ['Routine', 'Urgent', 'Emergency'];
const VALID_WAITING_LIST_STATUSES = ['Waiting', 'Contacted', 'Offered', 'Scheduled', 'Declined', 'Expired', 'Cancelled'];
const VALID_FINANCE_STATUSES = ['Pending', 'Paid', 'Cancelled'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateEnum = (value, validValues, paramName) => {
    if (value && !validValues.includes(value)) {
        throw new AppError(`Invalid value for ${paramName}`, 400);
    }
};

const validateUUID = (value, paramName) => {
    if (value && !UUID_REGEX.test(value)) {
        throw new AppError(`Invalid UUID format for ${paramName}`, 400);
    }
};

const validateSearchQuery = (query) => {
    if (query && query.length > 100) {
        throw new AppError('Search query too long (max 100 characters)', 400);
    }
};

module.exports = {
    VALID_INVOICE_STATUSES,
    VALID_QUEUE_STAGES,
    VALID_STATIONS,
    VALID_PRIORITIES,
    VALID_WAITING_LIST_STATUSES,
    VALID_FINANCE_STATUSES,
    validateEnum,
    validateUUID,
    validateSearchQuery
};
