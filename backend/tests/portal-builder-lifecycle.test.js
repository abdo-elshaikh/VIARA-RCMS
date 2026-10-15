jest.mock('../src/services/settingsService', () => ({ getAll: jest.fn() }));
jest.mock('../src/services/auditService', () =>
  jest.fn().mockImplementation(() => ({ logChange: mockAudit }))
);
const crypto = require('crypto');
const settings = require('../src/services/settingsService');
const service = require('../src/services/portalBuilderService');
const { migrateLegacy, portalPageSchema } = require('../src/schemas/portalBuilderSchema');
const mockAudit = jest.fn();
const request = {
  user: { user_id: 'admin' },
  method: 'PUT',
  originalUrl: '/settings/portal/draft',
  ip: '127.0.0.1',
};
const page = () => migrateLegacy({ heroTitle: 'Original' });
function pool() {
  const record = { page_id: 1, revision: 3, draft: page(), published_version_id: 7 };
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, args) => {
      if (sql.includes('FOR UPDATE')) return { rows: [record] };
      if (sql.startsWith('INSERT INTO portal_page_versions')) return { rows: [{ version_id: 8 }] };
      if (sql.includes('SET draft ='))
        return { rows: [{ ...record, revision: 4, draft: JSON.parse(args[0]) }] };
      if (sql.includes('SET published_version_id'))
        return { rows: [{ ...record, revision: 4, published_version_id: args[0] }] };
      return { rows: [] };
    }),
  };
  return {
    client,
    query: jest.fn().mockResolvedValue({ rows: [record] }),
    connect: jest.fn().mockResolvedValue(client),
  };
}
describe('portal builder publication isolation', () => {
  beforeEach(() => {
    mockAudit.mockResolvedValue('audit-1');
    settings.getAll.mockResolvedValue({
      'center.homepage_settings': JSON.stringify({
        heroTitle: 'Legacy',
        internalSecret: 'never public',
      }),
    });
  });
  test('rejects executable and protocol-relative URLs, duplicate sections and unknown fields', () => {
    for (const url of [
      'javascript:alert(1)',
      '//evil.example',
      '/\\evil.example',
      'https://user:password@example.com',
    ]) {
      const value = page();
      value.announcement.url = url;
      expect(portalPageSchema.safeParse(value).success).toBe(false);
    }
    const duplicate = page();
    duplicate.sections[1].id = 'hero';
    expect(portalPageSchema.safeParse(duplicate).success).toBe(false);
    expect(portalPageSchema.safeParse({ ...page(), internalSecret: 'unexpected' }).success).toBe(
      false
    );
  });
  test('public reads select published snapshots without selecting draft data', async () => {
    const snapshot = page();
    snapshot.hero.title.en = 'Published';
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ content: snapshot }] }) };
    expect((await service.readPublic(db)).heroTitle).toBe('Published');
    expect(db.query.mock.calls[0][0]).toContain('p.published_version_id');
    expect(db.query.mock.calls[0][0]).not.toContain('p.draft');
  });
  test('legacy fallback strips unexpected fields', async () => {
    const result = await service.readPublic({ query: jest.fn().mockResolvedValue({ rows: [] }) });
    expect(result.heroTitle).toBe('Legacy');
    expect(result.internalSecret).toBeUndefined();
  });
  test('public legacy content remains available before the portal migration is applied', async () => {
    const db = {
      query: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Missing portal table'), { code: '42P01' })),
    };
    expect((await service.readPublic(db)).heroTitle).toBe('Legacy');
  });
  test('preview verifies a hash and an expiry and never falls back to public on an invalid token', async () => {
    const token = 'a'.repeat(64);
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ content: page() }] }) };
    await service.readPublic(db, token);
    expect(db.query.mock.calls[0][1]).toEqual([
      crypto.createHash('sha256').update(token).digest('hex'),
    ]);
    expect(db.query.mock.calls[0][0]).toContain('expires_at > NOW()');
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.readPublic(db, token)).rejects.toMatchObject({ statusCode: 401 });
  });
  test('draft changes retain the published pointer and audit before/after content', async () => {
    const db = pool();
    const next = page();
    next.hero.title.en = 'Draft';
    const result = await service.saveDraft(db, request, { revision: 3, page: next });
    expect(result.published_version_id).toBe(7);
    expect(
      db.client.query.mock.calls.some((call) => call[0].includes('SET published_version_id'))
    ).toBe(false);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        previousValue: expect.objectContaining({ revision: 3 }),
        newValue: expect.objectContaining({ revision: 4, page: next }),
      })
    );
  });
  test('audit persistence failure rolls back content changes', async () => {
    mockAudit.mockResolvedValue(null);
    const db = pool();
    await expect(
      service.saveDraft(db, request, { revision: 3, page: page() })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(db.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(db.client.query.mock.calls.some((call) => call[0] === 'COMMIT')).toBe(false);
  });
  test('publication database failure rolls back the snapshot and pointer together', async () => {
    const db = pool();
    const query = db.client.query;
    db.client.query = jest.fn(async (...args) => {
      if (args[0].includes('SET published_version_id')) throw new Error('Unavailable');
      return query(...args);
    });
    await expect(service.publish(db, request, 3)).rejects.toThrow('Unavailable');
    expect(db.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(db.client.release).toHaveBeenCalled();
  });
  test('stale revisions are rejected before any write', async () => {
    const db = pool();
    await expect(
      service.saveDraft(db, request, { revision: 2, page: page() })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.client.query.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SELECT * FROM portal_page_settings WHERE page_id = 1 FOR UPDATE',
      'ROLLBACK',
    ]);
  });
});
