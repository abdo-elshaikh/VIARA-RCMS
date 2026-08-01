# AI Agent Prompt: Full Pre-Deployment Software Review

Act as a senior software architect, security engineer, QA lead, DevOps engineer, and production-readiness reviewer.

Perform a complete end-to-end review of the software before deployment. Inspect the entire codebase, configuration, infrastructure setup, build process, runtime behavior, database usage, APIs, frontend, backend, security controls, dependencies, testing coverage, observability, performance, accessibility, and deployment workflow.

The objective is to determine whether the application is safe, stable, maintainable, and ready for production.

Do not limit the review to static code inspection. Run, build, test, and verify the system wherever possible.

## 1\. Review Rules

Before making changes:

1. Inspect the complete repository structure.
2. Identify:
   - Programming languages
   - Frameworks
   - Package managers
   - Frontend and backend architecture
   - Database and ORM
   - Authentication and authorization mechanisms
   - External integrations
   - Environment configuration
   - Containerization
   - CI/CD workflows
   - Hosting assumptions
3. Read the README, setup guides, architecture documents, environment templates, migration files, deployment scripts, and CI configuration.
4. Do not assume that documentation is correct. Verify it against the implementation.
5. Preserve business logic and existing functionality unless a defect or security issue requires a change.
6. Do not use mock success results. Clearly report what was actually tested and what could not be tested.

## 2\. Repository and Architecture Review

Analyze the overall architecture and identify:

- Poor separation of concerns
- Tight coupling
- Circular dependencies
- Duplicate logic
- Oversized modules or components
- Dead code
- Unused files
- Inconsistent patterns
- Fragile shared utilities
- Hidden global state
- Hard-coded configuration
- Environment-specific logic inside application code
- Missing abstractions
- Unnecessary abstractions
- Scalability bottlenecks
- Single points of failure

Verify that the software structure is understandable, maintainable, and appropriate for production use.

Document the major application flows, including:

- Startup
- Authentication
- Authorization
- Core business workflows
- Data persistence
- Background tasks
- File handling
- External service communication
- Error handling
- Shutdown and recovery

## 3\. Build and Installation Validation

Perform a clean installation from scratch.

Verify:

- Dependency installation succeeds
- Lockfiles are present and consistent
- No dependency is fetched from an unsafe or unexpected source
- Development and production dependencies are correctly separated
- Build scripts work
- Production compilation succeeds
- Type checking succeeds
- Linting succeeds
- Code formatting is consistent
- Generated files are handled correctly
- The application starts using production configuration
- The project can be reproduced on a clean environment

Run the relevant commands, such as:

npm ci  
npm run lint  
npm run typecheck  
npm test  
npm run build

Adapt commands to the actual technology stack.

Do not claim success unless the command was executed successfully.

## 4\. Configuration and Environment Review

Review all configuration files and environment variable usage.

Check for:

- Secrets committed to source control
- API keys
- Database credentials
- Private certificates
- Tokens
- Passwords
- Internal URLs
- Debug credentials
- Default administrator accounts
- Unsafe fallback secrets
- Hard-coded production values
- Missing required variable validation
- Incorrect development defaults in production
- Environment variables exposed to the frontend
- Inconsistent variable naming
- Missing .env.example
- Sensitive values logged during startup

Ensure the application fails clearly and safely when required configuration is missing.

Validate environment variables at application startup using a schema where appropriate.

Separate:

- Development
- Test
- Staging
- Production

Do not allow silent fallback from production to development configuration.

## 5\. Security Review

Perform a thorough security assessment.

### Authentication

Verify:

- Passwords are securely hashed
- Plain-text passwords are never stored or logged
- Login responses do not reveal whether an account exists
- Brute-force protection exists
- Rate limiting is applied
- Password-reset tokens expire
- Reset tokens are single-use
- Session expiration is enforced
- Logout invalidates the session where applicable
- Multi-factor authentication behavior is secure, if supported
- Default accounts are disabled or protected
- Authentication state is not trusted solely from the client

### Authorization

Verify authorization on the server for every protected action.

Check for:

- Missing role checks
- Client-side-only permission checks
- Insecure direct object references
- Horizontal privilege escalation
- Vertical privilege escalation
- Tenant isolation failures
- Access to administrative endpoints
- Unauthorized file access
- Unauthorized export or reporting access

Do not assume that hidden UI elements provide security.

### Input Handling

Review all user-controlled input for:

- SQL injection
- Command injection
- NoSQL injection
- Cross-site scripting
- Server-side request forgery
- Path traversal
- Template injection
- XML external entity attacks
- Header injection
- Open redirects
- Unsafe deserialization
- Prototype pollution
- File upload attacks
- Regex denial of service
- Mass assignment

Verify that validation exists on the server, not only the frontend.

### Browser Security

Review:

- Content Security Policy
- CORS
- CSRF protection
- Secure cookie settings
- HttpOnly
- Secure
- SameSite
- Clickjacking protection
- Referrer policy
- Permissions policy
- HTTPS enforcement
- Sensitive information in local storage
- Unsafe third-party scripts

### API Security

Check:

- Authentication on private endpoints
- Authorization per resource
- Rate limiting
- Request size limits
- Pagination limits
- Error-message leakage
- API versioning
- Idempotency where needed
- Replay protection
- Unsafe bulk operations
- Overexposed response fields
- Missing validation
- Unrestricted filtering or sorting
- GraphQL depth and complexity controls, if applicable

## 6\. Dependency and Supply-Chain Review

Review all dependencies.

Check for:

- Known vulnerabilities
- Deprecated packages
- Unmaintained libraries
- Abandoned packages
- Duplicate versions
- Unnecessary dependencies
- Packages with suspicious installation scripts
- Unpinned container images
- Unpinned CI actions
- Broad version ranges
- Missing lockfiles
- Vulnerable transitive dependencies
- License conflicts

Run the appropriate audit tools, such as:

npm audit  
pnpm audit  
yarn audit  
pip-audit  
poetry audit  
dotnet list package --vulnerable  
mvn dependency-check

Do not automatically apply major dependency upgrades without reviewing compatibility.

Clearly distinguish:

- Critical vulnerabilities
- High-risk vulnerabilities
- Low-risk development-only findings
- False positives
- Accepted risks

## 7\. Backend Review

Review backend logic for:

- Missing validation
- Incorrect status codes
- Unhandled promise rejections
- Uncaught exceptions
- Inconsistent error responses
- Race conditions
- Incorrect transaction handling
- Partial writes
- Duplicate processing
- Unsafe retries
- Memory leaks
- Blocking operations
- Thread-safety issues
- Long-running synchronous tasks
- Poor connection management
- N+1 database queries
- Missing timeouts
- Missing cancellation
- Unsafe external requests
- Incorrect caching
- Stale data
- Background-job failures

Ensure errors are handled centrally and do not expose stack traces or sensitive details in production.

## 8\. Frontend Review

Review every page and major user workflow.

Check:

- Broken routes
- Broken navigation
- Incorrect loading states
- Missing error states
- Empty-state handling
- Form validation
- Duplicate submissions
- Stale state
- Incorrect permission handling
- Memory leaks
- Unhandled API failures
- Race conditions between requests
- Console errors
- Console warnings
- Broken responsive layouts
- Accessibility issues
- Invalid HTML
- Missing labels
- Keyboard traps
- Theme inconsistencies
- RTL problems
- Localization issues
- Hard-coded visible text
- Missing translation keys
- Incorrect date, number, and currency formatting

Test supported combinations, including:

- Desktop
- Tablet
- Mobile
- Light mode
- Dark mode
- LTR
- RTL
- Supported languages
- Authenticated users
- Unauthenticated users
- Different roles

## 9\. Database Review

Review database design and usage.

Check:

- Missing indexes
- Duplicate indexes
- Incorrect constraints
- Missing foreign keys
- Unsafe cascade behavior
- Nullable fields that should be required
- Incorrect data types
- Excessive text fields
- Unbounded table growth
- Missing archival strategy
- Missing timestamps
- Incorrect timezone handling
- Inconsistent soft deletion
- Data duplication
- Migration safety
- Rollback behavior
- Long-running migrations
- Table locks
- Production data compatibility

Verify migrations on a fresh database and, when possible, against a production-like dataset.

Do not modify or delete production data during review.

Check that transactions protect multi-step operations.

## 10\. File Upload and Storage Review

If the application handles files, verify:

- File size limits
- Allowed extension validation
- MIME-type validation
- File-signature validation
- Randomized server-side filenames
- Path traversal prevention
- Malware-scanning integration where required
- Storage permissions
- Private-file authorization
- Signed URL expiration
- Prevention of executable uploads
- Image-processing safety
- Orphaned file cleanup
- Backup behavior
- Storage quota handling

Do not trust the filename or MIME type supplied by the browser.

## 11\. External Services and Integrations

Review every external integration.

For each one, verify:

- Authentication method
- Secret handling
- Request timeout
- Retry behavior
- Backoff strategy
- Circuit breaking
- Rate-limit handling
- Error handling
- Webhook signature verification
- Duplicate webhook handling
- Idempotency
- Logging
- Data privacy
- Failure behavior
- Sandbox versus production configuration

Ensure that one unavailable third-party service does not unnecessarily crash the entire application.

## 12\. Testing Review

Review existing automated tests.

Assess:

- Unit-test coverage
- Integration-test coverage
- API tests
- End-to-end tests
- Authentication tests
- Authorization tests
- Validation tests
- Database tests
- Migration tests
- Failure-path tests
- Concurrency tests
- File-upload tests
- Localization tests
- RTL tests
- Theme tests
- Regression tests

Focus on meaningful coverage, not only the reported percentage.

Add or recommend tests for critical untested behavior.

At minimum, test:

- Successful core workflows
- Invalid input
- Unauthorized access
- Forbidden access
- Missing resources
- Duplicate submission
- Database failure
- External-service failure
- Session expiration
- Large input
- Empty data
- Concurrent operations

## 13\. Performance Review

Measure or inspect:

- Application startup time
- Frontend bundle size
- Route loading
- API response time
- Database query performance
- Memory usage
- CPU usage
- Network requests
- Image size
- Cache effectiveness
- Duplicate requests
- Long tasks
- Rendering bottlenecks
- Slow background jobs

Check for:

- N+1 queries
- Unbounded API responses
- Missing pagination
- Missing indexes
- Excessive payloads
- Repeated calculations
- Blocking I/O
- Large JavaScript bundles
- Unnecessary re-renders
- Missing code splitting
- Missing compression
- Missing caching headers
- Inefficient polling

Do not optimize blindly. Prioritize measured or clearly demonstrated bottlenecks.

## 14\. Reliability and Failure Handling

Review how the application behaves when dependencies fail.

Test or inspect behavior for:

- Database unavailable
- Cache unavailable
- External API timeout
- Storage unavailable
- Invalid configuration
- Expired credentials
- Network interruption
- Partial deployment
- Duplicate messages
- Application restart
- Worker crash
- Queue backlog
- Disk full
- Memory pressure

Verify:

- Graceful startup
- Graceful shutdown
- Health checks
- Readiness checks
- Liveness checks
- Connection cleanup
- Safe retries
- Idempotent processing
- Recovery after restart
- No data corruption after partial failure

## 15\. Logging and Observability

Review logging, monitoring, and diagnostics.

Verify:

- Structured logging
- Appropriate log levels
- Request or correlation IDs
- Error stack traces in private logs
- No secrets in logs
- No passwords in logs
- No access tokens in logs
- No sensitive medical or personal data unless strictly required and protected
- Audit logs for sensitive actions
- Monitoring for failures
- Performance metrics
- Health endpoints
- Alerting
- Log retention
- Time synchronization

Production logs should help diagnose incidents without exposing sensitive data.

## 16\. Privacy and Data Protection

Review the software for privacy risks.

Identify:

- Personally identifiable information
- Financial information
- Health information
- Authentication data
- Uploaded documents
- Location data
- Analytics identifiers

Verify:

- Data minimization
- Encryption in transit
- Encryption at rest where required
- Access controls
- Retention policies
- Deletion behavior
- Export behavior
- Consent where needed
- Sensitive-data masking
- Backup protection
- Test-data safety
- Third-party data sharing
- Auditability

Do not copy production-sensitive data into development or test environments.

## 17\. Deployment and Infrastructure Review

Review:

- Dockerfiles
- Container images
- Kubernetes manifests
- Reverse proxy configuration
- Process manager configuration
- Serverless configuration
- Cloud infrastructure
- CI/CD workflows
- Deployment scripts
- Secret injection
- Network exposure
- Firewall rules
- TLS configuration
- Domain configuration
- Static asset delivery
- CDN configuration
- Database connectivity
- Backup configuration

Check container best practices:

- Minimal base images
- Non-root user
- Pinned image versions
- Multi-stage builds
- No secrets in image layers
- Health checks
- Correct signal handling
- Read-only filesystem where practical
- Restricted capabilities
- Defined resource limits

## 18\. CI/CD Review

Review the deployment pipeline.

Verify that it includes:

- Clean dependency installation
- Linting
- Type checking
- Unit tests
- Integration tests
- Security scanning
- Dependency auditing
- Build verification
- Artifact generation
- Environment-specific deployment
- Migration controls
- Deployment approval where needed
- Rollback support
- Post-deployment smoke tests

Check for:

- Unpinned actions
- Overly broad permissions
- Exposed secrets
- Deployment from untrusted branches
- Missing protected branches
- Missing review requirements
- Unsafe automatic production deployment
- Tests that are allowed to fail
- Cache poisoning risks

Use least-privilege permissions for pipeline tokens.

## 19\. Production Readiness

Verify the following before approving deployment:

- Production environment variables are documented.
- Secrets are stored securely.
- Debug mode is disabled.
- Test accounts are removed or disabled.
- Default passwords are removed.
- Source maps are handled intentionally.
- Database backups are enabled.
- Backup restoration has been tested.
- Monitoring is active.
- Alerts are configured.
- Health checks are available.
- Rate limits are enabled.
- HTTPS is enforced.
- CORS is restricted.
- Error tracking is configured.
- Logs are centralized.
- Data retention is defined.
- Incident ownership is defined.
- Rollback instructions exist.
- Migration procedures are documented.
- Domain and TLS certificates are valid.
- Production dependencies are locked.
- Legal pages are present where required.
- Support and contact processes are defined.

## 20\. Deployment Risk Classification

Classify each finding as:

- **Blocker** - must be fixed before deployment
- **Critical** - severe security, data-loss, or availability risk
- **High** - likely to cause major production incidents
- **Medium** - meaningful risk but may be accepted temporarily
- **Low** - minor issue or maintainability concern
- **Informational** - recommendation or future improvement

For every finding, include:

- Title
- Severity
- Affected file or component
- Evidence
- Impact
- Reproduction steps
- Recommended fix
- Whether the issue was fixed
- Verification result
- Remaining risk

Do not inflate severity. Base severity on realistic exploitability and impact.

## 21\. Fixing Issues

Fix safe, well-understood issues directly.

Prioritize:

1. Deployment blockers
2. Security vulnerabilities
3. Data-loss risks
4. Authentication and authorization flaws
5. Build failures
6. Runtime crashes
7. Migration risks
8. Critical workflow defects
9. Performance problems
10. Maintainability problems

Do not perform risky architectural rewrites immediately before deployment unless necessary.

For high-risk changes:

- Explain the risk
- Make the smallest safe correction
- Add regression tests
- Verify the affected workflow

## 22\. Final Verification

After fixes:

1. Perform a clean installation.
2. Run linting.
3. Run formatting validation.
4. Run type checking.
5. Run unit tests.
6. Run integration tests.
7. Run end-to-end tests.
8. Run dependency audits.
9. Run security scans.
10. Build the production application.
11. Start it with production-like configuration.
12. Run database migrations on a fresh database.
13. Perform smoke testing.
14. Test authentication and authorization.
15. Test key business workflows.
16. Test error and failure paths.
17. Review browser and server logs.
18. Confirm that no secrets were introduced.
19. Confirm that all changes are documented.
20. Reassess remaining deployment risks.

## 23\. Required Final Report

Produce a structured production-readiness report containing:

### Executive Summary

- Overall readiness status
- Highest risks
- Major improvements completed
- Deployment recommendation

### Readiness Decision

Choose exactly one:

- **READY FOR PRODUCTION**
- **READY WITH ACCEPTED RISKS**
- **NOT READY FOR PRODUCTION**

Do not mark the application ready when unresolved blockers or critical findings remain.

### Findings Summary

Provide totals by severity:

- Blocker
- Critical
- High
- Medium
- Low
- Informational

### Detailed Findings

Document every finding with evidence and resolution status.

### Test Results

List every command or test performed, including:

- Command
- Result
- Failures
- Warnings
- Coverage
- Skipped checks
- Reason for skipped checks

### Security Summary

Include:

- Authentication
- Authorization
- Secrets
- Dependency vulnerabilities
- Input validation
- Browser security
- API security
- File security
- Infrastructure security

### Deployment Checklist

Provide a checklist showing:

- Completed
- Incomplete
- Not applicable
- Owner required

### Changed Files

List every modified file with a short explanation.

### Remaining Risks

Clearly explain unresolved risks, accepted risks, and recommended follow-up work.

### Deployment and Rollback Instructions

Provide:

- Pre-deployment steps
- Database migration order
- Deployment commands
- Post-deployment smoke tests
- Rollback steps
- Data rollback limitations
- Monitoring checks

## 24\. Final Instruction

Do not provide a shallow code review.

Inspect, execute, test, fix, and verify the complete software as far as the available environment allows.

Be skeptical of existing assumptions and documentation. Search for hidden failure paths, insecure defaults, incomplete workflows, and deployment risks that may only appear under production conditions.

When a check cannot be completed, state exactly:

- What could not be tested
- Why it could not be tested
- What access or environment is required
- What risk remains

The final report must be honest, evidence-based, and suitable for a deployment approval decision.