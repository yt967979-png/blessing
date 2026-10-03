const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH Connection READY to new VPS!');
  conn.exec('uname -a && whoami && cat /etc/os-release | grep PRETTY_NAME && free -m && df -h /', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream closed with code:', code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT:\n' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR:\n' + data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection ERROR:', err.message);
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
  readyTimeout: 20000,
});
