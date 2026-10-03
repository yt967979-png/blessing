const { Client } = require('ssh2');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log('Uploading caddy_certs.tar.gz to new VPS...');
    sftp.fastPut(path.resolve('caddy_certs.tar.gz'), '/tmp/caddy_certs.tar.gz', (err2) => {
      if (err2) throw err2;
      console.log('✓ Uploaded caddy_certs.tar.gz');
      const cmd = `
        mkdir -p /var/lib/caddy/.local/share
        tar -xzf /tmp/caddy_certs.tar.gz -C /var/lib/caddy/.local/share/
        chown -R caddy:caddy /var/lib/caddy/
        find /var/lib/caddy/.local/share/caddy/certificates -type f
        systemctl restart caddy
        sleep 2
        systemctl status caddy --no-pager
      `;
      conn.exec(cmd, (err3, stream) => {
        if (err3) throw err3;
        stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
