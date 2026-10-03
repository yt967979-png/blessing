const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== CGROUP SWAP INSPECTION ==="
    cat /sys/fs/cgroup/memory.swap.max 2>/dev/null || true
    cat /sys/fs/cgroup/memory.swap.current 2>/dev/null || true
    echo "=== ATTEMPTING WRITE TO CGROUP SWAP ==="
    echo "2147483648" > /sys/fs/cgroup/memory.swap.max 2>&1 || true
    cat /sys/fs/cgroup/memory.swap.max 2>/dev/null || true
    echo "=== FREE -H AFTER ==="
    free -h
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
