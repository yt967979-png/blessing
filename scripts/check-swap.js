const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('free -h; echo "---"; cat /proc/swaps; echo "---"; cat /proc/meminfo | grep -i swap', (err, stream) => {
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
