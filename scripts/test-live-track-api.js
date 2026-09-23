const http = require('http');

const body = JSON.stringify({ orderId: 'BPG-WHTB22KK', phone: '9360345770' });

const req = http.request('http://127.0.0.1:3000/api/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Response Body:', JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.write(body);
req.end();
