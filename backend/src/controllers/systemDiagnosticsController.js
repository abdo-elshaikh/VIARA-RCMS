const os = require('os');

const getSystemDiagnostics = (db) => async (req, res, next) => {
    try {
        const [databaseTime, userCounts] = await Promise.all([
            db.query('SELECT NOW() AS database_time'),
            db.query(`
                SELECT role::text, COUNT(*)::int AS count
                FROM users
                WHERE is_active = TRUE
                GROUP BY role
                ORDER BY role
            `)
        ]);

        res.json({
            nodeEnv: process.env.NODE_ENV || 'development',
            uptimeSeconds: Math.round(process.uptime()),
            databaseTime: databaseTime.rows[0]?.database_time,
            activeUsersByRole: userCounts.rows,
            backupMode: process.env.BACKUP_MODE || 'postgres',
            hostname: os.hostname(),
            platform: process.platform,
            nodeVersion: process.version
        });
    } catch (error) {
        next(error);
    }
};

const getMigrationStatus = (db) => async (req, res, next) => {
    try {
        const tracked = await db.query(`
            SELECT version, checksum, applied_at
            FROM tracked_schema_migrations
            ORDER BY applied_at DESC
            LIMIT 50
        `).catch(() => ({ rows: [] }));

        const legacy = await db.query(`
            SELECT filename, applied_at
            FROM schema_migrations
            ORDER BY applied_at DESC
            LIMIT 50
        `).catch(() => ({ rows: [] }));

        res.json({
            trackedMigrations: tracked.rows,
            legacyMigrations: legacy.rows
        });
    } catch (error) {
        next(error);
    }
};

const getRuntimeStatus = () => async (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external
        },
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg()
    });
};

module.exports = {
    getSystemDiagnostics,
    getMigrationStatus,
    getRuntimeStatus
};
