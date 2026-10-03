const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== NODE_MODULES CHECK ==="
    ls -d /opt/blessing/node_modules/pg || echo "pg not in /opt/blessing"
    find /opt/blessing -maxdepth 3 -name "pg" 2>/dev/null
    find /home -maxdepth 3 -name "node_modules" 2>/dev/null
    find /root -maxdepth 3 -name "node_modules" 2>/dev/null
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
