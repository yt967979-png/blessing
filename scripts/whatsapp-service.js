const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
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
let latestQrImage = null;
let latestPairingCode = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Blessing Power Guide', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      try {
        latestQrImage = await QRCode.toDataURL(qr);
      } catch (e) {
        latestQrImage = null;
      }
      console.log('\n==================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP PHONE:');
      console.log('==================================================');
      qrcodeTerminal.generate(qr, { small: true });
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
      latestQrImage = null;
      latestPairingCode = null;
      console.log('\n✅ [BAILEYS FREE WHATSAPP] Connected & Authenticated Successfully!');
      console.log('🚀 Ready to send 100% FREE UNLIMITED WhatsApp notifications with $0 fees!\n');
    }
  });
}

// Start HTTP REST API Server for Sending Messages & Serving QR Page
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (reqUrl.pathname === '/status' || reqUrl.pathname === '/api/status')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isConnected ? 'CONNECTED' : latestQrImage ? 'QR_READY' : 'INITIALIZING',
      connected: isConnected,
      qrAvailable: !!latestQrImage,
      qrImage: latestQrImage,
      qrString: latestQr,
      pairingCode: latestPairingCode,
      message: isConnected ? 'Ready for unlimited free dispatches' : 'Scan QR code or enter pairing code',
    }));
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/pair') {
    const phone = reqUrl.searchParams.get('phone');
    if (!phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing phone number query parameter' }));
      return;
    }

    try {
      if (sock && !isConnected) {
        const cleanPhone = phone.replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        const code = await sock.requestPairingCode(phoneWithCountry);
        latestPairingCode = code;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pairingCode: code }));
        return;
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  if (req.method === 'GET' && (reqUrl.pathname === '/' || reqUrl.pathname === '/qr')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Blessing WhatsApp Bot - QR Code Linker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b132b; color: #ffffff; text-align: center; padding: 40px 20px; }
          .card { background: #1c2541; border: 1px solid #3a506b; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          h1 { color: #fbbf24; font-size: 20px; margin-bottom: 8px; }
          p { color: #94a3b8; font-size: 13px; margin-bottom: 20px; }
          .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; margin: 15px 0; }
          img { width: 240px; height: 240px; display: block; }
          .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 12px; }
          .connected { background: #10b981; color: white; }
          .pending { background: #f59e0b; color: #000; }
        </style>
        <script>
          setInterval(async () => {
            try {
              const r = await fetch('/status');
              const d = await r.json();
              if (d.status === 'CONNECTED') {
                location.reload();
              }
            } catch(e) {}
          }, 3000);
        </script>
      </head>
      <body>
        <div class="card">
          <h1>BLESSING WHATSAPP BOT LINKER</h1>
          <p>Scan this QR code with your phone (WhatsApp → Settings → Linked Devices) to enable 100% FREE UNLIMITED messaging!</p>
          ${isConnected ? `
            <div class="badge connected">✅ WHATSAPP CONNECTED & READY</div>
            <p style="margin-top:15px; color:#10b981; font-weight:bold;">Your WhatsApp account is active! You can now send unlimited order notifications.</p>
          ` : latestQrImage ? `
            <div class="badge pending">⚡ SCAN QR CODE BELOW</div>
            <div class="qr-box">
              <img src="${latestQrImage}" alt="WhatsApp QR Code" />
            </div>
            <p style="font-size:11px; color:#cbd5e1;">Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
          ` : `
            <div class="badge pending">⏳ GENERATING QR CODE...</div>
            <p style="margin-top:15px;">Please wait 3 seconds and refresh this page.</p>
          `}
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/send') {
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
  console.log(`🌐 Web QR Code Page available at http://127.0.0.1:${PORT}/qr`);
  connectToWhatsApp();
});
