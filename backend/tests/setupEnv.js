process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/rcms_test';
process.env.JWT_SECRET = 'rcms_ci_auth_secret_2026_secure_value';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.PORT = '3001';
process.env.ORTHANC_PASSWORD = 'rcms-ci-orthanc-password';
process.env.PACS_WEBHOOK_SECRET = 'rcms-ci-pacs-webhook-secret';
process.env.BLIND_INDEX_KEY = 'rcms-ci-blind-index-key-32-chars';
