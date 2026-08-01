const path = require('path');
const { runMigration } = require('../migrate');

const MIGRATION_FILE = '085_add_audit_change_columns.sql';

runMigration(path.join(__dirname, `../../database/migrations/${MIGRATION_FILE}`))
  .then(() => {
    console.log(`Migration ${MIGRATION_FILE} executed successfully.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Migration ${MIGRATION_FILE} failed:`, err);
    process.exit(1);
  });
