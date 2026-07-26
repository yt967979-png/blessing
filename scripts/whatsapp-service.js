const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const PORT = process.env.WHATSAPP_PORT || 4000;
const SESSION_DIR = path.join(__dirname, '../whatsapp_session');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

let sock = null;
let isConnected = false;
let latestQr = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log('\n==================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP PHONE:');
      console.log('==================================================');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      console.log('❌ WhatsApp connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      isConnected = true;
      latestQr = null;
      console.log('\n✅ [BAILEYS FREE WHATSAPP] Connected & Authenticated Successfully!');
      console.log('🚀 Ready to send 100% FREE UNLIMITED WhatsApp notifications with $0 fees!\n');
    }
  });
}

// Start HTTP REST API Server for Sending Messages
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
      qrAvailable: !!latestQr,
      qrString: latestQr,
      message: isConnected ? 'Ready for unlimited free dispatches' : 'Scan QR code to connect',
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/send') {
    let bodyStr = '';
    req.on('data', (chunk) => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const { to, message } = JSON.parse(bodyStr);
        if (!isConnected || !sock) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'WhatsApp is not connected. Scan QR code first.' }));
          return;
        }

        const cleanPhone = (to || '').replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        const jid = `${phoneWithCountry}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });

        console.log(`✅ [FREE BAILEYS SENT] Message sent to +${phoneWithCountry}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, recipient: phoneWithCountry }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`⚡ Baileys Free Unlimited WhatsApp Service running on http://127.0.0.1:${PORT}`);
  connectToWhatsApp();
});
