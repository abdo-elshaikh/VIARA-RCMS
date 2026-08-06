# AI Agent Prompt: Complete Production Readiness Review & Generate All Required Reports

Act as a team of senior experts including:

- Software Architect
- Principal Backend Engineer
- Principal Frontend Engineer
- UX/UI Designer
- QA Lead
- Security Engineer
- DevOps Engineer
- Database Architect
- Performance Engineer
- Accessibility Specialist
- Product Owner
- Business Analyst
- Clinical Workflow Reviewer (if applicable)
- Technical Writer

Your objective is **not only to review the software**, but also to complete all missing verification activities, resolve safe issues where possible, identify remaining risks, and generate a complete set of professional deployment reports.

This is a **production readiness assessment**, not a simple code review.

# Phase 1 - Understand the Existing Review

Before starting:

1. Read every existing review report.
2. Extract:
   - Blockers
   - Critical findings
   - High findings
   - Medium findings
   - Low findings
   - Accepted risks
   - Untested areas
   - Missing evidence
3. Verify whether each finding is:
   - Fixed
   - Partially fixed
   - Still reproducible
   - No longer applicable
4. Update the status with evidence.

Do not duplicate findings that have already been resolved.

# Phase 2 - Review Everything Again

Perform a complete review of the entire software.

Inspect:

- Frontend
- Backend
- APIs
- Database
- Authentication
- Authorization
- File uploads
- Notifications
- Background jobs
- Docker
- Infrastructure
- Environment configuration
- Logging
- Monitoring
- Security
- UX
- Performance
- Accessibility
- Localization
- RTL
- Dark mode
- AI modules
- Third-party integrations

Never assume previous reports are correct.

Verify everything independently.

# Phase 3 - Complete Missing Reviews

Complete every review that has not yet been performed.

This includes:

## Functional Review

Verify:

- Requirements
- User stories
- Business rules
- Acceptance criteria
- Feature completeness
- Regression

## Business Logic Review

Review every workflow.

Examples:

- Login
- Registration
- Password reset
- Patient registration
- Appointment
- Orders
- DICOM upload
- PACS
- AI processing
- Report writing
- Report approval
- Billing
- Refund
- Claims
- Inventory
- Notifications
- User management

For every workflow verify:

- Preconditions
- State transitions
- Permissions
- Validation
- Database consistency
- Concurrency
- Failure handling
- Rollback
- Audit logging

## UX Review

Review every page.

Check:

- Navigation
- Information hierarchy
- Layout
- Consistency
- Forms
- Tables
- Feedback
- Loading
- Empty states
- Error states
- Responsive behavior
- Accessibility
- Mobile usability
- Dark mode
- Light mode
- RTL
- Localization

Measure task completion efficiency rather than visual appearance alone.

## Design System Review

Review:

- Components
- Typography
- Colors
- Spacing
- Icons
- Shadows
- Buttons
- Cards
- Tables
- Inputs
- Dialogs
- Theme consistency

Identify duplicated patterns.

Recommend reusable design tokens.

## Accessibility Review

Verify WCAG 2.1 AA.

Include:

- Keyboard navigation
- Focus
- Screen reader
- Contrast
- Labels
- Semantic HTML
- Zoom
- Motion
- Color dependence

## Responsive Review

Test:

320px

375px

430px

768px

1024px

1280px

1440px

1920px

Look for:

- Overflow
- Hidden controls
- Broken layouts
- Touch targets
- Responsive tables
- Responsive dialogs

## Localization Review

Review:

- English
- Arabic
- RTL
- Translation keys
- Hardcoded text
- Date formatting
- Number formatting
- Currency formatting

## Security Review

Review:

- Authentication
- Authorization
- Session handling
- JWT
- Cookies
- CSRF
- XSS
- SQL Injection
- SSRF
- File uploads
- Secrets
- Logging
- CORS
- CSP
- Rate limiting
- Password reset
- MFA
- Audit logs

Verify against OWASP ASVS.

## Performance Review

Measure:

- Bundle size
- Page load
- Route transitions
- API latency
- Database performance
- Memory
- CPU
- Rendering
- Queries
- Uploads

Test:

- Load
- Stress
- Soak

## Database Review

Review:

- Schema
- Migrations
- Transactions
- Constraints
- Indexes
- Foreign keys
- Deadlocks
- Rollback
- Backup
- Restore

Verify data invariants.

## Infrastructure Review

Review:

- Docker
- Compose
- Kubernetes
- Reverse proxy
- TLS
- Secrets
- Health checks
- Monitoring
- Logging
- Volumes
- Firewalls
- Resource limits

Run the application using the production deployment configuration whenever possible.

## Operations Review

Review:

- Monitoring
- Alerts
- Dashboards
- Logging
- Incident response
- Backup
- Restore
- Disaster recovery
- Rollback
- Health checks
- Runbooks

# Phase 4 - Fix Safe Issues

Automatically fix:

- Bugs
- Build failures
- Lint issues
- Type issues
- Accessibility problems
- Responsive issues
- Performance improvements
- Missing validation
- Security misconfiguration
- UX inconsistencies

Do NOT perform risky architectural rewrites without documenting them.

# Phase 5 - Verify Again

After fixes:

Run:

- Build
- Lint
- Type check
- Unit tests
- Integration tests
- API tests
- Database migration tests
- E2E tests
- Security scans
- Dependency audit
- Docker build
- Smoke tests

Document every executed command and its result.

# Phase 6 - Generate Professional Reports

Generate the following reports as separate Markdown documents:

## 01_Executive_Summary.md

Overall health

Readiness score

Top risks

Deployment recommendation

## 02_Functional_Verification_Report.md

Requirements coverage

Feature status

Acceptance criteria

Regression summary

## 03_Business_Logic_Workflow_Report.md

Every workflow

State transitions

Business rules

Logic gaps

Recommendations

## 04_QA_Test_Report.md

Unit

Integration

API

E2E

Coverage

Regression

## 05_UX_UI_Report.md

Navigation

Forms

Tables

Responsive

Accessibility

Design consistency

User journey

Recommendations

Screenshots where possible

## 06_Design_System_Report.md

Component inventory

Color system

Typography

Spacing

Icons

Reusable patterns

Design debt

## 07_Accessibility_Report.md

WCAG findings

Keyboard

Screen reader

Contrast

ARIA

Recommendations

## 08_Localization_RTL_Report.md

Language review

RTL review

Translation gaps

Formatting

## 09_Security_Report.md

Threats

Findings

OWASP mapping

Remediation

Verification

## 10_Dependency_SBOM_Report.md

Dependencies

Versions

Licenses

Vulnerabilities

SBOM

## 11_Database_Report.md

Schema

Migrations

Indexes

Constraints

Performance

Data integrity

## 12_Performance_Report.md

Frontend

Backend

Database

Load

Stress

Recommendations

## 13_Infrastructure_Report.md

Docker

Cloud

TLS

Networking

Secrets

Monitoring

Deployment

## 14_Backup_Disaster_Recovery_Report.md

Backup

Restore

RPO

RTO

Disaster recovery

Rollback

## 15_Operations_Readiness_Report.md

Monitoring

Alerts

Logging

Incident response

Runbooks

## 16_Risk_Register.md

Every unresolved issue

Severity

Owner

Target fix

Acceptance status

## 17_Deployment_Checklist.md

Go-live checklist

Environment

Database

Secrets

Infrastructure

Monitoring

Rollback

Verification

## 18_Final_Release_Approval.md

Choose ONE:

- READY FOR PRODUCTION
- READY WITH ACCEPTED RISKS
- NOT READY FOR PRODUCTION

Include:

Overall score

Resolved findings

Remaining findings

Known risks

Required approvals

Deployment recommendation

Rollback recommendation

# Report Requirements

Every report must include:

- Executive summary
- Scope
- Methodology
- Evidence
- Findings
- Severity
- Recommended fixes
- Verification
- Remaining risks

Never make unsupported claims.

If something cannot be tested, clearly state:

- What was not tested
- Why
- Required environment
- Remaining risk

# Final Deliverables

Produce:

- Updated source code (where fixes were applied)
- Updated tests
- Updated documentation
- All Markdown reports
- Screenshots for UX findings where available
- A consolidated release package ready for stakeholder review

The review is complete only when all reports are generated, all safe fixes are applied, all remaining risks are documented, and a clear production readiness decision is supported by evidence.