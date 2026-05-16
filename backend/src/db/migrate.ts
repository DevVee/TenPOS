import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';

async function migrate() {
  const sqlPath = path.join(__dirname, 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Running migration...');
  try {
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
