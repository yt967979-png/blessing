/**
 * Utility CLI Script to clear all test/demo orders from PostgreSQL DB.
 * Usage: node scripts/clean-orders.js
 */
const { Client } = require('pg');
require('dotenv').config();

function normalizeConnectionString(str) {
  let s = (str || '').trim();
  if (!s) return '';
  if (s.startsWith('psql ')) s = s.slice(5).trim();
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  return s;
}

const connStr = normalizeConnectionString(process.env.DATABASE_URL);
if (!connStr) {
  console.error('❌ DATABASE_URL missing in environment.');
  process.exit(1);
}

const isSsl = !connStr.includes('localhost') && !connStr.includes('127.0.0.1');
const client = new Client({
  connectionString: connStr,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
});

async function cleanOrders() {
  console.log('🧹 Clearing all test orders and tracking data from database...');
  try {
    await client.connect();

    await client.query('BEGIN');
    await client.query('DELETE FROM courier_tracking;');
    await client.query('DELETE FROM order_timeline;');
    await client.query('DELETE FROM order_items;');
    await client.query('DELETE FROM stock_holds;');
    await client.query('DELETE FROM orders;');
    await client.query('COMMIT');

    console.log('✅ ALL ORDERS CLEARED SUCCESSFULLY!');
    console.log('   - Database is clean and ready for real customer orders.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error clearing orders:', err.message);
  } finally {
    await client.end();
  }
}

cleanOrders();
