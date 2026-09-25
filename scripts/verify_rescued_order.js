const { Pool } = require('/opt/blessing/node_modules/pg');
const fs = require('fs');

const envFile = fs.readFileSync('/etc/blessing.env', 'utf8');
let dbUrl = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.substring(13).trim().replace(/^['"]|['"]$/g, '');
  }
}

const pool = new Pool({ connectionString: dbUrl });

async function run() {
  const res = await pool.query(`
    SELECT o.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', oi.book_id,
                 'title', oi.book_title,
                 'price', oi.book_price,
                 'qty', oi.quantity,
                 'subtotal', oi.subtotal
               )
             ) FILTER (WHERE oi.id IS NOT NULL), '[]'
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.order_number = 'BPG-TFTZ-M1QR'
    GROUP BY o.id
  `);

  console.log('RESCUED ORDER ROW:');
  console.log(JSON.stringify(res.rows[0], null, 2));
  await pool.end();
}

run().catch(console.error);
