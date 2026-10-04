jest.mock('../src/services/settingsService', () => ({
  getAll: jest.fn().mockResolvedValue({}),
}));

const {
  sectionIds,
  portalPageSchema,
  migrateLegacy,
  publicProjection,
} = require('../src/schemas/portalBuilderSchema');
const service = require('../src/services/portalBuilderService');
const controller = require('../src/controllers/portalBuilderController');

const localized = (value = '') => ({ ar: value, en: value });

const validPage = (overrides = {}) => ({
  schemaVersion: 2,
  enabled: true,
  templateId: 'clinical',
  theme: { accentColor: '', density: 'comfortable' },
  hero: { title: localized(), subtitle: localized(), imageUrl: '' },
  sections: sectionIds.map((id) => ({ id, enabled: true })),
  announcement: { enabled: false, text: localized(), url: '' },
  seo: { title: localized(), description: localized(), ogImageUrl: '' },
  faqs: [],
  testimonials: [],
  audienceOverrides: {},
  ...overrides,
});

const createClient = (before, extra = {}) => ({
  query: jest.fn().mockImplementation(async (sql, values) => {
    const text = String(sql);
    if (
      text === 'BEGIN' ||
      text === 'COMMIT' ||
      text === 'ROLLBACK' ||
      text.startsWith('SAVEPOINT') ||
      text.startsWith('RELEASE')
    ) {
      return { rows: [] };
    }
    if (text.includes('FROM portal_page_settings') && text.includes('FOR UPDATE'))
      return { rows: [before] };
    if (text.includes('UPDATE portal_page_settings'))
      return {
        rows: [
          {
            revision: before.revision + 1,
            published_version_id: text.includes('SET published_version_id')
              ? values[0]
              : before.published_version_id,
            draft: text.includes('SET draft') ? JSON.parse(values[0]) : before.draft,
          },
        ],
      };
    if (text.includes('INSERT INTO portal_page_versions')) return { rows: [{ version_id: 10 }] };
    if (/INSERT INTO\s+system_logs/.test(text)) return { rows: [{ log_id: 'audit-1' }] };
    if (typeof extra[text] !== 'undefined') return extra[text];
    return { rows: [] };
  }),
  release: jest.fn(),
});

const createDb = (client) => ({
  query: jest.fn().mockImplementation(async (sql) => {
    const text = String(sql);
    if (text.includes('SELECT * FROM portal_page_settings')) {
      return {
        rows: [{ page_id: 1, draft: validPage(), revision: 0, published_version_id: null }],
      };
    }
    return { rows: [] };
  }),
  connect: jest.fn().mockResolvedValue(client),
});

const request = (overrides = {}) => ({
  user: { user_id: 'user-1' },
  ip: '127.0.0.1',
  method: 'PUT',
  originalUrl: '/api/settings/portal/draft',
  ...overrides,
});

describe('portal builder schema', () => {
  test('legacy "doctor" template maps to the professional template', () => {
    const migrated = migrateLegacy({ template: 'doctor', heroTitle: 'Legacy title' });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.templateId).toBe('professional');
    expect(migrated.hero.title).toEqual({ ar: '', en: 'Legacy title' });
  });

  test('legacy sections are reordered and completed to the full section set', () => {
    const migrated = migrateLegacy({
      sections: [
        { id: 'faq', order: 1 },
        { id: 'hero', order: 2 },
      ],
    });
    expect(migrated.sections.map((item) => item.id)).toEqual(
      expect.arrayContaining([...sectionIds])
    );
    expect(migrated.sections[0].id).toBe('faq');
    expect(migrated.sections[1].id).toBe('hero');
  });

  test('rejects a section list that is missing ids', () => {
    const result = portalPageSchema.safeParse(
      validPage({ sections: [{ id: 'hero', enabled: true }] })
    );
    expect(result.success).toBe(false);
  });

  test('rejects an unknown template id', () => {
    const result = portalPageSchema.safeParse(validPage({ templateId: 'custom' }));
    expect(result.success).toBe(false);
  });
  test('accepts complete audience layouts and safely projects header and component copy', () => {
    const page = validPage({
      audienceOverrides: {
        doctors: {
          layout: { container: 'boxed', spacing: 'compact', heroHeight: 'compact', cardStyle: 'outlined', navStyle: 'solid' },
          navigation: { links: [{ id: 'doctor', label: { ar: 'دخول الطبيب', en: 'Doctor sign in' }, href: '/doctor/login' }] },
          footer: { note: { ar: 'تواصل معنا', en: 'Contact us' }, showContact: false },
          sections: sectionIds.map(id => ({ id, enabled: id !== 'services', heading: { ar: 'عنوان', en: 'Heading' } })),
        },
      },
    });
    const projection = publicProjection(page);
    expect(projection.audience.doctors.layout.container).toBe('boxed');
    expect(projection.audience.doctors.navigation.links[0]).toMatchObject({ href: '/doctor/login', labelAr: 'دخول الطبيب' });
    expect(projection.audience.doctors.footer.showContact).toBe(false);
    expect(projection.audience.doctors.sections.some(section => section.id === 'services')).toBe(false);
    expect(projection.audience.doctors.sections[0].heading).toBe('Heading');
  });
  test.each(['javascript:alert(1)', '//untrusted.example', 'data:text/html,unsafe'])('rejects unsafe header destination %s', href => {
    const result = portalPageSchema.safeParse(validPage({ navigation: { links: [{ id: 'bad', label: localized('Link'), href }] } }));
    expect(result.success).toBe(false);
  });
});

describe('public projection', () => {
  test('flattens hero copy and aliases professional to doctor without exposing revision metadata', () => {
    const projection = publicProjection(
      validPage({
        templateId: 'professional',
        hero: { title: { ar: 'ع', en: 'EN' }, subtitle: { ar: 'وصف', en: 'desc' }, imageUrl: '' },
      })
    );
    expect(projection.template).toBe('doctor');
    expect(projection.heroTitle).toBe('EN');
    expect(projection.heroTitleAr).toBe('ع');
    expect(projection).not.toHaveProperty('revision');
    expect(projection.sections[0]).toHaveProperty('order', 1);
  });
});

describe('portal builder service', () => {
  test('rejects an invalid preview token before querying the database', async () => {
    const db = { query: jest.fn(), connect: jest.fn() };
    await expect(service.readPublic(db, 'not-a-valid-token')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('projects legacy public content until the first publication exists', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn() };
    await expect(service.readPublic(db)).resolves.toMatchObject({
      template: 'clinical',
      schemaVersion: 2,
      enabled: true,
    });
  });

  test('saveDraft locks the row, bumps the revision and audits the change', async () => {
    const client = createClient({ revision: 0, published_version_id: null, draft: validPage() });
    const db = createDb(client);

    const result = await service.saveDraft(db, request(), {
      revision: 0,
      page: validPage({ enabled: false }),
    });

    const locked = client.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('FOR UPDATE'));
    expect(locked).toBeDefined();
    expect(result.revision).toBe(1);
    const audit = client.query.mock.calls
      .map((call) => String(call[0]))
      .some((sql) => sql.includes('audit_logs') || sql.includes('INSERT INTO'));
    expect(audit).toBe(true);
  });

  test('saveDraft refuses a stale revision with a 409 conflict', async () => {
    const client = createClient({ revision: 5, published_version_id: 2, draft: validPage() });
    const db = createDb(client);

    await expect(
      service.saveDraft(db, request(), { revision: 4, page: validPage() })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('publish writes an immutable version and points the published pointer at it', async () => {
    const client = createClient({ revision: 3, published_version_id: null, draft: validPage() });
    const db = createDb(client);

    const result = await service.publish(
      db,
      request({ method: 'POST', originalUrl: '/api/settings/portal/publish' }),
      3
    );

    expect(result.published_version_id).toBe(10);
    const insertedVersion = client.query.mock.calls
      .map((call) => String(call[0]))
      .some((sql) => sql.includes('INSERT INTO portal_page_versions'));
    expect(insertedVersion).toBe(true);
  });
});

describe('portal builder controller', () => {
  test('returns a validation error with field details for an invalid draft', async () => {
    const next = jest.fn();
    const res = { set: jest.fn(), json: jest.fn() };
    const db = { query: jest.fn(), connect: jest.fn() };

    await controller.save(db)(
      request({ body: { revision: 0, page: { schemaVersion: 1 } } }),
      res,
      next
    );

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    expect(Array.isArray(next.mock.calls[0][0].details)).toBe(true);
  });
});
