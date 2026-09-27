const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function main() {
  try {
    const res = await pool.query(`SELECT * FROM books WHERE id = 'bpg-1790336858543'`);
    console.log('Book details:');
    console.log(res.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
main();
