const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== DB_IDLE_TIMEOUT_MS ==="
    grep 'DB_IDLE_TIMEOUT_MS' /etc/blessing.env
    echo "=== META / WHATSAPP KEYS ==="
    grep -i 'whatsapp' /etc/blessing.env | awk -F= '{print $1 "=" ($2 ? "[SET]" : "[EMPTY]")}'
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
