import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { applyRateLimit } from '@/lib/serverSecurity';
import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

export async function POST(request: Request) {
  // Rate limiting: max 5 messages per 10 minutes per IP
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const { allowed } = applyRateLimit(`contact-${ip}`, 5, 600000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many messages sent. Please wait a few minutes before trying again.' }, { status: 429 });
  }

  const client = await getDbClient();
  try {
    const { name, email, phone, subject, message } = await request.json();

    if (!name || !phone || !message) {
      if (client) await client.end();
      return NextResponse.json({ error: 'Name, Phone, and Message are required fields.' }, { status: 400 });
    }

    let contactId = `MSG-${Date.now()}`;

    if (client) {
      // Ensure contacts table exists in Railway PostgreSQL
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
        [contactId, name, email || '', phone, subject || 'General Inquiry', message]
      );
      await client.end();
    }

    // Auto-notify Admin via WhatsApp
    try {
      const whatsappMsg = `📩 *NEW WEBSITE CONTACT FORM INQUIRY*\n\n👤 *Name:* ${name}\n📞 *Phone:* ${phone}\n✉️ *Email:* ${email || 'N/A'}\n📌 *Subject:* ${subject || 'General Inquiry'}\n\n💬 *Message:* ${message}`;
      await sendWhatsAppMessageInProcess('919840418228', whatsappMsg);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your message has been received. Our team will contact you shortly.',
      contactId,
    });
  } catch (err: any) {
    if (client) await client.end();
    return NextResponse.json({ error: err.message || 'Server error processing contact message' }, { status: 500 });
  }
}
