jest.mock(
  '../src/controllers/settingsController',
  () => new Proxy({}, { get: () => () => (_req, res) => res.json({ public: true }) })
);
jest.mock('../src/controllers/portalBuilderController', () =>
  Object.fromEntries(
    ['get', 'save', 'publish', 'restore', 'preview', 'versions'].map((name) => [
      name,
      () => (_req, res) => res.json({ ok: true }),
    ])
  )
);
jest.mock('../src/services/securityEventService', () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/services/notificationJobService', () => ({
  triggerEventForRole: jest.fn().mockResolvedValue(),
}));
const express = require('express');
const supertest = require('supertest');
const settingsRoutes = require('../src/routes/settingsRoutes');
const { authorizeRole } = require('../src/middleware/authMiddleware');
const paths = [
  ['get', '/portal'],
  ['put', '/portal/draft'],
  ['post', '/portal/publish'],
  ['post', '/portal/restore'],
  ['post', '/portal/preview-session'],
  ['get', '/portal/versions'],
];
function app(granted = false) {
  const db = { query: jest.fn().mockResolvedValue({ rows: granted ? [{ allowed: 1 }] : [] }) };
  const server = express();
  server.use(express.json());
  server.use(
    '/settings',
    settingsRoutes(
      db,
      (req, res, next) => {
        const role = req.get('X-Test-Role');
        if (!role) return res.status(401).json({ error: 'Unauthorized' });
        req.user = { role, user_id: 'test-user' };
        next();
      },
      authorizeRole
    )
  );
  server.use((error, _req, res, _next) =>
    res.status(error.statusCode || 500).json({ error: error.message })
  );
  return { server, db };
}
describe('Portal Builder route authorization', () => {
  test.each(paths)('%s %s refuses anonymous and portal account users', async (method, path) => {
    const { server, db } = app(true);
    expect((await supertest(server)[method]('/settings' + path)).status).toBe(401);
    expect(
      (
        await supertest(server)
          [method]('/settings' + path)
          .set('X-Test-Role', 'Doctor')
      ).status
    ).toBe(403);
    expect(
      (
        await supertest(server)
          [method]('/settings' + path)
          .set('X-Test-Role', 'Patient')
      ).status
    ).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  test.each(paths)('%s %s checks Admin permission in the database', async (method, path) => {
    const denied = app(false);
    expect(
      (
        await supertest(denied.server)
          [method]('/settings' + path)
          .set('X-Test-Role', 'Admin')
      ).status
    ).toBe(403);
    const allowed = app(true);
    expect(
      (
        await supertest(allowed.server)
          [method]('/settings' + path)
          .set('X-Test-Role', 'Admin')
      ).status
    ).toBe(200);
    expect(allowed.db.query.mock.calls[0][1]).toEqual(['Admin', 'MANAGE_SETTINGS']);
  });
  test('Developer uses the existing technical authorization bypass', async () => {
    const { server, db } = app(false);
    expect(
      (await supertest(server).get('/settings/portal').set('X-Test-Role', 'Developer')).status
    ).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
  });
  test('published homepage remains publicly accessible', async () => {
    const { server } = app();
    expect((await supertest(server).get('/settings/public/home')).status).toBe(200);
  });
});
