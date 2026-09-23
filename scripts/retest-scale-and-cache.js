/**
 * Scale Retest Suite: Database Query Analysis, Index Usage, Admin Analytics & Cache
 * Runs against blessing_staging (551 books, 2,010 users, 2,504 orders)
 */

const { Pool } = require('pg');

const stagingPool = new Pool({
  connectionString: process.env.STAGING_DB_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing_staging',
  max: 10
});

async function runRetest() {
  console.log('================================================================');
  console.log('🔬 SCALE RETEST SUITE: POSTGRES INDEXES, CATALOG & ANALYTICS');
  console.log('================================================================\n');

  const client = await stagingPool.connect();
  const results = {
    catalogQueries: [],
    analyticsQueries: [],
    indexUsage: [],
    checkoutValidation: null
  };

  try {
    // 1. Catalog / Search Performance with EXPLAIN ANALYZE
    console.log('--- 1. Testing Catalog & Search Query Execution Plans ---');

    // Query 1.1: Department filter
    console.log('\n[Q1.1] Filtering by Department ("10th Standard") and status="published":');
    const q1 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, title, slug, price, discount_price, stock, department, subject
      FROM books
      WHERE department = '10th Standard' AND status = 'published'
      ORDER BY title ASC
      LIMIT 20;
    `);
    const q1Plan = q1.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q1Plan);
    results.catalogQueries.push({ name: 'Department Filter', plan: q1Plan });

    // Query 1.2: Search by Subject & Title pattern
    console.log('\n[Q1.2] Searching for "Mathematics" with ILIKE:');
    const q2 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, title, price, discount_price, stock
      FROM books
      WHERE (title ILIKE '%Mathematics%' OR subject ILIKE '%Mathematics%')
        AND status = 'published'
      ORDER BY id ASC
      LIMIT 20;
    `);
    const q2Plan = q2.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q2Plan);
    results.catalogQueries.push({ name: 'Subject ILIKE Search', plan: q2Plan });

    // Query 1.3: Category ID lookup
    console.log('\n[Q1.3] Category Filter with idx_books_status_cat:');
    const q3 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, title, slug, price
      FROM books
      WHERE category_id = 'cat-10th-standard' AND status = 'published'
      LIMIT 20;
    `);
    const q3Plan = q3.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q3Plan);
    results.catalogQueries.push({ name: 'Category Filter', plan: q3Plan });

    // 2. Admin Analytics & Reporting Queries (2,504 orders, 6,254 items)
    console.log('\n--- 2. Testing Admin Analytics & Reporting Execution Plans ---');

    // Query 2.1: Revenue & Order Counts by Status
    console.log('\n[Q2.1] Order Status & Total Revenue Aggregation:');
    const t0 = Date.now();
    const q4 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT 
        order_status,
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value
      FROM orders
      GROUP BY order_status;
    `);
    const q4Plan = q4.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q4Plan);
    results.analyticsQueries.push({ name: 'Order Status Aggregation', plan: q4Plan });

    // Actual query result
    const q4Data = await client.query(`
      SELECT 
        order_status,
        COUNT(*) as total_orders,
        ROUND(SUM(total_amount), 2) as total_revenue,
        ROUND(AVG(total_amount), 2) as avg_order_value
      FROM orders
      GROUP BY order_status;
    `);
    console.log('Result Data:', q4Data.rows);

    // Query 2.2: Daily Revenue Trend (Last 30 days) using idx_orders_created
    console.log('\n[Q2.2] 30-Day Revenue Trend (using idx_orders_created):');
    const q5 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT 
        DATE(ordered_at) as sale_date,
        COUNT(*) as orders_count,
        SUM(total_amount) as daily_revenue
      FROM orders
      WHERE ordered_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(ordered_at)
      ORDER BY sale_date DESC;
    `);
    const q5Plan = q5.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q5Plan);
    results.analyticsQueries.push({ name: '30-Day Trend', plan: q5Plan });

    // Query 2.3: Top 10 Best-Selling Books (Join orders + order_items + books)
    console.log('\n[Q2.3] Top 10 Best-Selling Books across 6,254 order items:');
    const q6 = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT 
        oi.book_id,
        oi.book_title,
        SUM(oi.quantity) as total_units_sold,
        SUM(oi.subtotal) as total_sales
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'PAID'
      GROUP BY oi.book_id, oi.book_title
      ORDER BY total_units_sold DESC
      LIMIT 10;
    `);
    const q6Plan = q6.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(q6Plan);
    results.analyticsQueries.push({ name: 'Top 10 Best Sellers', plan: q6Plan });

    // 3. PostgreSQL Index Scan Verification
    console.log('\n--- 3. Verifying Index Health & Table Sizes ---');
    const indexStats = await client.query(`
      SELECT 
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public' AND relname IN ('books', 'orders', 'users', 'order_items')
      ORDER BY relname, idx_scan DESC;
    `);
    console.table(indexStats.rows);
    results.indexUsage = indexStats.rows;

    // 4. Checkout Simulation: Stock Hold & Transaction under scale
    console.log('\n--- 4. Checkout Simulation under Scale Dataset ---');
    const chkBook = (await client.query('SELECT id, title, price, stock FROM books WHERE stock > 10 LIMIT 1;')).rows[0];
    console.log(`Selected book for checkout simulation: ${chkBook.title} (Stock: ${chkBook.stock})`);

    const checkoutStart = Date.now();
    await client.query('BEGIN;');
    // Row-level lock on the book
    const lockedBook = await client.query('SELECT id, stock, price FROM books WHERE id = $1 FOR UPDATE;', [chkBook.id]);
    const currentStock = lockedBook.rows[0].stock;
    const bookPrice = lockedBook.rows[0].price;

    const testOrderId = `ord_sim_${Date.now()}`;
    const testOrderNum = `SIM-${Date.now().toString().slice(-6)}`;
    const subtotal = Number(bookPrice);
    const shipping = 50;
    const total = subtotal + shipping;

    await client.query(`
      INSERT INTO orders (id, order_number, user_id, subtotal, discount, shipping_charge, tax, total_amount, payment_method, payment_status, order_status)
      VALUES ($1, $2, 'usr_scale_00001', $3, 0, $4, 0, $5, 'Razorpay UPI', 'PAID', 'Confirmed');
    `, [testOrderId, testOrderNum, subtotal, shipping, total]);

    await client.query(`
      INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
      VALUES ($1, $2, $3, $4, $5, 1, $5);
    `, [`item_${testOrderId}`, testOrderId, chkBook.id, chkBook.title, subtotal]);

    await client.query('UPDATE books SET stock = stock - 1 WHERE id = $1;', [chkBook.id]);
    await client.query('COMMIT;');
    const checkoutDuration = Date.now() - checkoutStart;

    console.log(`✅ Checkout transaction completed in ${checkoutDuration}ms.`);
    console.log(`   Order created: ${testOrderNum}, Stock updated from ${currentStock} to ${currentStock - 1}`);
    results.checkoutValidation = { durationMs: checkoutDuration, success: true };

    console.log('\n================================================================');
    console.log('✅ ALL RETEST ANALYSES COMPLETE');
    console.log('================================================================');
    console.log(JSON.stringify({
      summary: 'scale_retest_success',
      checkoutDurationMs: checkoutDuration,
      topSellerCount: q6.rows.length
    }, null, 2));

  } catch (err) {
    await client.query('ROLLBACK;').catch(() => {});
    console.error('Error during scale retest:', err);
    process.exit(1);
  } finally {
    client.release();
    await stagingPool.end();
  }
}

runRetest();
