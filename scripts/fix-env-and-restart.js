const { Client } = require('ssh2');

function runRemoteCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`RUNNING: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
        }
        resolve(stdout);
      }).on('data', (data) => {
        process.stdout.write(data);
        stdout += data;
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
        stderr += data;
      });
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: '148.113.8.82',
      port: 20033,
      username: 'root',
      password: 'xCqQSF4Xxq3In9kb',
    });
  });

  // 1. Convert /etc/blessing.env to clean UTF-8
  await runRemoteCommand(conn, `
    iconv -f UTF-16LE -t UTF-8 /etc/blessing.env > /tmp/env_clean
    tr -d '\\r' < /tmp/env_clean > /etc/blessing.env
    rm -f /tmp/env_clean
    chmod 600 /etc/blessing.env
    chown ubuntu:ubuntu /etc/blessing.env
    file /etc/blessing.env
    head -n 5 /etc/blessing.env
  `);

  // 2. Rebuild with proper environment loaded
  await runRemoteCommand(conn, `
    echo "Rebuilding Next.js with clean environment..."
    sudo -u ubuntu bash -lc "set -a; source /etc/blessing.env; set +a; cd /opt/blessing && npm run build"
  `);

  // 3. Restart services
  await runRemoteCommand(conn, `
    systemctl restart blessing@3000 blessing@3001
    sleep 3
    systemctl status blessing@3000 blessing@3001 --no-pager
  `);

  // 4. Test endpoints
  await runRemoteCommand(conn, `
    echo "Testing health endpoints..."
    curl -sS -I http://127.0.0.1:3000/api/health
    curl -sS -I http://127.0.0.1:3001/api/health
    curl -sS -I http://127.0.0.1/api/health
    curl -sS -I http://127.0.0.1/api/products
  `);

  conn.end();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
