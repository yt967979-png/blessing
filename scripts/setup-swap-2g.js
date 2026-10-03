const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== ENABLING 2GB SWAPFILE ==="
    chmod 600 /swapfile
    mkswap /swapfile || true
    swapon /swapfile || true
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.d/99-swappiness.conf

    echo "=== VERIFYING FREE -H ==="
    free -h

    echo "=== VERIFYING SWAPON --SHOW ==="
    swapon --show

    echo "=== VERIFYING SYSCTL VM.SWAPPINESS ==="
    sysctl vm.swappiness
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', code => {
      console.log('Finished with code:', code);
      conn.end();
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
