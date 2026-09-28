const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Updating Race Test Book 0 Stock to language = 'English'...");
  await pool.query("UPDATE books SET language = 'English' WHERE title ILIKE '%Race Test Book 0 Stock%'");

  const res = await pool.query("SELECT id, title, language, stock, stock_tamil, stock_english FROM books WHERE title ILIKE '%Race Test Book%';");
  console.log("AFTER UPDATE:", JSON.stringify(res.rows, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
