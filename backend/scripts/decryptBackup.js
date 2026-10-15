const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env or root .env
const rootEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
} else {
    dotenv.config();
}

const { decryptBackup } = require('../src/services/postgresBackupService');

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/decryptBackup.js <input.dump.enc> <output.dump>');
    process.exit(1);
}

decryptBackup(path.resolve(inputPath), path.resolve(outputPath))
    .then(() => {
        console.log(`Decrypted backup written to ${path.resolve(outputPath)}`);
    })
    .catch((error) => {
        console.error(`Backup decrypt failed: ${error.message}`);
        process.exit(1);
    });
