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

  // Fallback if status file is generating
  return NextResponse.json({
    status: 'INITIALIZING',
    connected: false,
    qrImage: null,
    message: 'Generating WhatsApp QR Code & Session...',
  });
}
