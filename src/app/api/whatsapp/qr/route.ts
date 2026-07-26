import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');

  try {
    if (phone) {
      const pRes = await fetch(`http://127.0.0.1:4000/pair?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (pRes.ok) {
        const pData = await pRes.json();
        return NextResponse.json(pData);
      }
    }

    const res = await fetch('http://127.0.0.1:4000/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err: any) {
    // Service initializing
  }

  return NextResponse.json({
    status: 'INITIALIZING',
    connected: false,
    qrImage: null,
    message: 'WhatsApp Service is initializing on port 4000...',
  });
}
