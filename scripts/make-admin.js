const { Client } = require('pg');
try { require('dotenv').config(); } catch (e) {}

const email = process.argv[2] ? process.argv[2].trim().toLowerCase() : '';
if (!email) {
  console.log('Usage: node scripts/make-admin.js <email-or-phone>');
  process.exit(1);
}

const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connStr) {
  console.error('DATABASE_URL environment variable is missing.');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: connStr.replace(/([?&])sslmode=[^&]*/gi, ''),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const cleanInput = email.replace(/\D/g, '');
  const isPhone = cleanInput.length >= 10;

  const query = isPhone
    ? `UPDATE users SET role = 'admin', status = 'active', updated_at = NOW() WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1 RETURNING id, name, email, phone, role`
    : `UPDATE users SET role = 'admin', status = 'active', updated_at = NOW() WHERE LOWER(email) = $1 RETURNING id, name, email, phone, role`;

  const param = isPhone ? cleanInput.slice(-10) : email;
  const res = await client.query(query, [param]);

  if (res.rows.length === 0) {
    console.log(`❌ No user account found matching "${email}". Please register on the website first.`);
  } else {
    const u = res.rows[0];
    console.log(`✅ Success! User "${u.name}" (${u.email || u.phone}) is now an ADMIN.`);
  }

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
