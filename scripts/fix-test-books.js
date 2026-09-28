const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log("Cleaning up stock for English test book...");
  await pool.query("UPDATE books SET stock = 22, stock_tamil = NULL, stock_english = 22 WHERE id = 'book_race2_1790588301152'");
  
  const res = await pool.query("SELECT id, title, language, stock, stock_tamil, stock_english, status FROM books ORDER BY id DESC");
  console.log("UPDATED BOOKS IN DB:\n", JSON.stringify(res.rows, null, 2));
  
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
