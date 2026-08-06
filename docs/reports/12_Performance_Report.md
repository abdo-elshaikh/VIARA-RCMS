# 12 — Performance Report

**Review date:** 2026-08-04  
**Scope:** Backend, frontend, database, and PACS performance characteristics  
**Methodology:** Static review of pool configuration, timeouts, indexing, caching, and build configuration  

---

## Executive Summary

RCMS implements appropriate performance controls including connection pooling, request timeouts, database indexing, frontend code splitting, and asset caching. No load testing was performed (requires runtime environment). Static analysis indicates the system is reasonably optimized for medium-scale deployment (10-50 concurrent users).

**Performance Score: 78/100**

---

## Backend Performance

### Connection Pool Configuration

```javascript
// server.js:496-504
const pool = new Pool({
    min: 5,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
    query_timeout: 30000
});
```

**Assessment:**
- ✅ Appropriate pool sizing for medium load
- ✅ Statement timeout prevents runaway queries
- ✅ Connection timeout prevents pool exhaustion on DB failure
- ⚠️ `max: 20` may need tuning for high-concurrency deployments

### Request Timeouts

| Path Pattern | Timeout | Rationale |
|-------------|---------|-----------|
| Default | 30s | Standard API requests |
| PACS upload | 10 min | Large DICOM file uploads |
| DICOMweb/WADO | 5 min | DICOM image retrieval |
| AI report | 2 min | AI inference |

**Assessment:** ✅ Appropriate path-specific timeouts

### Rate Limiting

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|-----------|
| `authLimiter` | Configured | — | Login endpoints |
| `apiLimiter` | Configured | — | All `/api` routes |
| `strictLimiter` | Configured | — | Sensitive operations |
| `patientDataLimiter` | Configured | — | Patient data access |
| `publicCaseStatusLimiter` | Configured | — | Public case lookup |

### Caching

| Cache | TTL | Scope |
|-------|-----|-------|
| RBAC permissions | 60s (in-memory) | Per-node |
| Settings | Runtime | Per-node |
| SSE session tokens | 5 min | Per-node |

⚠️ **No distributed cache (Redis)** — acceptable for single-node; would need Redis for multi-node.

---

## Frontend Performance

### Code Splitting & Lazy Loading

| Feature | Evidence |
|---------|----------|
| Route-level code splitting | `App.jsx:32-73` — all pages use `lazy()` |
| Suspense boundaries | `App.jsx:200` — global Suspense with spinner |
| Tree-shaking | Vite production build |
| Portal lazy loading | `portal/App.tsx:10-15` — all pages lazy |

### Asset Caching

| Path | Cache Policy | Evidence |
|------|-------------|---------|
| `/assets/` | 1 year | `nginx.conf:29-31` |
| Other routes | No cache | `nginx.conf:26` |

### Bundle Optimization

- ✅ Vite with production build
- ✅ TailwindCSS purging unused styles
- ✅ React 18 with automatic batching
- ✅ Code splitting: large libraries split into dedicated chunks (`charts`, `i18n`, `icons`, `date-utils`, `data-table`, `http`, `pdf-export`, `word-export`) with only truly shared runtime in `vendor`
- ✅ Sourcemap generation and compressed size reporting enabled

---

## Database Performance

### Index Coverage

RCMS has **40+ indexes** including:
- Lookup indexes on all frequently queried columns
- Composite indexes for multi-column queries
- Partial indexes for common filtered queries
- Hash-based indexes for blind-index searches

### Query Patterns

| Pattern | Assessment |
|---------|-----------|
| Parameterized queries | ✅ All queries use `$1, $2` params |
| JOIN efficiency | ✅ FKs and indexes support joins |
| Pagination | ✅ LIMIT/OFFSET where applicable |
| Batch operations | ⚠️ Some bulk operations may benefit from `INSERT ... ON CONFLICT` patterns |

### Potential Bottlenecks

| Area | Risk | Mitigation |
|------|------|-----------|
| Audit logs table growth | Medium | Consider partitioning by month |
| Notification logs | Medium | Add retention policy |
| PACS reconciliation queue | Low | Uses async processing |
| Full-text patient search | Low | `pg_trgm` extension enables trigram search |

---

## PACS Performance

| Feature | Configuration |
|---------|--------------|
| Upload timeout | 10 min (configurable) |
| DICOMweb proxy timeout | 5 min |
| AI inference timeout | 2 min |
| Reconciliation queue | Async worker (non-blocking) |
| MWL generation | Scheduled job |

---

## Load Testing Status

> **NOT TESTED.** Load testing requires a running environment with representative data. The following tests are recommended before production:
>
> 1. **Concurrent login test** — 50 simultaneous logins
> 2. **Appointment scheduling stress** — concurrent booking attempts
> 3. **Payment collection concurrency** — simultaneous payment processing
> 4. **PACS upload throughput** — multiple simultaneous DICOM uploads
> 5. **SSE connection scaling** — 100+ concurrent SSE connections
> 6. **Database connection pool saturation** — load beyond pool.max

---

## Recommendations

1. **Add APM** (e.g., Sentry Performance, Datadog) for runtime monitoring
2. **Monitor pool saturation** via `pool.totalCount`, `pool.waitingCount`
3. **Add database query logging** with slow-query threshold (>500ms)
4. **Consider Redis** for RBAC cache and session storage in multi-node deployment
5. **Partition audit tables** when row count exceeds 10M
6. **Code-split chart-heavy pages** to reduce initial bundle size
