import { NextResponse } from 'next/server';
import { tryGetDbClient, releaseDbClient } from '@/lib/db';
import { applyRateLimit } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const { allowed } = applyRateLimit(`contact-${ip}`, 5, 600000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many messages sent. Please wait a few minutes before trying again.' },
      { status: 429 }
    );
  }

  let client: any = null;
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 80);
    const email = String(body.email || '').trim().slice(0, 120);
    const phone = normalizeMobileDigits(String(body.phone || ''));
    const subject = String(body.subject || 'General Inquiry').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 2000);

    if (!name || !phone || !message) {
      return NextResponse.json({ error: 'Name, Phone, and Message are required fields.' }, { status: 400 });
    }
    if (!isValidMobileNumber(phone)) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }
    if (message.length < 8) {
      return NextResponse.json({ error: 'Please write a slightly longer message.' }, { status: 400 });
    }

    const contactId = `MSG-${Date.now()}`;

    client = await tryGetDbClient();
    if (client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
          id SERIAL PRIMARY KEY,
          contact_id VARCHAR(100) UNIQUE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50) NOT NULL,
          subject VARCHAR(255),
          message TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'unread',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(
        `INSERT INTO contact_submissions (contact_id, name, email, phone, subject, message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [contactId, name, email, phone, subject, message]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your message has been received. Our team will contact you shortly.',
      contactId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error processing contact message' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
