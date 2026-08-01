const { createServerLifecycle } = require('../src/services/serverLifecycle');

describe('server lifecycle', () => {
    const createLogger = () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    });

    it('marks not-ready, stops workers, drains HTTP, and closes the pool once', async () => {
        let finishDrain;
        const server = {
            listening: true,
            close: jest.fn((callback) => { finishDrain = callback; }),
            closeIdleConnections: jest.fn(),
            closeAllConnections: jest.fn(),
        };
        const pool = { end: jest.fn().mockResolvedValue() };
        const stopWorker = jest.fn();
        const lifecycle = createServerLifecycle({ pool, logger: createLogger() });
        lifecycle.setHttpServer(server);
        lifecycle.addStopCallback(stopWorker);
        lifecycle.markReady();

        expect(lifecycle.isReady()).toBe(true);
        const firstShutdown = lifecycle.shutdown('SIGTERM');
        const secondShutdown = lifecycle.shutdown('SIGINT');

        expect(secondShutdown).toBe(firstShutdown);
        expect(lifecycle.isReady()).toBe(false);
        expect(server.close).toHaveBeenCalledTimes(1);
        expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(stopWorker).toHaveBeenCalledTimes(1);
        expect(pool.end).not.toHaveBeenCalled();

        finishDrain();
        await firstShutdown;

        expect(pool.end).toHaveBeenCalledTimes(1);
    });

    it('forces remaining connections closed when the drain deadline expires', async () => {
        jest.useFakeTimers();
        const server = {
            listening: true,
            close: jest.fn(),
            closeIdleConnections: jest.fn(),
            closeAllConnections: jest.fn(),
        };
        const pool = { end: jest.fn().mockResolvedValue() };
        const lifecycle = createServerLifecycle({
            pool,
            logger: createLogger(),
            shutdownTimeoutMs: 100,
        });
        lifecycle.setHttpServer(server);

        const shutdown = lifecycle.shutdown();
        await jest.advanceTimersByTimeAsync(100);
        await shutdown;

        expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
        expect(pool.end).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });
});
