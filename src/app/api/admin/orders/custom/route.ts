import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { generateTrackingToken } from '@/lib/trackToken';
import { generateNextGstInvoiceNumber } from '@/lib/invoiceGenerator';
import { priceCartItems } from '@/lib/orderPricing';
import {
  MIN_BOOKS_PER_ORDER,
  deliveryFeeForQty,
  FREE_DELIVERY_AT_QTY,
} from '@/lib/deliveryRules';
import { publicSiteOrigin } from '@/lib/publicSiteUrl';

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
      paymentMethod = 'WhatsApp UPI',
      paymentStatus = 'Paid / Confirmed',
      orderStatus = 'Confirmed',
      adminNotes = '',
    } = body;

    const cleanName = String(customerName || '').trim();
    const cleanPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);
    const payMethod = String(paymentMethod || 'WhatsApp UPI');
    if (/\bcod\b|cash on delivery/i.test(payMethod)) {
      return NextResponse.json(
        { error: 'Cash on Delivery is not allowed. Record UPI, bank transfer, or pickup only.' },
        { status: 400 }
      );
    }

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
      return NextResponse.json({ error: 'Please select guidebooks for this order.' }, { status: 400 });
    }

    const priced = await priceCartItems(client, items);
    if (!priced.ok) {
      return NextResponse.json({ error: priced.error }, { status: priced.status });
    }
    const { total: calculatedSubtotal, verifiedItems } = priced;
    const bookQty = verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
    if (bookQty < MIN_BOOKS_PER_ORDER) {
      return NextResponse.json(
        {
          error: `Minimum ${MIN_BOOKS_PER_ORDER} books required (same as website checkout). Current: ${bookQty}.`,
        },
        { status: 400 }
      );
    }
    const shippingFee = deliveryFeeForQty(bookQty);
    const totalAmount = calculatedSubtotal + shippingFee;

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
      shippingFee,
      bookQty,
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
        totalAmount,
        payMethod,
        paymentStatus,
        orderStatus,
        internalShipmentId,
        shippingAddressObj,
        `custom-${orderNumber}`,
        invoiceNumber,
      ]
    );

    for (const item of verifiedItems) {
      const stockRes = await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) - $1,
             status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
             updated_at = NOW()
         WHERE id = $2 AND COALESCE(stock, 0) >= $1
         RETURNING id, title`,
        [item.qty, item.id]
      );
      if (!stockRes.rows?.length) {
        throw new Error(`"${item.title}" went out of stock while saving this order.`);
      }

      const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await client.query(
        `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [itemId, id, item.id, item.title, item.price, item.qty, item.subtotal]
      );
    }

    const eventId = `TL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, created_at)
       VALUES ($1, $2, 'Order Confirmed', 'Custom WhatsApp order registered and confirmed by Store Admin.', $3, NOW())`,
      [eventId, id, String(city || 'Tamil Nadu').trim()],
    );

    await client.query('COMMIT');

    const token = generateTrackingToken(orderNumber, cleanPhone);
    const appOrigin = publicSiteOrigin();
    const trackingUrl = `${appOrigin}/track?orderId=${encodeURIComponent(orderNumber)}&phone=${cleanPhone}&t=${token}`;
    const itemsSummary = verifiedItems.map((it: any) => `• ${it.title} (Qty: ${it.qty || 1})`).join('\n');
    const deliveryCity = String(city || '').trim();
    const deliveryLine = [
      String(address || '').trim(),
      landmark ? String(landmark).trim() : '',
      deliveryCity,
      pincode ? `PIN ${pincode}` : '',
      'Tamil Nadu',
    ]
      .filter(Boolean)
      .join(', ');
    const deliveryChargeLine =
      shippingFee === 0
        ? `Delivery: FREE (${FREE_DELIVERY_AT_QTY}+ books)`
        : `Delivery: ₹${shippingFee} (FREE from ${FREE_DELIVERY_AT_QTY} books)`;
    const whatsappMessage = [
      `Dear ${cleanName},`,
      '',
      'Thank you for your order with Blessing Power Guide.',
      '',
      `Order ID: ${orderNumber}`,
      `Books: ${bookQty} (minimum ${MIN_BOOKS_PER_ORDER})`,
      `Subtotal: ₹${calculatedSubtotal}`,
      deliveryChargeLine,
      `Amount payable: ₹${totalAmount}`,
      `Payment: ${payMethod}`,
      `Status: ${paymentStatus}`,
      '',
      'Items:',
      itemsSummary,
      '',
      'Delivery address:',
      deliveryLine,
      '',
      'Track your order:',
      trackingUrl,
      '',
      'Your order will be dispatched via ST Courier Express.',
      '',
      'Blessing Power Guide',
      'Tamil Nadu State Board guides (Classes 6–12)',
    ].join('\n');
    const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;

    try {
      const { notifyOrderChanged } = await import('@/app/api/orders/stream/route');
      void notifyOrderChanged(orderNumber);
    } catch (_) {}
    try {
      const { notifyStockChanged } = await import('@/app/api/stock/stream/route');
      void notifyStockChanged(verifiedItems.map((i: any) => i.id));
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      success: true,
      orderNumber,
      orderId: id,
      invoiceNumber,
      totalAmount,
      trackingUrl,
      whatsappUrl,
      whatsappMessage,
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('Failed to create custom order:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to create order' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
