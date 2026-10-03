const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    chown -R ubuntu:ubuntu /opt/blessing/src
    echo "=== RUNNING NEXT.JS BUILD ==="
    sudo -u ubuntu bash -c "cd /opt/blessing && npx next build"
    echo "=== RESTARTING WORKERS ==="
    systemctl restart blessing@3000 blessing@3001
    echo "=== SERVICE STATUS ==="
    systemctl is-active blessing@3000 blessing@3001
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', code => {
      console.log('\nProcess finished with exit code:', code);
      conn.end();
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
