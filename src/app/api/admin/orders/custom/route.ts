import { NextResponse } from 'next/server';
import { queryDb, getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { generateTrackingToken } from '@/lib/trackToken';
import { generateNextGstInvoiceNumber } from '@/lib/invoiceGenerator';

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to create custom orders');
  }

  const client = await getDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      customerName,
      customerPhone,
      customerAltPhone,
      address,
      landmark,
      city,
      state = 'Tamil Nadu',
      pincode,
      items = [],
      totalAmount,
      paymentMethod = 'WhatsApp UPI',
      paymentStatus = 'Paid / Confirmed',
      orderStatus = 'Confirmed',
      adminNotes = '',
    } = body;

    const cleanName = String(customerName || '').trim();
    const cleanPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);

    if (!cleanName) {
      return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 });
    }
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit primary mobile number is required.' }, { status: 400 });
    }
    if (!address || !pincode) {
      return NextResponse.json({ error: 'Delivery address and pincode are required.' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Please select at least 1 guidebook for this order.' }, { status: 400 });
    }

    const calculatedSubtotal = items.reduce(
      (sum: number, it: any) => sum + Number(it.price || 0) * Number(it.qty || 1),
      0
    );
    const finalTotal = Number(totalAmount) > 0 ? Number(totalAmount) : calculatedSubtotal;

    // Generate Order ID: BPG-WA-XXXXXX
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `BPG-WA-${randomSuffix}`;
    const id = `ord-${Date.now()}-${randomSuffix}`;
    const internalShipmentId = `SHP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomSuffix}`;

    const shippingAddressObj = JSON.stringify({
      name: cleanName,
      phone: cleanPhone,
      alternatePhone: String(customerAltPhone || '').replace(/\D/g, '').slice(-10) || null,
      address: String(address).trim(),
      landmark: String(landmark || '').trim() || null,
      near_landmark: String(landmark || '').trim() || null,
      city: String(city || 'Chennai').trim(),
      state: String(state || 'Tamil Nadu').trim(),
      pincode: String(pincode).trim(),
      source: 'whatsapp_custom_order',
      adminNotes: String(adminNotes || '').trim() || null,
    });

    await client.query('BEGIN');

    const invoiceNumber = await generateNextGstInvoiceNumber(client);

    await client.query(
      `INSERT INTO orders (
        id, order_number, user_id, subtotal, discount, total_amount, payment_method,
        payment_status, order_status, courier_name, shipment_id, awb_number,
        shipping_address, idempotency_key, invoice_number, created_at, ordered_at
      ) VALUES (
        $1, $2, $3, $4, 0, $5, $6,
        $7, $8, 'ST Courier Express', $9, NULL,
        $10, $11, $12, NOW(), NOW()
      )`,
      [
        id,
        orderNumber,
        `wa_${cleanPhone}`,
        calculatedSubtotal,
        finalTotal,
        paymentMethod,
        paymentStatus,
        orderStatus,
        internalShipmentId,
        shippingAddressObj,
        `custom-${orderNumber}`,
        invoiceNumber,
      ]
    );

    // Insert order items
    for (const item of items) {
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await client.query(
        `INSERT INTO order_items (id, order_id, book_id, quantity, price, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          itemId,
          id,
          String(item.id || item.bookId || 'custom-book'),
          Math.max(1, Number(item.qty || 1)),
          Number(item.price || 0),
        ]
      );
    }

    // Insert initial timeline event
    const eventId = `TL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, created_at)
       VALUES ($1, $2, 'Order Confirmed', 'Custom WhatsApp order registered and confirmed by Store Admin.', $3, NOW())`,
      [eventId, id, String(city || 'Arani')]
    );

    await client.query('COMMIT');

    // Generate cryptographic tracking token
    const token = generateTrackingToken(orderNumber, cleanPhone);

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://blessingpowerguide.com';
    const trackingUrl = `${appOrigin}/track?orderId=${encodeURIComponent(orderNumber)}&phone=${cleanPhone}&t=${token}`;

    const itemsSummary = items
      .map((it: any) => `• ${it.title} (x${it.qty || 1})`)
      .join('\n');

    const whatsappMessage = `வணக்கம் ${cleanName}! 📚\n\nThank you for ordering with *Blessing Power Guide*!\n\n*Order ID:* #${orderNumber}\n*Amount:* ₹${finalTotal} (${paymentMethod})\n*Status:* ${paymentStatus}\n\n*Ordered Books:*\n${itemsSummary}\n\n*Delivery Address:*\n${address}, ${landmark ? `Near ${landmark}, ` : ''}${city} - ${pincode}\n\n🚚 *Track your parcel live here:*\n${trackingUrl}\n\nWe will dispatch your order shortly via ST Courier Express! ✨`;

    const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;

    try {
      const { notifyOrderChanged } = await import('@/app/api/orders/stream/route');
      void notifyOrderChanged(orderNumber);
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      success: true,
      orderNumber,
      orderId: id,
      invoiceNumber,
      totalAmount: finalTotal,
      trackingUrl,
      whatsappUrl,
      whatsappMessage,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Failed to create custom order:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to create order' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
