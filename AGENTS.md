# AGENTS.md — RCMS Development Commands

## Quick Reference

| Task | Directory | Command |
|------|-----------|---------|
| Backend tests | `backend/` | `npm run test:ci` |
| Backend typecheck | `backend/` | `npx tsc --noEmit` *(no tsconfig — N/A for plain JS)* |
| Backend lint | `backend/` | `npx eslint .` *(no eslint config — N/A)* |
| Frontend lint | `frontend/` | `npm run lint` |
| Frontend tests | `frontend/` | `npm run test` |
| Portal typecheck | `portal/` | `npm run typecheck` |
| Portal lint | `portal/` | `npm run lint` |
| Portal tests | `portal/` | `npm run test` |
| Database migrations | `database/` | `node migrate.js` |

## Validation Order

1. **Backend**: `cd backend && npm run test:ci`
2. **Frontend**: `cd frontend && npm run lint && npm run test`
3. **Portal**: `cd portal && npm run typecheck && npm run lint`
4. **Database**: `cd database && node migrate.js --dry-run`

## Notes

- Backend is plain JavaScript (no TypeScript). Validation via Jest test suite.
- Frontend is React/JSX. Lint with ESLint.
- Portal is React/TypeScript. Typecheck with `tsc --noEmit`.
- The CI pipeline (`.github/workflows/quality-gates.yml`) runs all of the above plus Docker build/vulns scan.

