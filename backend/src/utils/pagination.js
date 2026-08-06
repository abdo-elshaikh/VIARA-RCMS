/**
 * Shared pagination utility for API list endpoints.
 * Prevents unbounded result sets that can cause OOM under load.
 */

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_LIMIT = 500;

/**
 * Parses and validates pagination parameters from a query string.
 * @param {object} query - Express req.query
 * @param {object} options - { defaultLimit, maxLimit }
 * @returns {{ limit: number, offset: number }}
 * @throws {Error} if limit exceeds maxLimit or parameters are invalid
 */
function getPagination(query, options = {}) {
    const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
    const maxLimit = options.maxLimit || DEFAULT_MAX_LIMIT;

    let limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1) {
        limit = defaultLimit;
    }
    if (limit > maxLimit) {
        limit = maxLimit;
    }

    let offset = parseInt(query.offset, 10);
    if (isNaN(offset) || offset < 0) {
        offset = 0;
    }

    return { limit, offset };
}

module.exports = { getPagination, DEFAULT_LIMIT, DEFAULT_MAX_LIMIT };
