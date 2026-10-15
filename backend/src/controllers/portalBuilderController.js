const service = require('../services/portalBuilderService');
const { draftSchema, publishSchema, restoreSchema } = require('../schemas/portalBuilderSchema');
const { AppError } = require('../middleware/errorHandler');
const parse = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new AppError('Invalid portal configuration', 400);
    error.details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw error;
  }
  return result.data;
};
const wrap = (handler) => (db) => async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await handler(db, req));
  } catch (error) {
    next(
      error.code === '42P01'
        ? new AppError('Portal Builder requires database migration 184 before activation.', 503)
        : error
    );
  }
};
module.exports = {
  get: wrap((db) => service.ensurePage(db)),
  save: wrap((db, req) => service.saveDraft(db, req, parse(draftSchema, req.body))),
  publish: wrap((db, req) => service.publish(db, req, parse(publishSchema, req.body).revision)),
  restore: wrap((db, req) => service.restore(db, req, parse(restoreSchema, req.body))),
  preview: wrap((db, req) => service.preview(db, req, parse(publishSchema, req.body).revision)),
  versions: wrap(
    async (db) =>
      (
        await db.query(
          'SELECT version_id, source_revision, published_by, published_at FROM portal_page_versions WHERE page_id = 1 ORDER BY version_id DESC LIMIT 50'
        )
      ).rows
  ),
};
