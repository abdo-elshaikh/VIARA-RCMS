const net = require('net');
const { isLocalPostgresActive } = require('../../start-services');

describe('local PostgreSQL readiness detection', () => {
    test('does not treat an arbitrary listener as a ready PostgreSQL database', async () => {
        const server = net.createServer(socket => socket.destroy());
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        const previousDatabaseUrl = process.env.DATABASE_URL;
        process.env.DATABASE_URL = `postgresql://invalid:invalid@127.0.0.1:${port}/VIARA`;

        try {
            await expect(isLocalPostgresActive(port)).resolves.toBe(false);
        } finally {
            if (previousDatabaseUrl === undefined) {
                delete process.env.DATABASE_URL;
            } else {
                process.env.DATABASE_URL = previousDatabaseUrl;
            }
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    });
});
