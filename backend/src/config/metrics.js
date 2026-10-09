const client = require('prom-client');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Central Prometheus metrics registry.
//
// Replaces the previous hand-rolled exporter which had:
//   - unbounded label cardinality (raw req.path incl. UUIDs under a label
//     literally named "method"), with a Map that never pruned;
//   - a "histogram" TYPE with only _count/_sum (invalid exposition);
//   - no pool/process/backup metrics, and no status label (so the shipped
//     alerting rules for 5xx could never fire).
// ---------------------------------------------------------------------------

const register = new client.Registry();

// Process/CPU/heap/event-loop metrics for free.
client.collectDefaultMetrics({ register, prefix: 'VIARA_' });

// Normalize request paths so label cardinality stays bounded: collapse
// UUIDs, long digit runs, and typical id-looking segments into :id.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_NUMBER_RE = /^\d{4,}$/;

const normalizeRoute = (rawPath) => {
    let p = String(rawPath || '/unknown');
    p = p.replace(UUID_RE, ':id');
    const segments = p.split('/').map((seg) => (
        LONG_NUMBER_RE.test(seg) ? ':num' : seg
    ));
    p = segments.join('/');
    // Hard cap for pathological cases (very long query-style paths).
    return p.length > 120 ? `${p.slice(0, 117)}...` : p;
};

const httpRequestsTotal = new client.Counter({
    name: 'VIARA_http_requests_total',
    help: 'Total HTTP requests handled',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});

const httpRequestDuration = new client.Histogram({
    name: 'VIARA_http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});

const activeConnections = new client.Gauge({
    name: 'VIARA_http_requests_active',
    help: 'In-flight HTTP requests',
    registers: [register],
    collect() {
        this.set(activeConnectionCount);
    },
});
let activeConnectionCount = 0;
const incrementActive = () => { activeConnectionCount += 1; };
const decrementActive = () => { activeConnectionCount = Math.max(0, activeConnectionCount - 1); };

// pg pool health: the single most valuable gauge set for this app, wired to
// the live pool in server.js via setDbPool().
let dbPoolRef = null;
const setDbPool = (pool) => { dbPoolRef = pool; };

const dbPoolTotal = new client.Gauge({
    name: 'VIARA_db_pool_connections',
    help: 'PostgreSQL pool connections (total)',
    registers: [register],
    collect() { if (dbPoolRef) this.set(dbPoolRef.totalCount); },
});
const dbPoolIdle = new client.Gauge({
    name: 'VIARA_db_pool_idle_connections',
    help: 'PostgreSQL pool idle connections',
    registers: [register],
    collect() { if (dbPoolRef) this.set(dbPoolRef.idleCount); },
});
const dbPoolWaiting = new client.Gauge({
    name: 'VIARA_db_pool_waiting_clients',
    help: 'Clients waiting for a PostgreSQL pool connection',
    registers: [register],
    collect() { if (dbPoolRef) this.set(dbPoolRef.waitingCount); },
});

// Backup freshness/size — the metrics the shipped alert rules reference
// (backup overdue / empty backup). Set by the backup scheduler.
const dbBackupCompleted = new client.Gauge({
    name: 'VIARA_db_backup_completed',
    help: 'Unix timestamp (seconds) of the last successful scheduled database backup',
    registers: [register],
});
const dbBackupSizeBytes = new client.Gauge({
    name: 'VIARA_db_backup_size_bytes',
    help: 'Size in bytes of the last successful scheduled database backup',
    registers: [register],
});
const dbBackupFailuresTotal = new client.Counter({
    name: 'VIARA_db_backup_failures_total',
    help: 'Total failed scheduled database backups',
    registers: [register],
});

const recordHttpMetrics = ({ method, route, status, durationSeconds }) => {
    const labels = { method, route, status: String(status) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
};

const offsiteReplicationCompleted = new client.Gauge({
    name: 'VIARA_backup_offsite_completed',
    help: 'Unix timestamp (seconds) of the last successful offsite backup replication',
    registers: [register],
});
const offsiteReplicationFailuresTotal = new client.Counter({
    name: 'VIARA_backup_offsite_failures_total',
    help: 'Total failed offsite backup replications',
    registers: [register],
});

const recordBackupSuccess = ({ sizeBytes }) => {
    dbBackupCompleted.set(Date.now() / 1000);
    if (Number.isFinite(sizeBytes)) dbBackupSizeBytes.set(sizeBytes);
};

const recordBackupFailure = () => {
    dbBackupFailuresTotal.inc();
};

const recordOffsiteReplicationSuccess = () => {
    offsiteReplicationCompleted.set(Date.now() / 1000);
};

const recordOffsiteReplicationFailure = () => {
    offsiteReplicationFailuresTotal.inc();
};

const metricsMiddleware = (req, res, next) => {
    incrementActive();
    const start = process.hrtime.bigint();
    res.on('close', () => { if (!res.writableFinished) decrementActive(); });
    res.on('finish', () => {
        decrementActive();
        try {
            const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
            recordHttpMetrics({
                method: req.method,
                route: normalizeRoute(req.path),
                status: res.statusCode,
                durationSeconds: elapsedSeconds,
            });
        } catch (err) {
            logger.warn?.(`metrics middleware failed: ${err.message}`);
        }
    });
    next();
};

module.exports = {
    register,
    metricsMiddleware,
    setDbPool,
    recordBackupSuccess,
    recordBackupFailure,
    recordOffsiteReplicationSuccess,
    recordOffsiteReplicationFailure,
    normalizeRoute,
};
