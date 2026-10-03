const { Client } = require('ssh2');

const scriptContent = `
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function check() {
  try {
    const tableCheck = await pool.query("SELECT to_regclass('whatsapp_processed_events') as exists");
    console.log("whatsapp_processed_events table exists:", tableCheck.rows[0].exists !== null);

    if (tableCheck.rows[0].exists !== null) {
      const count = await pool.query("SELECT count(*) FROM whatsapp_processed_events");
      console.log("Total deduplicated events in PG ledger:", count.rows[0].count);

      const rows = await pool.query("SELECT * FROM whatsapp_processed_events ORDER BY processed_at DESC LIMIT 5");
      console.log("Recent PG events:", JSON.stringify(rows.rows, null, 2));
    }

    const Redis = require('ioredis');
    const r = new Redis('redis://127.0.0.1:6379');
    const keys = await r.keys('wa:event:*');
    console.log('Redis wa:event keys count:', keys.length);
    for (const k of keys) {
      const ttl = await r.ttl(k);
      console.log('  Key:', k, 'TTL:', ttl, 's');
    }
    r.disconnect();
  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    await pool.end();
  }
}
check();
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/tmp/check_pg_wa.js');
    writeStream.write(scriptContent);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('node /tmp/check_pg_wa.js', (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
