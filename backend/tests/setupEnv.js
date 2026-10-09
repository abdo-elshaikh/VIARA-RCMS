process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/VIARA_test';
process.env.JWT_SECRET = 'VIARA_ci_auth_secret_2026_secure_value';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.PORT = '3001';
process.env.ORTHANC_PASSWORD = 'VIARA-ci-orthanc-password';
process.env.PACS_WEBHOOK_SECRET = 'VIARA-ci-pacs-webhook-secret';
process.env.BLIND_INDEX_KEY = 'VIARA-ci-blind-index-key-32-chars';
process.env.BACKUP_ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
// Developer edition license — no expiry, no hardware binding, all modules
process.env.LICENSE_KEY = ''; // blank = developer fallback in licenseService
process.env.RATE_LIMIT_STORE = 'memory';
process.env.CLAMSCAN_PATH = '';
