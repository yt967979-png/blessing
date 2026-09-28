const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query("SELECT DISTINCT language, COUNT(*) FROM books GROUP BY language;");
  console.log("DISTINCT LANGUAGES IN DB:", JSON.stringify(res.rows, null, 2));

  const allBooks = await pool.query("SELECT id, title, language, stock, stock_tamil, stock_english FROM books ORDER BY id DESC;");
  console.log("ALL BOOKS:", JSON.stringify(allBooks.rows, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
