Act as a senior software architect, business analyst, QA engineer, security reviewer, and database consistency auditor.

Review the entire application with primary emphasis on business logic, workflow correctness, state transitions, authorization boundaries, data consistency, concurrency, partial failures, and missing business rules.

Do not limit the review to code style, compilation, linting, or unit-test results. Trace every critical user and system workflow from its initial trigger through validation, authorization, database updates, external integrations, audit logging, notifications, and final outcome.

For every major workflow:

1. Identify the actors and roles.
2. Identify all preconditions.
3. Document the expected sequence of steps.
4. Identify all record state transitions.
5. Identify all business rules and invariants.
6. Verify server-side authorization at every step.
7. Verify branch, tenant, ownership, and resource-level isolation.
8. Test invalid, missing, duplicate, expired, and conflicting inputs.
9. Test repeated requests and idempotency.
10. Test concurrent execution by multiple users.
11. Test database failure at intermediate steps.
12. Test external-service timeouts and unavailable dependencies.
13. Check whether partial data can remain after failure.
14. Verify rollback, retry, and recovery behavior.
15. Verify audit logs and security events.
16. Verify notifications do not occur before successful commit.
17. Verify users cannot bypass workflow stages through direct API calls.
18. Identify undocumented assumptions and ambiguous rules.
19. Identify missing validation, constraints, indexes, or transactions.
20. Create regression tests for every confirmed defect.

Build a complete workflow inventory before making conclusions.

For each workflow, produce a table containing:

- Workflow name
- Actors
- Preconditions
- Entry point
- Main steps
- Allowed states
- State transitions
- Business rules
- Database entities affected
- External services affected
- Authorization requirements
- Failure scenarios
- Concurrency risks
- Audit requirements
- Identified gaps
- Recommended fixes
- Test coverage status

Pay special attention to:

- Authentication and session lifecycle
- Password reset and two-factor authentication
- Role and permission management
- Patient registration and duplicate detection
- Patient merge and record lineage
- Appointment and scheduling conflicts
- Order creation and status transitions
- Worklist assignment
- DICOM/PACS study matching
- Reporting, approval, publishing, and amendment
- Billing, payments, refunds, and financial closure
- Insurance claims
- File uploads
- Notifications
- AI processing
- Background jobs
- Backup and recovery

For each confirmed issue, classify severity as:

- Blocker
- Critical
- High
- Medium
- Low
- Informational

Each issue must include:

- Affected workflow
- Exact condition that causes the issue
- Evidence
- Business impact
- Security or data-integrity impact
- Reproduction steps
- Recommended correction
- Regression test
- Verification result

Create explicit invariant checks for critical data relationships, including financial totals, report approval status, patient merge lineage, workflow state validity, tenant isolation, and duplicate processing.

Run the application, tests, APIs, database migrations, and workflow scenarios wherever the environment permits.

Do not claim that a workflow is correct merely because its unit tests pass. Verify the complete behavior across frontend, API, database, background jobs, and external integrations.

Clearly distinguish:

- Confirmed defects
- Likely risks
- Missing requirements
- Untested behavior
- Acceptable behavior
- Recommendations

At the end, provide:

1. Workflow coverage summary
2. Critical logic gaps
3. Broken or ambiguous state transitions
4. Authorization gaps
5. Data-consistency risks
6. Concurrency and idempotency risks
7. Failure-recovery gaps
8. Missing tests
9. Recommended remediation order
10. Final readiness decision

Choose exactly one final result:

- LOGIC AND WORKFLOWS VERIFIED
- VERIFIED WITH ACCEPTED RISKS
- LOGIC AND WORKFLOW GAPS REMAIN

Do not approve the system while unresolved blocker, critical, or high-impact workflow defects remain.