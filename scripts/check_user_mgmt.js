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
  const r = await pool.query(`
    SELECT u.id, u.name, u.email, u.phone,
           COUNT(DISTINCT o.id) FILTER (
             WHERE o.id IS NOT NULL AND COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
           )::int AS order_count,
           COALESCE(SUM(o.total_amount) FILTER (
             WHERE COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
           ), 0)::numeric AS total_spent
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.id = 'usr-g-1790257137701'
    GROUP BY u.id
  `);
  console.log('USER MANAGEMENT ROW FOR JO PRINCY:');
  console.log(r.rows);
  await pool.end();
}

run().catch(console.error);
