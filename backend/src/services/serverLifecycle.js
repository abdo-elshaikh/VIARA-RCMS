const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30000;

const createServerLifecycle = ({ pool, logger, shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS }) => {
    let ready = false;
    let httpServer = null;
    let shutdownPromise = null;
    const startupTimers = new Set();
    const stopCallbacks = [];

    const setHttpServer = (server) => {
        httpServer = server;
    };

    const markReady = () => {
        if (!shutdownPromise) ready = true;
    };

    const isReady = () => ready;

    const trackStartupTimer = (timer) => {
        startupTimers.add(timer);
        return timer;
    };

    const addStopCallback = (callback) => {
        if (typeof callback === 'function') stopCallbacks.push(callback);
        return callback;
    };

    const drainHttpServer = () => {
        if (!httpServer || !httpServer.listening) return Promise.resolve();

        return new Promise((resolve) => {
            let settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(deadline);
                if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
                    logger.error('HTTP server close failed', { error: error.message });
                }
                resolve();
            };
            const deadline = setTimeout(() => {
                logger.warn('HTTP drain deadline reached; closing remaining connections');
                httpServer.closeAllConnections?.();
                finish();
            }, shutdownTimeoutMs);
            deadline.unref?.();

            httpServer.close(finish);
            httpServer.closeIdleConnections?.();
        });
    };

    const shutdown = (signal = 'shutdown') => {
        if (shutdownPromise) return shutdownPromise;

        ready = false;
        shutdownPromise = (async () => {
            logger.info(`${signal} received: starting graceful shutdown`);

            // Start draining first, then prevent every background source from
            // creating more database work while existing requests complete.
            const drainPromise = drainHttpServer();
            for (const timer of startupTimers) clearTimeout(timer);
            startupTimers.clear();

            const stops = stopCallbacks.splice(0).map(async (stop) => {
                try {
                    await stop();
                } catch (error) {
                    logger.error('Background service shutdown failed', { error: error.message });
                }
            });
            await Promise.all(stops);
            await drainPromise;
            await pool.end();
            logger.info('Graceful shutdown complete');
        })();

        return shutdownPromise;
    };

    return {
        addStopCallback,
        isReady,
        markReady,
        setHttpServer,
        shutdown,
        trackStartupTimer,
    };
};

module.exports = { createServerLifecycle, DEFAULT_SHUTDOWN_TIMEOUT_MS };
