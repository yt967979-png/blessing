const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== SERVICES ==="
    systemctl is-active blessing@3000 blessing@3001 caddy postgresql redis-server
    echo "=== PG CONNECTIONS ==="
    sudo -u postgres psql -t -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
    echo "=== LIVE PROD URL ==="
    curl -s -o /dev/null -w "HTTP: %{http_code} | Time: %{time_total}s\n" https://blessingpowerguide.in/
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
