const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function main() {
  try {
    await pool.query(
      `UPDATE books SET discount_price = NULL, price = 350 WHERE id = 'bpg-1790336858543'`
    );
    const res = await pool.query(
      `SELECT id, title, price, discount_price, category_id, stock FROM books WHERE id = 'bpg-1790336858543'`
    );
    console.log('Updated Book:');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
main();
