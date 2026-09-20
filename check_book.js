const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function run() {
  const res = await pool.query("SELECT id, title, price, discount_price, stock FROM books WHERE id = 'bpg-1786767984265'");
  console.log('Book in DB:', res.rows[0]);
  pool.end();
}
run().catch(console.error);
