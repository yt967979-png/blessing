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

async function backupSessionToDb() {
  let client = null;
  try {
    if (!fs.existsSync(SESSION_DIR)) return;
    const files = fs.readdirSync(SESSION_DIR);
    const sessionMap = {};
    for (const f of files) {
      if (f.endsWith('.json')) {
        sessionMap[f] = fs.readFileSync(path.join(SESSION_DIR, f), 'utf8');
      }
    }
    const sessionJson = JSON.stringify(sessionMap);
    if (Object.keys(sessionMap).length === 0) return;

    client = new Client({
      connectionString: RAILWAY_DB_FALLBACK,
      ssl: RAILWAY_DB_FALLBACK.includes('railway') || RAILWAY_DB_FALLBACK.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    await client.query(
      `INSERT INTO whatsapp_sessions (id, status, connected, session_data, updated_at)
       VALUES ('default', 'CONNECTED', true, $1, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET session_data = EXCLUDED.session_data,
           status = 'CONNECTED',
           connected = true,
           updated_at = NOW()`,
      [sessionJson]
    );
  } catch (e) {
    console.error('Error backing up session to DB:', e.message);
  } finally {
    if (client) try { await client.end(); } catch (_) {}
  }
}

async function restoreSessionFromDb() {
  let client = null;
  try {
    client = new Client({
      connectionString: RAILWAY_DB_FALLBACK,
      ssl: RAILWAY_DB_FALLBACK.includes('railway') || RAILWAY_DB_FALLBACK.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    const res = await client.query(`SELECT session_data FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`);
    if (res.rows.length > 0 && res.rows[0].session_data) {
      const sessionMap = JSON.parse(res.rows[0].session_data);
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }
      for (const [filename, content] of Object.entries(sessionMap)) {
        fs.writeFileSync(path.join(SESSION_DIR, filename), content as string);
      }
      console.log('✅ WhatsApp Auth Credentials successfully restored from Railway PostgreSQL database!');
    }
  } catch (e) {
    console.error('DB session restore notice:', e.message);
  } finally {
    if (client) try { await client.end(); } catch (_) {}
  }
}

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
  await restoreSessionFromDb();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Blessing Power Guide', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    backupSessionToDb();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !isConnected) {
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
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = !isLoggedOut;

      if (!isLoggedOut) {
        // Keeps user status as CONNECTED in DB during temporary reconnects
        console.log('🔄 Temporary WhatsApp socket drop. Preserving session & reconnecting...');
        setTimeout(connectToWhatsApp, 3000);
      } else {
        isConnected = false;
        updateStateFile({
          status: 'DISCONNECTED',
          connected: false,
          message: 'WhatsApp session unlinked.',
          timestamp: Date.now(),
        });
        console.log('❌ WhatsApp logged out permanently.');
      }
    } else if (connection === 'open') {
      isConnected = true;
      if (fs.existsSync(QR_IMAGE_FILE)) {
        try { fs.unlinkSync(QR_IMAGE_FILE); } catch (e) {}
      }

      backupSessionToDb();

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
      try {
        const fileData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        statusData = { ...fileData };
        if (isConnected) {
          statusData.status = 'CONNECTED';
          statusData.connected = true;
          statusData.qrImage = null;
        }
      } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusData));
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && (reqUrl.pathname === '/pair' || reqUrl.pathname === '/api/pair')) {
    let bodyStr = '';
    req.on('data', (chunk) => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        let phoneParam = reqUrl.searchParams.get('phone');
        if (!phoneParam && bodyStr) {
          try {
            const parsed = JSON.parse(bodyStr);
            phoneParam = parsed.phone;
          } catch (_) {}
        }

        const cleanPhone = (phoneParam || '').replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid phone number is required (min 10 digits)' }));
          return;
        }

        if (!sock) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'WhatsApp socket not initialized' }));
          return;
        }

        const code = await sock.requestPairingCode(cleanPhone);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        updateStateFile({
          status: 'PAIRING_CODE_READY',
          connected: false,
          pairingCode: formattedCode,
          message: `8-Digit Pairing Code Generated for ${cleanPhone}`,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pairingCode: formattedCode }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
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
