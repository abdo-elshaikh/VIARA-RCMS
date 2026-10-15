const crypto = require('crypto');
const settingsService = require('./settingsService');
const AuditService = require('./auditService');
const { AppError } = require('../middleware/errorHandler');
const { migrateLegacy, publicProjection } = require('../schemas/portalBuilderSchema');

async function legacyPage() {
  const settings = await settingsService.getAll();
  let legacy = {};
  try {
    legacy = JSON.parse(settings['center.homepage_settings'] || '{}') || {};
  } catch {
    /* Empty legacy settings. */
  }
  return migrateLegacy(legacy);
}
async function ensurePage(db) {
  const existing = await db.query('SELECT * FROM portal_page_settings WHERE page_id = 1');
  if (existing.rows.length) return existing.rows[0];
  const page = await legacyPage();
  const result = await db.query(
    'INSERT INTO portal_page_settings (page_id, draft) VALUES (1, $1::jsonb) ON CONFLICT (page_id) DO UPDATE SET page_id = EXCLUDED.page_id RETURNING *',
    [JSON.stringify(page)]
  );
  return result.rows[0];
}
async function readPublic(db, previewToken) {
  if (previewToken) {
    if (!/^[a-f0-9]{64}$/.test(previewToken)) throw new AppError('Invalid preview session', 401);
    const hash = crypto.createHash('sha256').update(previewToken).digest('hex');
    const result = await db.query(
      'SELECT content FROM portal_preview_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [hash]
    );
    if (!result.rows.length) throw new AppError('Preview session expired or invalid', 401);
    return publicProjection(result.rows[0].content);
  }
  let result;
  try {
    result = await db.query(
      'SELECT v.content FROM portal_page_settings p JOIN portal_page_versions v ON v.version_id = p.published_version_id AND v.page_id = p.page_id WHERE p.page_id = 1'
    );
  } catch (error) {
    // Keep the existing public page available during a staged migration rollout.
    if (error.code !== '42P01') throw error;
    return publicProjection(await legacyPage());
  }
  // Until the first publication, preserve the legacy public configuration.
  return result.rows.length
    ? publicProjection(result.rows[0].content)
    : publicProjection(await legacyPage());
}
async function transaction(db, work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function change(db, req, revision, action, work) {
  await ensurePage(db);
  return transaction(db, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM portal_page_settings WHERE page_id = 1 FOR UPDATE'
    );
    const before = rows[0];
    if (before.revision !== revision)
      throw new AppError('The draft changed. Reload before saving or publishing.', 409);
    const result = await work(client, before);
    const auditId = await new AuditService(client).logChange({
      userId: req.user?.user_id,
      // system_logs.resource_id is UUID; the portal settings key is a singleton integer.
      resourceId: null,
      resourceTable: 'portal_page_settings',
      action,
      ipAddress: req.ip,
      httpMethod: req.method,
      requestPath: req.originalUrl,
      previousValue: {
        pageId: 1,
        revision: before.revision,
        publishedVersionId: before.published_version_id,
        page: before.draft,
      },
      newValue: {
        pageId: 1,
        revision: result.revision,
        publishedVersionId: result.published_version_id,
        page: result.draft || before.draft,
      },
    });
    if (!auditId)
      throw new AppError(
        'Unable to record the portal audit event. No changes were committed.',
        503
      );
    return result;
  });
}
async function saveDraft(db, req, input) {
  return change(db, req, input.revision, 'PORTAL_DRAFT_SAVED', async (client) => {
    const result = await client.query(
      'UPDATE portal_page_settings SET draft = $1::jsonb, revision = revision + 1, updated_at = NOW() WHERE page_id = 1 RETURNING *',
      [JSON.stringify(input.page)]
    );
    return result.rows[0];
  });
}
async function publish(db, req, revision) {
  return change(db, req, revision, 'PORTAL_CONTENT_PUBLISHED', async (client, before) => {
    // Revalidate persisted content, including content restored from older versions.
    const { portalPageSchema } = require('../schemas/portalBuilderSchema');
    const page = portalPageSchema.parse(before.draft);
    const version = await client.query(
      'INSERT INTO portal_page_versions (page_id, content, source_revision, published_by) VALUES (1, $1::jsonb, $2, $3) RETURNING version_id',
      [JSON.stringify(page), revision, req.user?.user_id ? String(req.user.user_id) : null]
    );
    const result = await client.query(
      'UPDATE portal_page_settings SET published_version_id = $1, revision = revision + 1, updated_at = NOW() WHERE page_id = 1 RETURNING *',
      [version.rows[0].version_id]
    );
    return result.rows[0];
  });
}
async function restore(db, req, input) {
  return change(db, req, input.revision, 'PORTAL_VERSION_RESTORED', async (client) => {
    const version = await client.query(
      'SELECT content FROM portal_page_versions WHERE version_id = $1 AND page_id = 1',
      [input.versionId]
    );
    if (!version.rows.length) throw new AppError('Version not found', 404);
    const page = migrateLegacy(version.rows[0].content);
    const result = await client.query(
      'UPDATE portal_page_settings SET draft = $1::jsonb, revision = revision + 1, updated_at = NOW() WHERE page_id = 1 RETURNING *',
      [JSON.stringify(page)]
    );
    return result.rows[0];
  });
}
async function preview(db, req, revision) {
  return change(db, req, revision, 'PORTAL_PREVIEW_CREATED', async (client, before) => {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await client.query(
      'DELETE FROM portal_preview_sessions WHERE expires_at <= NOW() OR created_by = $1',
      [String(req.user?.user_id || '')]
    );
    const result = await client.query(
      "INSERT INTO portal_preview_sessions (token_hash, content, revision, expires_at, created_by) VALUES ($1, $2::jsonb, $3, NOW() + INTERVAL '10 minutes', $4) RETURNING expires_at",
      [hash, JSON.stringify(before.draft), revision, String(req.user?.user_id || '')]
    );
    return {
      token,
      expiresAt: result.rows[0].expires_at,
      revision,
      published_version_id: before.published_version_id,
    };
  });
}
module.exports = { ensurePage, readPublic, saveDraft, publish, restore, preview };
