import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, customerName, customerPhone, totalAmount, items, trackingNumber } = body;

    const formattedPhone = customerPhone?.replace(/\D/g, '') || '9840418228';
    const trackingNo = trackingNumber || 'STC-TN-984210';
    const bookTitle = items?.[0]?.title || 'Blessing Power Guide Book';

    const whatsappMessage = `📚 *BLESSING POWER GUIDE - ORDER CONFIRMED* 📚\n\nDear *${customerName || 'Student'}*,\nThank you for your order! Your study guides are being packed for express dispatch.\n\n📦 *Order ID:* ${orderId || 'BPG-1082'}\n📖 *Item:* ${bookTitle}\n💰 *Total Paid:* ₹${totalAmount || 360}\n🚚 *Courier:* ST Courier Express\n📍 *Docket No:* ${trackingNo}\n\n🔗 *Track Live Order:* https://blessing-production.up.railway.app/orders\n\nFor support, reply to this message or call +91 98404 18228.`;

    const encodedMessage = encodeURIComponent(whatsappMessage);
    const waLink = `https://wa.me/91${formattedPhone}?text=${encodedMessage}`;

    return NextResponse.json({
      success: true,
      whatsappLink: waLink,
      message: 'WhatsApp automated notification payload generated successfully.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
