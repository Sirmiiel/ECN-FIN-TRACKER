const { createTables } = require('./init');
const { migrate } = require('./002_bank_integration');

async function runMigrations() {
  try {
    console.log('Running migration: init.js');
    await createTables();

    console.log('Running migration: 002_bank_integration.js');
    await migrate();

    console.log('All migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration run failed.');
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
