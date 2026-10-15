/**
 * Shared pagination utility for API list endpoints.
 * Prevents unbounded result sets that can cause OOM under load.
 */

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_LIMIT = 500;

/**
 * Parses and validates pagination parameters from a query string.
 * Supports both ?page=N (1-based) and ?offset=N styles.
 * @param {object} query - Express req.query
 * @param {object} options - { defaultLimit, maxLimit }
 * @returns {{ limit: number, offset: number, page: number }}
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

    // Support ?page=N (1-based) as primary pagination style.
    // Fall back to ?offset=N for backward compatibility.
    let offset;
    const rawPage = parseInt(query.page, 10);
    if (!isNaN(rawPage) && rawPage >= 1) {
        offset = (rawPage - 1) * limit;
    } else {
        offset = parseInt(query.offset, 10);
        if (isNaN(offset) || offset < 0) {
            offset = 0;
        }
    }

    const page = Math.floor(offset / limit) + 1;

    return { limit, offset, page };
}

module.exports = { getPagination, DEFAULT_LIMIT, DEFAULT_MAX_LIMIT };
