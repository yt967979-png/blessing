/**
 * Utility CLI Script to clear all orders from PostgreSQL.
 * Restores books.stock for unpaid holds and non-cancelled sales, and
 * rolls coupon used_count back from coupon_redemptions.
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
  console.log('🧹 Clearing all orders and restoring stock / coupon counts...');
  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(`
      UPDATE books b SET stock = stock + h.qty
      FROM (
        SELECT book_id, SUM(qty)::int AS qty
        FROM stock_holds
        WHERE status = 'held'
        GROUP BY book_id
      ) h
      WHERE b.id = h.book_id
    `);

    await client.query(`
      UPDATE books b SET stock = stock + x.qty
      FROM (
        SELECT oi.book_id, SUM(oi.quantity)::int AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
        GROUP BY oi.book_id
      ) x
      WHERE b.id = x.book_id
    `);

    await client.query(`
      UPDATE coupons c SET used_count = GREATEST(0, COALESCE(used_count, 0) - r.cnt)
      FROM (
        SELECT coupon_id, COUNT(*)::int AS cnt
        FROM coupon_redemptions
        GROUP BY coupon_id
      ) r
      WHERE c.id = r.coupon_id
    `);

    await client.query('DELETE FROM coupon_redemptions');
    await client.query('DELETE FROM refunds');
    await client.query('DELETE FROM courier_tracking');
    await client.query('DELETE FROM order_timeline');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM stock_holds');
    await client.query('UPDATE reviews SET order_id = NULL WHERE order_id IS NOT NULL');
    await client.query('DELETE FROM orders');

    await client.query('COMMIT');

    const left = await client.query('SELECT COUNT(*)::int AS n FROM orders');
    console.log('✅ ALL ORDERS CLEARED SUCCESSFULLY!');
    console.log(`   Remaining orders: ${left.rows[0].n}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error clearing orders:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

cleanOrders();
