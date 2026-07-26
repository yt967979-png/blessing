const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const PORT = process.env.WHATSAPP_PORT || 4000;
const SESSION_DIR = path.join(__dirname, '../whatsapp_session');
const PUBLIC_DIR = path.join(__dirname, '../public');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const { Client } = require('pg');

const STATUS_FILE = path.join(PUBLIC_DIR, 'whatsapp_status.json');
const QR_IMAGE_FILE = path.join(PUBLIC_DIR, 'whatsapp_qr.png');
const RAILWAY_DB_FALLBACK = process.env.DATABASE_URL || "postgresql://postgres:USdOHOzspyXMPFmDnfsjkxoSIGedYwgk@sakura.proxy.rlwy.net:32874/railway";

async function saveToDatabase(data) {
  let client = null;
  try {
    client = new Client({
      connectionString: RAILWAY_DB_FALLBACK,
      ssl: RAILWAY_DB_FALLBACK.includes('railway') || RAILWAY_DB_FALLBACK.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    await client.query(
      `INSERT INTO whatsapp_sessions (id, status, connected, qr_image, pairing_code, message, updated_at)
       VALUES ('default', $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET status = EXCLUDED.status,
           connected = EXCLUDED.connected,
           qr_image = EXCLUDED.qr_image,
           pairing_code = EXCLUDED.pairing_code,
           message = EXCLUDED.message,
           updated_at = NOW()`,
      [data.status || 'UNKNOWN', !!data.connected, data.qrImage || null, data.pairingCode || null, data.message || null]
    );
  } catch (e) {
    // DB sync logging
  } finally {
    if (client) try { await client.end(); } catch (_) {}
  }
}

function updateStateFile(data) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
    saveToDatabase(data);
  } catch (e) {
    console.error('Error writing status file:', e.message);
  }
}

// Initial status
updateStateFile({ status: 'INITIALIZING', connected: false, message: 'WhatsApp Engine Starting...' });

let sock = null;
let isConnected = false;

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
      try {
        const qrBuffer = await QRCode.toBuffer(qr);
        fs.writeFileSync(QR_IMAGE_FILE, qrBuffer);

        const qrDataUrl = await QRCode.toDataURL(qr);

        updateStateFile({
          status: 'QR_READY',
          connected: false,
          qrImage: qrDataUrl,
          qrFile: '/whatsapp_qr.png',
          timestamp: Date.now(),
          message: 'Scan QR Code with WhatsApp phone',
        });
      } catch (e) {
        console.error('Error writing QR image:', e.message);
      }

      console.log('\n==================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP PHONE:');
      console.log('==================================================');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      updateStateFile({
        status: 'DISCONNECTED',
        connected: false,
        message: 'Reconnecting to WhatsApp...',
        timestamp: Date.now(),
      });
      console.log('❌ WhatsApp connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      isConnected = true;
      if (fs.existsSync(QR_IMAGE_FILE)) {
        try { fs.unlinkSync(QR_IMAGE_FILE); } catch (e) {}
      }

      updateStateFile({
        status: 'CONNECTED',
        connected: true,
        qrImage: null,
        message: 'WhatsApp Bot Connected and Active!',
        timestamp: Date.now(),
      });

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

  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (reqUrl.pathname === '/status' || reqUrl.pathname === '/api/status')) {
    let statusData = { status: isConnected ? 'CONNECTED' : 'INITIALIZING', connected: isConnected };
    if (fs.existsSync(STATUS_FILE)) {
      try { statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusData));
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

  if (req.method === 'POST' && (reqUrl.pathname === '/unlink' || reqUrl.pathname === '/logout')) {
    try {
      if (sock) {
        try { await sock.logout(); } catch (_) {}
      }
      isConnected = false;
      if (fs.existsSync(SESSION_DIR)) {
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }
      updateStateFile({ status: 'DISCONNECTED', connected: false, message: 'Unlinked by Admin. Scan new QR code.' });
      setTimeout(connectToWhatsApp, 2000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'WhatsApp session unlinked successfully.' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`⚡ Baileys Free Unlimited WhatsApp Service running on port ${PORT}`);
  connectToWhatsApp();
});
