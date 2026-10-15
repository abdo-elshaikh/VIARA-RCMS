const winston = require('winston');
const { getReqId } = require('../middleware/tracing');

/**
 * Winston logger configuration for structured logging.
 *
 * Two audit-driven guarantees:
 * 1. PHI redaction: medical identifiers embedded in log metadata (patient
 *    names, national IDs, phone numbers, MRNs, JWTs, passwords) are masked
 *    before any transport sees them. Structurally redacts keys and masks
 *    long digit runs (national IDs / phone numbers) inside string values.
 * 2. A stdout transport ALWAYS exists (JSON): `docker logs` and any log
 *    driver/shipping pipeline work in production, where the previous
 *    file-only setup produced empty `docker logs` output.
 */

const PHI_KEY_RE = /^(patient_?name|full_?name|name|national_?id|nid|ssn|phone|mobile|phone_?number|email|mrn|password|password_hash|token|access_token|refresh_token|authorization|otp|date_of_birth|dob|address)(_\d+)?$/i;
// Global version for .replace, non-global for .test: a /g/ regex keeps
// lastIndex between .test() calls and silently skips matches.
const LONG_DIGIT_RUN_RE = /\b\d{9,14}\b/g;
const LONG_DIGIT_RUN_TEST_RE = /\b\d{9,14}\b/;

const maskValue = (value) => {
    if (typeof value === 'string') {
        const masked = value.replace(LONG_DIGIT_RUN_RE, (m) => `${m.slice(0, 3)}${'*'.repeat(Math.max(0, m.length - 5))}${m.slice(-2)}`);
        if (masked !== value) return masked;
        return '[REDACTED]';
    }
    if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) >= 1e8) {
        return '[redacted-number]';
    }
    return '[redacted]';
};

const redactPHI = winston.format((info) => {
    const redactObject = (obj, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 6) return obj;
        for (const [key, value] of Object.entries(obj)) {
            if (PHI_KEY_RE.test(key)) {
                obj[key] = maskValue(value);
            } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Error)) {
                obj[key] = redactObject(value, depth + 1);
            } else if (typeof value === 'string' && LONG_DIGIT_RUN_TEST_RE.test(value)) {
                obj[key] = value.replace(LONG_DIGIT_RUN_RE, (m) => `${m.slice(0, 3)}${'*'.repeat(Math.max(0, m.length - 5))}${m.slice(-2)}`);
            }
        }
        return obj;
    };
    // Redact both nested metadata and the message itself when it carries IDs.
    if (info && typeof info === 'object') {
        redactObject(info);
        if (typeof info.message === 'string' && LONG_DIGIT_RUN_TEST_RE.test(info.message)) {
            info.message = info.message.replace(LONG_DIGIT_RUN_RE, (m) => `${m.slice(0, 3)}${'*'.repeat(Math.max(0, m.length - 5))}${m.slice(-2)}`);
        }
    }
    return info;
});

// Custom format to inject reqId
const injectReqId = winston.format((info) => {
    const reqId = getReqId();
    if (reqId) {
        info.reqId = reqId;
    }
    return info;
});

// Define log format
const logFormat = winston.format.combine(
    injectReqId(),
    redactPHI(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'VIARA-backend' },
    transports: [
        // Production: stdout JSON so `docker logs` and shipping pipelines work.
        // In development the human-readable console transport is added below.
        new winston.transports.Console({
            format: winston.format.combine(redactPHI(), winston.format.json()),
            silent: process.env.NODE_ENV !== 'production'
        }),
        // Error logs
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Combined logs
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
}

// Stream for Morgan HTTP logger
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;
