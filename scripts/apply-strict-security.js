const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== CLEANING UP DUPLICATE ENV IN /etc/blessing.env ==="
    # Remove duplicate DB_IDLE_TIMEOUT_MS entries
    sed -i '/DB_IDLE_TIMEOUT_MS/d' /etc/blessing.env
    echo "DB_IDLE_TIMEOUT_MS=10000" >> /etc/blessing.env
    
    # Ensure ENFORCE_META_SIGNATURE is set
    sed -i '/ENFORCE_META_SIGNATURE/d' /etc/blessing.env
    sed -i '/STRICT_WEBHOOK_SECURITY/d' /etc/blessing.env
    echo "ENFORCE_META_SIGNATURE=true" >> /etc/blessing.env
    echo "STRICT_WEBHOOK_SECURITY=true" >> /etc/blessing.env
    
    echo "=== RESTARTING WORKERS ==="
    systemctl restart blessing@3000 blessing@3001
    sleep 3
    
    echo "=== POSTGRESQL CONNECTIONS AFTER RESTART ==="
    export PGPASSWORD=blessing2025
    psql -h localhost -U blessing -d blessing -c "SELECT count(*) as total, count(*) FILTER (WHERE state = 'active') as active, count(*) FILTER (WHERE state = 'idle') as idle FROM pg_stat_activity WHERE datname = 'blessing';"
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
