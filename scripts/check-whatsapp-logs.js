const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== RECENT WHATSAPP LOGS ON VPS ==="
    journalctl -u blessing@3000 -u blessing@3001 --since "30 minutes ago" --no-pager | grep -i "whatsapp" | tail -n 50
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', code => {
      conn.end();
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
