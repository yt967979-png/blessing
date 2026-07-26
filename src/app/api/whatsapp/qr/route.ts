import { NextResponse } from 'next/server';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

// Global singleton state across hot reloads in Next.js
const globalForWa = global as unknown as {
  waSock: any;
  waConnected: boolean;
  waQrImage: string | null;
  waPairingCode: string | null;
  waInitStarted: boolean;
};

if (!globalForWa.waInitStarted) {
  globalForWa.waSock = null;
  globalForWa.waConnected = false;
  globalForWa.waQrImage = null;
  globalForWa.waPairingCode = null;
  globalForWa.waInitStarted = false;
}

const SESSION_DIR = path.join(process.cwd(), 'whatsapp_session');

async function initBaileysSocket() {
  if (globalForWa.waInitStarted && globalForWa.waSock) return;
  globalForWa.waInitStarted = true;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Blessing Power Guide', 'Chrome', '1.0.0'],
    });

    globalForWa.waSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          globalForWa.waQrImage = await QRCode.toDataURL(qr);
        } catch (e) {
          globalForWa.waQrImage = null;
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        globalForWa.waConnected = false;
        globalForWa.waInitStarted = false;

        if (shouldReconnect) {
          setTimeout(initBaileysSocket, 3000);
        }
      } else if (connection === 'open') {
        globalForWa.waConnected = true;
        globalForWa.waQrImage = null;
        globalForWa.waPairingCode = null;
        console.log('✅ [NEXT.JS BAILEYS] WhatsApp Bot Linked & Active!');
      }
    });
  } catch (err: any) {
    console.error('Baileys Init Error:', err.message);
    globalForWa.waInitStarted = false;
  }
}

export async function GET(request: Request) {
  // Start socket if not initialized
  if (!globalForWa.waInitStarted) {
    initBaileysSocket();
  }

  const { searchParams } = new URL(request.url);
  const phoneNumber = searchParams.get('phone');

  // If user requests 8-digit Pairing Code for direct phone linking
  if (phoneNumber && globalForWa.waSock && !globalForWa.waConnected) {
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const pairingCode = await globalForWa.waSock.requestPairingCode(cleanPhone);
      globalForWa.waPairingCode = pairingCode;
      return NextResponse.json({
        status: 'PAIRING_CODE_READY',
        pairingCode: pairingCode,
        message: 'Enter this 8-digit code in WhatsApp → Linked Devices → Link with phone number',
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: globalForWa.waConnected ? 'CONNECTED' : globalForWa.waQrImage ? 'QR_READY' : 'INITIALIZING',
    connected: globalForWa.waConnected,
    qrImage: globalForWa.waQrImage,
    pairingCode: globalForWa.waPairingCode,
    message: globalForWa.waConnected
      ? 'WhatsApp Bot is Connected and Ready for Unlimited Messages!'
      : 'Scan QR code or request Pairing Code to link WhatsApp',
  });
}
