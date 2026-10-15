'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const root = process.cwd();
require(path.join(root, 'backend/tests/setupEnv.js'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const loggerPath = require.resolve(path.join(root, 'backend/src/config/logger.js'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true,
  exports: Object.fromEntries(['info','warn','error','debug','log'].map(key => [key, () => {}])) };
const listeners = [];
(async () => {
  const effectiveRole = require(path.join(root, 'backend/src/utils/effectiveRole.js'));
  const roles = require(path.join(root, 'backend/src/utils/roleGovernance.js'));
  const { authorizeRole } = require(path.join(root, 'backend/src/middleware/authMiddleware.js'));
  const fallbackReq = { user: { role: 'Admin', is_org_admin: false }, branchContext: {
    branchId: null, branches: [{ branch_role: 'Receptionist' }, { branch_role: 'Nurse' }] } };
  let adminGuardAllowed = false;
  authorizeRole(['Admin'])(fallbackReq, { status() { return this; }, json() {} }, () => { adminGuardAllowed = true; });
  const result = {
    syntheticOnly: true, noNetworkOrDatabaseConnections: true,
    optionalBranchRole: { actualRole: effectiveRole(fallbackReq), adminGuardAllowed },
    branchAdminGlobalPolicy: { canManageNursePolicy: roles.canManageRolePermissions({
      role: 'Admin', identity_role: 'Receptionist', is_org_admin: false
    }, 'Nurse') }
  };
  const policy = require(path.join(root, 'backend/src/services/pacsAccessPolicyService.js'));
  let scopeDbQueries = 0;
  const scopeDb = { query: async () => { scopeDbQueries++; return { rows: [] }; } };
  const emergencyReq = { method: 'GET', query: {}, authType: 'jwt',
    branchContext: { branchId: 'synthetic-branch-A', isEmergency: true },
    user: { user_id: 'synthetic-user', role: 'EmergencyClinicalViewer',
      emergencyAccessId: 'synthetic-grant', breakGlassExpiry: Date.now() + 60000,
      elevatedPermissions: ['VIEW_PACS_IMAGES'], emergencyTargetBranchId: 'synthetic-branch-A',
      emergencyTargetResourceId: 'synthetic-granted-exam' } };
  let unfilteredBrowseAllowed = false, unindexedOtherStudyAllowed = false;
  await policy.assertDicomWebStudyScope(scopeDb, emergencyReq, '/dicom-web/studies')
    .then(() => { unfilteredBrowseAllowed = true; })
    .catch(() => { unfilteredBrowseAllowed = false; });
  await policy.assertDicomWebStudyScope(scopeDb, emergencyReq, '/dicom-web/studies/9.9.9/metadata')
    .then(() => { unindexedOtherStudyAllowed = true; })
    .catch(() => { unindexedOtherStudyAllowed = false; });
  result.emergencyPacsScope = { unfilteredBrowseAllowed, unindexedOtherStudyAllowed, scopeDbQueries,
    note: 'Policy-level proof; no Orthanc query or assertion about live patient data.' };
  const realtime = require(path.join(root, 'backend/src/services/realtimeService.js'));
  const connect = user => {
    const req = new EventEmitter();
    req.query = { token: realtime.createSseSession(user) }; req.headers = {};
    const res = new EventEmitter(), events = [];
    Object.assign(res, { writableEnded: false, destroyed: false, writeHead() {},
      write(chunk) { events.push(JSON.parse(chunk.trim().replace(/^data: /, ''))); },
      status() { return this; }, json() {} });
    realtime.registerClient(req, res); listeners.push(req); return events;
  };
  const eventsA = connect({ user_id: 'synthetic-A', role: 'Admin', branch_id: 'A',
    branchIds: ['A'], organization_id: 'ORG-A', session_id: 'SESSION-A' });
  const eventsB = connect({ user_id: 'synthetic-B', role: 'Admin', branch_id: 'B',
    branchIds: ['B'], organization_id: 'ORG-B', session_id: 'SESSION-B' });
  let identityKeys = [];
  realtime.broadcastToStaffMatching(identity => {
    identityKeys = Object.keys(identity);
    return Array.isArray(identity.branchIds) && identity.branchIds.includes('A');
  }, 'SYNTHETIC_CHANNEL_A', { branchId: 'A' });
  realtime.sendToRole('Admin', 'SYNTHETIC_NOTIFICATION_B', {
    branch_id: 'B', organization_id: 'ORG-B', content: 'SYNTHETIC ONLY'
  });
  result.realtime = { identityKeys,
    branchAChannelReachedA: eventsA.some(e => e.event === 'SYNTHETIC_CHANNEL_A'),
    branchBNotificationReachedA: eventsA.some(e => e.event === 'SYNTHETIC_NOTIFICATION_B'),
    branchBNotificationReachedB: eventsB.some(e => e.event === 'SYNTHETIC_NOTIFICATION_B') };
  listeners.forEach(req => req.emit('close'));
  const notification = require(path.join(root, 'backend/src/services/notificationService.js'));
  const notificationStatements = [];
  const db = { query: async (sql, args) => {
    notificationStatements.push(String(sql));
    return { rows: String(sql).includes('INSERT INTO notifications') ? [{ notification_id: 'synthetic-id' }] : [] };
  }};
  const saved = await notification.sendInApp('Admin', 'Synthetic', 'Synthetic only', db, {
    branchId: 'B', organizationId: 'ORG-B', audienceType: 'Role', audienceRole: 'Admin'
  });
  result.notificationPersistence = { success: saved.success,
    insertIncludesBranchId: notificationStatements.some(sql => /INSERT INTO notifications[\s\S]*branch_id/.test(sql)),
    insertIncludesOrganizationId: notificationStatements.some(sql => /INSERT INTO notifications[\s\S]*organization_id/.test(sql)) };
  // Actual DICOMweb controller with only archive transport and side effects stubbed.
  const fakeModule = (relative, exports) => {
    const modulePath = require.resolve(path.join(root, relative));
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  };
  const forwarded = [], audits = [];
  fakeModule('backend/src/services/pacsDicomWebService.js', {
    proxyToOrthanc: async (req, res, subPath) => { forwarded.push({ subPath, query: req.query, branchId: req.branchContext.branchId }); },
    getOrthancUrl: async () => 'http://synthetic.invalid', getOrthancAuthHeader: async () => 'synthetic'
  });
  const reconcile = require(path.join(root, 'backend/src/services/pacsReconcileService.js'));
  fakeModule('backend/src/services/pacsReconcileService.js', { ...reconcile, writeAudit: async (_db, audit) => { audits.push(audit.eventType); } });
  fakeModule('backend/src/services/notificationJobService.js', { triggerEventForRole: async () => {} });
  const { dicomWebProxy } = require(path.join(root, 'backend/src/controllers/pacsController.js'));
  const controllerQueries = [];
  const controllerDb = { query: async sql => { controllerQueries.push(String(sql)); return { rows: [] }; } };
  const controllerErrors = [];
  for (const suffix of ['/studies', '/studies/9.9.9/metadata']) {
    const req = { ...emergencyReq, headers: {}, params: {0: 'dicom-web', 1: suffix},
      originalUrl: '/api/pacs/dicom-web' + suffix, setTimeout() {} };
    await dicomWebProxy(controllerDb)(req, { setTimeout() {}, setHeader() {} }, error => { controllerErrors.push(error.message); });
  }
  result.emergencyPacsController = { forwarded, errors: controllerErrors, audits,
    examinationAuthorizationQueries: controllerQueries.filter(sql => sql.includes('FROM examinations')).length,
    coldAvailabilityQueries: controllerQueries.filter(sql => sql.includes('FROM pacs_instances')).length };

  // Actual viewer authentication -> renewal -> authentication with a synthetic authoritative DB.
  const jwt = require(path.join(root, 'backend/node_modules/jsonwebtoken'));
  const auth = require(path.join(root, 'backend/src/middleware/authMiddleware.js'));
  const { renewViewerSession } = require(path.join(root, 'backend/src/controllers/pacsMeasurementsController.js'));
  const makeResponse = () => ({ statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    set() { return this; }, json(payload) { this.payload = payload; return this; } });
  const org = '00000000-0000-4000-8000-000000000000';
  const branchA = '00000000-0000-4000-8000-000000000001', branchB = '00000000-0000-4000-8000-000000000002';
  result.viewerRenewal = [];
  for (const [identityRole, multipleBranches] of [['Technician', false], ['Radiologist', true]]) {
    const owner = { role: identityRole, current_session_id: 'synthetic-session', is_active: true,
      must_change_password: false, organization_id: org, is_org_admin: false, is_service_account: false };
    const members = (multipleBranches ? [branchA, branchB] : [branchA]).map(id => ({
      id, organization_id: org, branch_role: 'Radiologist', is_default: false
    }));
    auth.configureAuthDatabase({ query: async sql => ({ rows: String(sql).includes('FROM user_branch_memberships') ? members : [owner] }) });
    const token = jwt.sign({ user_id: 'synthetic-reader', session_id: 'synthetic-session', role: identityRole,
      scope: 'pacs-viewer', branch_id: branchA, study_instance_uids: ['1.2.3'],
      parent_session_expires_at: Math.floor(Date.now()/1000) + 1800 }, process.env.JWT_SECRET, { expiresIn: 600 });
    const req = { headers: { authorization: 'Bearer ' + token }, method: 'POST', query: {}, body: {},
      originalUrl: '/api/pacs/viewer-renew' };
    let initialAccepted = false;
    await auth.authenticateDicomWeb(req, makeResponse(), () => { initialAccepted = true; });
    const renewRes = makeResponse();
    await renewViewerSession()(req, renewRes, error => { throw error; });
    const renewed = jwt.verify(renewRes.payload.viewerToken, process.env.JWT_SECRET);
    const afterRes = makeResponse(); let afterAccepted = false;
    await auth.authenticateDicomWeb({ headers: { authorization: 'Bearer ' + renewRes.payload.viewerToken },
      method: 'GET', query: {}, originalUrl: '/api/pacs/dicom-web/studies/1.2.3/metadata' },
      afterRes, () => { afterAccepted = true; });
    result.viewerRenewal.push({ identityRole, branchRole: req.user.role, multipleBranches, initialAccepted,
      renewedRole: renewed.role, retainsBranchId: Boolean(renewed.branch_id),
      afterAccepted, afterStatus: afterRes.statusCode, afterCode: afterRes.payload?.code });
  }
  auth.configureAuthDatabase(undefined);

  const output = path.join(root, 'docs/audit-evidence/release-readiness-2026-10-14/security-pacs-probes.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { listeners.forEach(req => req.emit('close')); console.error(error.message); process.exitCode = 1; });
