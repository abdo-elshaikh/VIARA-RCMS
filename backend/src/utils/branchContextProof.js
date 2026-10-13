'use strict';
const crypto = require('crypto');
const getContextKey = () => {
    const secret = process.env.BRANCH_CONTEXT_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || /^(replace[_ -]|change[_ -]?me|placeholder)/i.test(secret)) throw new Error('A strong branch context signing secret is required');
    return crypto.createHash('sha256').update(`VIARA_BRANCH_CONTEXT_V1:${secret}`).digest();
};
const signBranchContext = (branchId, userId, expires = Math.floor(Date.now() / 1000) + 120, actorKind = 'Staff') => ({
    expires,
    signature: crypto.createHmac('sha256', getContextKey()).update(`${branchId || ''}|${userId || ''}|${expires}|${actorKind}`).digest('hex'),
});
module.exports = { getContextKey, signBranchContext };
