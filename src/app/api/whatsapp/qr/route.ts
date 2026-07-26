import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');

  // If phone parameter is provided, request 8-digit Pairing Code from Baileys process (port 4000)
  if (phone) {
    try {
      const resPair = await fetch(`http://127.0.0.1:4000/pair?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (resPair.ok) {
        const pairData = await resPair.json();
        return NextResponse.json(pairData);
      } else {
        const errData = await resPair.json();
        return NextResponse.json({ error: errData.error || 'Failed to generate pairing code' }, { status: 400 });
      }
    } catch (e: any) {
      return NextResponse.json({ error: 'WhatsApp service offline on port 4000' }, { status: 500 });
    }
  }

  // 1. Try polling live Baileys background service on port 4000 first
  try {
    const resPort = await fetch('http://127.0.0.1:4000/status', { cache: 'no-store' });
    if (resPort.ok) {
      const liveData = await resPort.json();
      return NextResponse.json(liveData);
    }
  } catch (_) {}

  // 2. Read directly from Railway PostgreSQL DB
  try {
    const db = await import('@/lib/db');
    const client = await db.getDbClient();
    const res = await client.query(`SELECT status, connected, qr_image, pairing_code, message FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`);
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
  } catch (_) {}

  // 3. Fallback to local status file
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
  try {
    const db = await import('@/lib/db');
    const client = await db.getDbClient();
    await client.query(`UPDATE whatsapp_sessions SET status = 'DISCONNECTED', connected = false, qr_image = NULL, message = 'Unlinked by admin' WHERE id = 'default'`);
  } catch (_) {}

  try {
    const res = await fetch('http://127.0.0.1:4000/unlink', { method: 'POST' });
    if (res.ok) {
      return NextResponse.json({ success: true, message: 'Unlinked WhatsApp session.' });
    }
  } catch (e: any) {
    console.error('Error unlinking WhatsApp:', e.message);
  }

  // Fallback: Clear session dir directly if Baileys port is unreachable
  const sessionDir = path.join(process.cwd(), 'whatsapp_session');
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (_) {}
  }

  const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
  fs.writeFileSync(
    statusFile,
    JSON.stringify({ status: 'DISCONNECTED', connected: false, message: 'Session unlinked by admin.' }, null, 2)
  );

  return NextResponse.json({ success: true, message: 'Unlinked WhatsApp session.' });
}
