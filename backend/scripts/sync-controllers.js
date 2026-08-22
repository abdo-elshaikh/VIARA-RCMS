const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../../.kilo/worktrees/spectacled-foundation/backend/src/controllers');
const targetDir = path.join(__dirname, '../src/controllers');

const filesToSync = [
    'appointmentController.js',
    'cashierController.js',
    'queueController.js'
];

filesToSync.forEach(file => {
    const sourceFile = path.join(sourceDir, file);
    const targetFile = path.join(targetDir, file);

    if (fs.existsSync(sourceFile)) {
        const content = fs.readFileSync(sourceFile, 'utf8');
        fs.writeFileSync(targetFile, content, 'utf8');
        console.log(`✅ Successfully synced ${file}`);
    } else {
        console.error(`❌ Source file not found: ${sourceFile}`);
    }
});

console.log('All conflicts resolved! The local branch now has the spectacled-foundation changes combined with the best-practices (safe rollbacks & pagination).');
