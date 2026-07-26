import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { initWhatsAppInProcess } from '@/lib/whatsapp';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');

  // Asynchronously trigger in-process Baileys initialization
  let activeSock: any = null;
  try {
    activeSock = await initWhatsAppInProcess();
  } catch (err) {
    console.error('Failed in-process init in QR route:', err);
  }

  // If phone parameter is provided, request 8-digit Pairing Code from active in-process socket
  if (phone && activeSock) {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        const code = await activeSock.requestPairingCode(cleanPhone);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        // Save status update
        const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
        fs.writeFileSync(
          statusFile,
          JSON.stringify({
            status: 'PAIRING_CODE_READY',
            connected: false,
            pairingCode: formattedCode,
            message: `8-Digit Pairing Code Generated for ${cleanPhone}`,
            timestamp: Date.now(),
          }, null, 2)
        );

        return NextResponse.json({ success: true, pairingCode: formattedCode });
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Failed to generate pairing code' }, { status: 500 });
    }
  }

  // 1. Read directly from Railway PostgreSQL DB
  try {
    const db = await import('@/lib/db');
    const client = await db.getDbClient();
    if (client) {
      const res = await client.query(`SELECT status, connected, qr_image, pairing_code, message FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`);
      await client.end();
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return NextResponse.json({
          status: row.status,
          connected: row.connected,
          qrImage: row.qr_image,
          pairingCode: row.pairing_code,
          message: row.message,
        });
      }
    }
  } catch (_) {}

  // 2. Fallback to local status file
  const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
  if (fs.existsSync(statusFile)) {
    try {
      const content = fs.readFileSync(statusFile, 'utf8');
      const data = JSON.parse(content);
      return NextResponse.json(data);
    } catch (e: any) {
      console.error('Error reading whatsapp_status.json:', e.message);
    }
  }

  return NextResponse.json({
    status: 'INITIALIZING',
    connected: false,
    qrImage: null,
    message: 'Generating WhatsApp QR Code & Session...',
  });
}

export async function DELETE() {
  // Clear Database session status
  try {
    const db = await import('@/lib/db');
    const client = await db.getDbClient();
    if (client) {
      await client.query(`UPDATE whatsapp_sessions SET status = 'DISCONNECTED', connected = false, qr_image = NULL, session_data = NULL, message = 'Unlinked by admin' WHERE id = 'default'`);
      await client.end();
    }
  } catch (_) {}

  // Clear session directory directly
  const sessionDir = path.join(process.cwd(), 'whatsapp_session');
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (_) {}
  }

  // Reset local status file
  const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
  fs.writeFileSync(
    statusFile,
    JSON.stringify({ status: 'DISCONNECTED', connected: false, message: 'Session unlinked by admin.' }, null, 2)
  );

  return NextResponse.json({ success: true, message: 'Unlinked WhatsApp session.' });
}
