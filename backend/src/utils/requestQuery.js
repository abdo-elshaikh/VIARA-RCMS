const getRequestQuery = (req) => req.validatedQuery || req.query || {};
module.exports = { getRequestQuery };
