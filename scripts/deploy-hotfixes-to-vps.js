const { Client } = require('ssh2');
const path = require('path');

async function deploy() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: '148.113.8.82',
      port: 20033,
      username: 'root',
      password: 'xCqQSF4Xxq3In9kb',
    });
  });

  console.log('Connected to VPS.');

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  const files = [
    {
      local: path.join(__dirname, '../src/lib/serverSecurity.ts'),
      remote: '/opt/blessing/src/lib/serverSecurity.ts',
    },
    {
      local: path.join(__dirname, '../src/app/api/webhooks/whatsapp/route.ts'),
      remote: '/opt/blessing/src/app/api/webhooks/whatsapp/route.ts',
    },
  ];

  for (const f of files) {
    console.log(`Uploading ${f.local} -> ${f.remote}...`);
    await new Promise((resolve, reject) => {
      sftp.fastPut(f.local, f.remote, (err) => (err ? reject(err) : resolve()));
    });
    console.log(`✓ Uploaded ${f.remote}`);
  }

  // Set ownership
  await new Promise((resolve, reject) => {
    conn.exec('chown -R ubuntu:ubuntu /opt/blessing/src', (err, stream) => {
      if (err) return reject(err);
      stream.on('close', resolve);
    });
  });

  console.log('Building Next.js on VPS...');
  await new Promise((resolve, reject) => {
    conn.exec('sudo -u ubuntu bash -c "cd /opt/blessing && npm run build"', (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error('Build failed with code ' + code));
      });
    });
  });

  console.log('Restarting worker services...');
  await new Promise((resolve, reject) => {
    conn.exec('systemctl restart blessing@3000 blessing@3001', (err, stream) => {
      if (err) return reject(err);
      stream.on('close', resolve);
    });
  });

  console.log('Checking worker status...');
  await new Promise((resolve, reject) => {
    conn.exec('systemctl is-active blessing@3000 blessing@3001', (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.on('close', resolve);
    });
  });

  conn.end();
  console.log('✅ Deployment and restart complete!');
}

deploy().catch(err => {
  console.error('Deploy error:', err);
  process.exit(1);
});
