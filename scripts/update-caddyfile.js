const { Client } = require('ssh2');

const caddyfile = `
www.blessingpowerguide.in {
\tredir https://blessingpowerguide.in{uri} permanent
}

blessingpowerguide.in {
\tencode zstd gzip

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
\t\t\tflush_interval -1
\t\t}
\t}

\thandle {
\t\treverse_proxy 127.0.0.1:3000 127.0.0.1:3001 {
\t\t\tlb_policy round_robin
\t\t}
\t}
}

http://148.113.8.82 {
\thandle {
\t\treverse_proxy 127.0.0.1:3000 127.0.0.1:3001 {
\t\t\tlb_policy round_robin
\t\t}
\t}
}
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const stream = sftp.createWriteStream('/etc/caddy/Caddyfile');
    stream.write(caddyfile);
    stream.end(() => {
      console.log('Caddyfile written!');
      conn.exec('systemctl reload caddy && echo "Caddy reloaded"', (err2, s) => {
        if (err2) throw err2;
        s.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
