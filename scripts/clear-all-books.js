const { Client } = require('pg');

try {
  require('dotenv').config();
} catch (e) {}

let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL;
const RAILWAY_DB_FALLBACK = "postgresql://postgres:USdOHOzspyXMPFmDnfsjkxoSIGedYwgk@sakura.proxy.rlwy.net:32874/railway";

if (!connectionString) {
  connectionString = RAILWAY_DB_FALLBACK;
}

const isSsl = connectionString.includes('railway') || connectionString.includes('render') || connectionString.includes('rlwy.net');

async function clearBooks(connStr, dbName) {
  const client = new Client({
    connectionString: connStr,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log(`⚡ Connected to [${dbName}]. Clearing books table...`);

    const res = await client.query('DELETE FROM books');
    console.log(`✅ [${dbName}] Purged ${res.rowCount} books from Railway PostgreSQL DB!`);

    await client.end();
  } catch (err) {
    console.error(`❌ Error purging books from [${dbName}]:`, err.message);
    if (client) await client.end();
  }
}

async function main() {
  const targetDbName = connectionString.split('/').pop().split('?')[0] || 'target_db';
  await clearBooks(connectionString, targetDbName);

  if (connectionString.endsWith('/railway') || connectionString.includes('/railway?')) {
    const postgresConnStr = connectionString.replace('/railway', '/postgres');
    await clearBooks(postgresConnStr, 'postgres');
  }
}

main();
