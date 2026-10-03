const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

function runRemoteCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================`);
    console.log(`RUNNING: ${cmd}`);
    console.log(`========================================`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code !== 0) {
          console.error(`Command exited with code ${code}`);
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

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(`Uploading ${localPath} -> ${remotePath}...`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) return reject(err);
      console.log(`✓ Uploaded ${remotePath}`);
      resolve();
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
      readyTimeout: 30000,
    });
  });

  console.log('Connected to new VPS!');

  // Open SFTP
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, sftpSession) => {
      if (err) return reject(err);
      resolve(sftpSession);
    });
  });

  // 1. Upload environment file to /etc/blessing.env
  await uploadFile(sftp, path.resolve('.env.vps.bak'), '/etc/blessing.env');

  // 2. Upload database dump & uploads archive
  await uploadFile(sftp, path.resolve('latest_db.sql.gz'), '/tmp/latest_db.sql.gz');
  await uploadFile(sftp, path.resolve('latest_uploads.tar.gz'), '/tmp/latest_uploads.tar.gz');

  // 3. Set permissions on /etc/blessing.env
  await runRemoteCommand(conn, `
    chmod 600 /etc/blessing.env
    chown ubuntu:ubuntu /etc/blessing.env
    sed -i 's/\r$//' /etc/blessing.env
  `);

  // 4. Restore database dump into PostgreSQL
  await runRemoteCommand(conn, `
    echo "Restoring database from /tmp/latest_db.sql.gz..."
    gunzip -c /tmp/latest_db.sql.gz | sudo -u postgres psql -d blessing
    sudo -u postgres psql -d blessing -c "SELECT count(*) as total_orders FROM orders;"
    sudo -u postgres psql -d blessing -c "SELECT count(*) as total_books FROM books;"
  `);

  // 5. Clone git repository into /opt/blessing
  await runRemoteCommand(conn, `
    mkdir -p /opt/blessing
    if [ ! -d /opt/blessing/.git ]; then
      git clone https://github.com/yt967979-png/blessing.git /opt/blessing
    else
      cd /opt/blessing && git pull origin main || true
    fi
    chown -R ubuntu:ubuntu /opt/blessing
  `);

  // 6. Restore uploads into /opt/blessing/public/uploads
  await runRemoteCommand(conn, `
    mkdir -p /opt/blessing/public/uploads
    tar -xzf /tmp/latest_uploads.tar.gz -C /opt/blessing/public/uploads/ || tar -xzf /tmp/latest_uploads.tar.gz -C /opt/blessing/public/ || true
    chown -R ubuntu:ubuntu /opt/blessing/public/uploads
    ls -la /opt/blessing/public/uploads/ | head -n 10
  `);

  // 7. Upload the 5 hardened files directly into /opt/blessing/
  await uploadFile(sftp, path.resolve('src/lib/whatsapp.ts'), '/opt/blessing/src/lib/whatsapp.ts');
  await uploadFile(sftp, path.resolve('src/lib/stockHold.ts'), '/opt/blessing/src/lib/stockHold.ts');
  await uploadFile(sftp, path.resolve('src/lib/orderFinalizer.ts'), '/opt/blessing/src/lib/orderFinalizer.ts');
  await uploadFile(sftp, path.resolve('src/app/api/webhooks/razorpay/route.ts'), '/opt/blessing/src/app/api/webhooks/razorpay/route.ts');
  await uploadFile(sftp, path.resolve('src/app/api/orders/route.ts'), '/opt/blessing/src/app/api/orders/route.ts');

  // Fix ownership of updated files
  await runRemoteCommand(conn, `chown -R ubuntu:ubuntu /opt/blessing`);

  // 8. npm ci --include=dev (clean environment without NODE_ENV=production)
  await runRemoteCommand(conn, `
    echo "Running npm ci --include=dev as ubuntu..."
    sudo -u ubuntu bash -lc "cd /opt/blessing && npm ci --include=dev"
  `);

  // 9. npm run build (with /etc/blessing.env sourced)
  await runRemoteCommand(conn, `
    echo "Building Next.js application..."
    sudo -u ubuntu bash -lc "set -a; source /etc/blessing.env; set +a; cd /opt/blessing && npm run build"
  `);

  // 10. Install systemd service for worker 3000 & 3001
  await runRemoteCommand(conn, `
    cp /opt/blessing/deploy/aws/blessing@.service /etc/systemd/system/blessing@.service
    systemctl daemon-reload
    systemctl enable blessing@3000 blessing@3001
    systemctl restart blessing@3000 blessing@3001
    sleep 3
    systemctl status blessing@3000 blessing@3001 --no-pager
  `);

  // 11. Configure Caddyfile with both domain and public IP access
  const caddyfileContent = `
www.blessingpowerguide.in {
\tredir https://blessingpowerguide.in{uri} permanent
}

blessingpowerguide.in {
\tencode zstd gzip

\tlog {
\t\toutput file /var/log/caddy/access.log {
\t\t\troll_size 10mb
\t\t\troll_keep 3
\t\t}
\t}

\thandle_path /_next/static/* {
\t\troot * /opt/blessing/.next/static
\t\tfile_server
\t\theader Cache-Control "public, max-age=31536000, immutable"
\t}

\t@uploads path /uploads/*
\thandle @uploads {
\t\troot * /opt/blessing/public
\t\tfile_server
\t\theader Cache-Control "public, max-age=2592000, stale-while-revalidate=86400"
\t}

\t@sse path /api/stock/stream /api/orders/stream /api/support/stream
\thandle @sse {
\t\treverse_proxy 127.0.0.1:3000 127.0.0.1:3001 {
\t\t\tlb_policy round_robin
\t\t\tlb_try_duration 6s
\t\t\tflush_interval -1
\t\t\theader_down X-Proxy-Upstream {upstream_hostport}
\t\t}
\t}

\thandle {
\t\treverse_proxy 127.0.0.1:3000 127.0.0.1:3001 {
\t\t\tlb_policy round_robin
\t\t\tlb_try_duration 6s
\t\t\thealth_uri /api/health
\t\t\thealth_interval 10s
\t\t\thealth_timeout 5s
\t\t\theader_down X-Proxy-Upstream {upstream_hostport}
\t\t\ttransport http {
\t\t\t\tkeepalive 60s
\t\t\t\tkeepalive_idle_conns 250
\t\t\t}
\t\t}
\t}
}

:80 {
\thandle {
\t\treverse_proxy 127.0.0.1:3000 127.0.0.1:3001 {
\t\t\tlb_policy round_robin
\t\t}
\t}
}
`;

  await runRemoteCommand(conn, `
    cat << 'EOF' > /etc/caddy/Caddyfile
${caddyfileContent}
EOF
    systemctl restart caddy
    sleep 2
    systemctl status caddy --no-pager
  `);

  // 12. Firewall Setup (Allow 20033 SSH, 80 HTTP, 443 HTTPS)
  await runRemoteCommand(conn, `
    ufw allow 20033/tcp comment "SSH custom port"
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    ufw --force enable
    ufw status verbose
  `);

  // 13. Crontab automated backup setup
  await runRemoteCommand(conn, `
    mkdir -p /var/backups/blessing
    chmod +x /opt/blessing/deploy/aws/backup-db.sh
    (crontab -l 2>/dev/null | grep -v 'backup-db.sh' ; echo "0 3 * * * /bin/bash /opt/blessing/deploy/aws/backup-db.sh >/var/log/blessing-backup.log 2>&1") | crontab -
    crontab -l
  `);

  // 14. Live Endpoint Validation on new server
  await runRemoteCommand(conn, `
    echo "Testing local endpoints..."
    curl -sS -I http://127.0.0.1:3000/api/health
    curl -sS -I http://127.0.0.1:3001/api/health
    curl -sS -I http://127.0.0.1/api/health
    curl -sS -I http://127.0.0.1/api/ready
    curl -sS -I http://127.0.0.1/api/products
  `);

  console.log('\n======================================================');
  console.log('>>> COMPLETE SUCCESS: NEW VPS IS FULLY DEPLOYED & LIVE! <<<');
  console.log('======================================================');

  conn.end();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
