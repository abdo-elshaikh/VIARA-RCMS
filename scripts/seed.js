/**
 * VIARA Centralized Database Seeder
 * Executes the rich seed generator in database/seed.js
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const seedFile = path.join(rootDir, 'database', 'seed.js');

if (!fs.existsSync(seedFile)) {
    console.error('❌ database/seed.js not found at:', seedFile);
    process.exit(1);
}

if (!process.env.TEST_USER_PASSWORD) {
    console.error('❌ TEST_USER_PASSWORD is required. Refusing to seed with a default password.');
    process.exit(1);
}
console.log('🌱 Launching VIARA Database Seeding...');

const result = spawnSync('node', [seedFile], {
    cwd: path.join(rootDir, 'database'),
    stdio: 'inherit',
    env: { ...process.env }
});

if (result.status !== 0) {
    console.error('❌ Seeding failed with exit code:', result.status);
    process.exit(result.status || 1);
} else {
    console.log('✅ Seeding completed successfully!');
}
