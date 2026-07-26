import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
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
