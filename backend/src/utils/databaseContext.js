'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const storage = new AsyncLocalStorage();
const DEFAULT_ORGANIZATION = '00000000-0000-4000-8000-000000000000';
const serviceActorId = (organizationId = DEFAULT_ORGANIZATION) => {
    const hex = crypto.createHash('md5').update(`VIARA_SERVICE:${organizationId}`).digest('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const serviceContext = () => {
    let organizationId = process.env.ORGANIZATION_ID || DEFAULT_ORGANIZATION;
    try { organizationId = require('../services/licenseService').getLicense()?.organizationId || organizationId; } catch {}
    return { userId: serviceActorId(organizationId), branchId: null, actorKind: 'Service', isOrgAdmin: true };
};
const fromRequest = req => req.user ? {
    userId: req.user.user_id || req.user.userId || req.user.patientId || req.user.doctorId || req.user.doctor_id,
    branchId: req.branchContext?.branchId || null,
    actorKind: ['Patient','Doctor'].includes(req.user.role) ? req.user.role : 'Staff',
    isOrgAdmin: Boolean(req.user.is_org_admin || req.user.role === 'Developer'),
} : null;
const currentContext = () => {
    const value = storage.getStore();
    return value?.request ? fromRequest(value.request) : value?.context || null;
};
const requestContextMiddleware = (req, _res, next) => storage.run({ request: req }, next);
const backgroundPool = pool => new Proxy(pool, { get(target, key) {
    if (['query','connect'].includes(key)) return (...args) => storage.run({ context: serviceContext() }, () => target[key](...args));
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
} });
module.exports = { storage, currentContext, requestContextMiddleware, backgroundPool, serviceContext, serviceActorId };
