const winston = require('winston');
const { getReqId } = require('../middleware/tracing');

/**
 * Winston logger configuration for structured logging
 */

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
