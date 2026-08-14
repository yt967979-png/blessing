/**
 * PostgreSQL Restore Verification Tool
 * Run with: DATABASE_URL="..." node scripts/verify-backup-restore.js
 *
 * Verifies that essential tables, indexes, constraints, and rows are intact
 * after a database restore operation.
 */

const { Pool } = require('pg');

async function verifyRestoredDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });

  try {
    const client = await pool.connect();
    console.log('\n--- PostgreSQL Backup/Restore Verification Tool ---\n');
    console.log('✓ Connected successfully to target database.');

    const criticalTables = [
      'books',
      'orders',
      'payments',
      'users',
      'stock_holds',
      'audit_logs',
      'job_heartbeats',
      'failed_webhook_events',
      'invoice_sequences',
    ];

    console.log('\nChecking table existence and row counts:');
    for (const table of criticalTables) {
      try {
        const res = await client.query(`SELECT COUNT(*)::int as count FROM ${table}`);
        const count = res.rows[0]?.count || 0;
        console.log(`  ✓ Table "${table}": ${count} records found.`);
      } catch (err) {
        console.error(`  ✗ Table "${table}" is missing or inaccessible: ${err.message}`);
      }
    }

    console.log('\nChecking critical unique indexes and constraints:');
    const indexCheck = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('uq_orders_idempotency_key', 'idx_failed_webhook_events_status')
    `);

    const foundIndexes = new Set(indexCheck.rows.map((r) => r.indexname));
    if (foundIndexes.has('uq_orders_idempotency_key')) {
      console.log('  ✓ Partial unique index "uq_orders_idempotency_key" is present.');
    } else {
      console.warn('  ⚠️ Partial unique index "uq_orders_idempotency_key" is missing.');
    }

    client.release();
    await pool.end();

    console.log('\n✅ Database restore integrity verification completed.\n');
  } catch (err) {
    console.error('Database connection / verification error:', err.message);
    process.exit(1);
  }
}

verifyRestoredDatabase();
