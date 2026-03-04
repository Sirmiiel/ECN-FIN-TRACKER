const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);

const BACKUP_PATH = process.env.BACKUP_PATH || './backups';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || 30);

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_PATH)) {
  fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_PATH, `ecn_tracker_${timestamp}.sql`);

  console.log(`Creating backup: ${backupFile}`);

  const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  };

  try {
    // Create PostgreSQL backup
    const command = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F c -f ${backupFile}`;
    
    await execAsync(command);
    
    console.log(`Backup created successfully: ${backupFile}`);
    
    // Compress the backup
    await execAsync(`gzip ${backupFile}`);
    console.log(`Backup compressed: ${backupFile}.gz`);
    
    return `${backupFile}.gz`;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}

async function cleanOldBackups() {
  console.log('Cleaning old backups...');

  try {
    const files = fs.readdirSync(BACKUP_PATH);
    const now = new Date();

    for (const file of files) {
      if (!file.startsWith('ecn_tracker_') || !file.endsWith('.gz')) {
        continue;
      }

      const filePath = path.join(BACKUP_PATH, file);
      const stats = fs.statSync(filePath);
      const ageInDays = (now - stats.mtime) / (1000 * 60 * 60 * 24);

      if (ageInDays > RETENTION_DAYS) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    }

    console.log('Old backups cleaned');
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

async function verifyBackup(backupFile) {
  try {
    const stats = fs.statSync(backupFile);
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }
    console.log(`Backup verified: ${backupFile} (${stats.size} bytes)`);
    return true;
  } catch (error) {
    console.error('Backup verification failed:', error);
    return false;
  }
}

async function runBackup() {
  try {
    const backupFile = await createBackup();
    const isValid = await verifyBackup(backupFile);
    
    if (!isValid) {
      throw new Error('Backup verification failed');
    }

    await cleanOldBackups();
    
    console.log('Backup process completed successfully');
  } catch (error) {
    console.error('Backup process failed:', error);
    process.exit(1);
  }
}

// Run backup if called directly
if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { createBackup, cleanOldBackups, verifyBackup };
