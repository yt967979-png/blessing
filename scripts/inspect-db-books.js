const { Pool } = require('pg');
const fs = require('fs');

// Read /etc/blessing.env if available, or process.env
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync('/etc/blessing.env')) {
  const envContent = fs.readFileSync('/etc/blessing.env', 'utf-8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n\r]+)["']?/);
  if (match) dbUrl = match[1];
}

const pool = new Pool({ connectionString: dbUrl });

async function run() {
  const res = await pool.query("SELECT id, title, language, stock, stock_tamil, stock_english, status FROM books ORDER BY id DESC LIMIT 20");
  console.log("BOOKS IN DATABASE (Total found: " + res.rows.length + "):");
  console.table(res.rows);
  await pool.end();
}

run().catch(console.error);
