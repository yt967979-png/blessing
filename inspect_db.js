const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function run() {
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cart_items'");
  console.log('cart_items columns:');
  console.log(cols.rows);

  const cart = await pool.query("SELECT * FROM cart_items LIMIT 5");
  console.log('cart_items sample:');
  console.log(cart.rows);

  pool.end();
}
run().catch(console.error);
