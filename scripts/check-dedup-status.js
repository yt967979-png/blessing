const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const remoteCmd = [
    "echo '=== POSTGRESQL whatsapp_processed_events TABLE ==='",
    "sudo -u postgres psql -d blessing -c 'SELECT * FROM whatsapp_processed_events ORDER BY processed_at DESC LIMIT 5;'",
    "echo '=== REDIS KEYS FOR WA EVENTS ==='",
    "redis-cli keys 'wa:event:*'",
    "echo '=== JOURNAL LOGS FOR TEST EVENT ==='",
    "journalctl -u 'blessing@3000' -u 'blessing@3001' --since '10 minutes ago' | grep -i 'WhatsApp' | tail -n 20"
  ].join('\n');

  conn.exec(remoteCmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
