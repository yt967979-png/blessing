import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const res = await fetch('http://127.0.0.1:4000/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err: any) {
    // If port 4000 is connecting
  }

  return NextResponse.json({
    status: 'INITIALIZING',
    connected: false,
    qrImage: null,
    message: 'WhatsApp Service is initializing on port 4000...',
  });
}
