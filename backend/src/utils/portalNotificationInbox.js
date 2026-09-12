const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toBoundedInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const getPortalNotificationPage = (query = {}) => ({
    limit: toBoundedInteger(query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    offset: toBoundedInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)
});

const inferCategory = (eventType, persona) => {
    const event = String(eventType || '').toUpperCase();
    if (/PAYMENT|INVOICE|BILLING|REFUND|CLAIM/.test(event)) return 'Financial';
    if (/EXAM|REPORT|RESULT|APPOINTMENT|BOOKING|PREP|ORDER/.test(event)) return 'Clinical';
    if (/MESSAGE|CHAT/.test(event)) return 'Operational';
    return persona === 'patient' ? 'Patient' : 'System';
};

const getPortalAction = (row, persona) => {
    const event = String(row.event_type || '').toUpperCase();
    let target = null;

    if (/MESSAGE|CHAT/.test(event)) {
        target = { tab: 'messages', label: 'Open messages' };
    } else if (persona === 'patient' && /PAYMENT|INVOICE|BILLING|REFUND|CLAIM/.test(event)) {
        target = { tab: 'invoices', label: 'View billing' };
    } else if (persona === 'patient' && /DOCUMENT/.test(event)) {
        target = { tab: 'documents', label: 'View documents' };
    } else if (persona === 'patient' && /APPOINTMENT|BOOKING|REQUEST|PREP/.test(event)) {
        target = { tab: 'requests', label: 'View requests' };
    } else if (persona === 'patient' && /EXAM|REPORT|RESULT|STUDY/.test(event)) {
        target = { tab: 'records', label: 'View records' };
    } else if (persona === 'doctor' && /REPORT|RESULT/.test(event)) {
        target = { tab: 'reports', label: 'View reports' };
    } else if (persona === 'doctor' && /EXAM|CASE|APPOINTMENT|BOOKING|STUDY/.test(event)) {
        target = { tab: 'cases', label: 'View cases' };
    } else if (persona === 'doctor' && /ORDER|REQUEST/.test(event)) {
        target = { tab: 'order', label: 'Open order form' };
    }

    if (!target) return null;
    const basePath = persona === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard';
    return {
        type: 'portal_deep_link',
        target: target.tab,
        label: target.label,
        url: `${basePath}?tab=${encodeURIComponent(target.tab)}${row.entity_id ? `&entityId=${encodeURIComponent(row.entity_id)}` : ''}`,
        entityId: row.entity_id || null
    };
};

const mapPortalNotification = (row, persona, decryptStored) => {
    const action = getPortalAction(row, persona);
    return {
        ...row,
        subject: decryptStored(row.subject),
        content: decryptStored(row.content),
        priority: row.priority || 'Normal',
        category: row.category || inferCategory(row.event_type, persona),
        acknowledgement_status: row.acknowledgement_status || null,
        acknowledgement_due_at: row.acknowledgement_due_at || null,
        escalated_at: row.escalated_at || null,
        action,
        action_url: action?.url || null
    };
};

const buildPortalNotificationEnvelope = ({ rows, counts, persona, page, decryptStored }) => {
    const total = Number(counts?.total || 0);
    const unreadCount = Number(counts?.unread_count || 0);
    const nextOffset = page.offset + rows.length;
    return {
        items: rows.map((row) => mapPortalNotification(row, persona, decryptStored)),
        unreadCount,
        pagination: {
            limit: page.limit,
            offset: page.offset,
            total,
            hasMore: nextOffset < total,
            nextOffset: nextOffset < total ? nextOffset : null
        }
    };
};

module.exports = {
    buildPortalNotificationEnvelope,
    getPortalNotificationPage,
    getPortalAction,
    mapPortalNotification
};
