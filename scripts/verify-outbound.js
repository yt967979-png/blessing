const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== TESTING META GRAPH API (WHATSAPP) ==="
    curl -sS -I https://graph.facebook.com | head -n 1
    echo "=== TESTING RAZORPAY API ==="
    curl -sS -I https://api.razorpay.com | head -n 1
    echo "=== TESTING ST COURIER API ==="
    curl -sS -I https://stcourier.com | head -n 1
    echo "=== TESTING REDIS CONNECTIVITY ==="
    redis-cli ping
    echo "=== TESTING POSTGRES CONNECTIVITY ==="
    sudo -u postgres psql -d blessing -c "SELECT 'POSTGRES OK' as status;"
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
