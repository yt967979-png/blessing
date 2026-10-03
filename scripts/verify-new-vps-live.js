const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== WORKER STATUS ==="
    systemctl is-active blessing@3000 blessing@3001 redis-server postgresql caddy
    echo ""
    echo "=== RECENT JOURNAL LOGS ==="
    journalctl -u blessing@3000 -u blessing@3001 -n 15 --no-pager
    echo ""
    echo "=== DATABASE STATS ==="
    sudo -u postgres psql -d blessing -c "SELECT count(*) as orders FROM orders; SELECT count(*) as users FROM users; SELECT count(*) as books FROM books; SELECT count(*) as processed_events FROM whatsapp_processed_events;"
    echo ""
    echo "=== INTERNAL HEALTH & TRACKING TEST ==="
    curl -sS http://127.0.0.1:3000/api/health
    echo ""
    curl -sS http://127.0.0.1:3000/api/track?order=BPG-TFTZ-M1QR | cut -c 1-200
    echo ""
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
