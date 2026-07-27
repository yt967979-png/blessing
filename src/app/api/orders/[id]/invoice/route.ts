import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { generateTaxInvoiceHtml } from '@/lib/invoiceGenerator';
import { getAuthenticatedUser, verifyAdminRequest } from '@/lib/serverSecurity';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const orderIdOrNum = resolvedParams.id;

  const session = await getAuthenticatedUser(request);
  const admin = session ? await verifyAdminRequest(request) : null;

  let client: any = null;
  try {
    client = await getDbClient();
    const query = `
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.book_id,
                   'title', oi.book_title,
                   'price', oi.book_price,
                   'qty', oi.quantity,
                   'subtotal', oi.subtotal
                 )
               ) FILTER (WHERE oi.id IS NOT NULL), '[]'
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1 OR o.order_number = $1
      GROUP BY o.id
      LIMIT 1
    `;

    const res = await client.query(query, [orderIdOrNum]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Order invoice not found' }, { status: 404 });
    }

    const o = res.rows[0];
    if (!admin && (!session || o.user_id !== session.userId)) {
      return NextResponse.json({ error: 'Login required to download this invoice.' }, { status: 401 });
    }

    let addrObj: any = {};
    if (o.shipping_address) {
      if (typeof o.shipping_address === 'object') {
        addrObj = o.shipping_address;
      } else if (typeof o.shipping_address === 'string') {
        try {
          addrObj = JSON.parse(o.shipping_address);
        } catch {
          addrObj = { address: o.shipping_address };
        }
      }
    }

    const itemsList =
      Array.isArray(o.items) && o.items.length > 0
        ? o.items
        : [{ title: 'Guide Book', qty: 1, price: Number(o.total_amount || 0) }];

    const invoiceHtml = generateTaxInvoiceHtml({
      orderId: o.order_number || o.id,
      customerName: addrObj.name || o.user_id || 'Customer',
      customerPhone: addrObj.phone || '—',
      address: addrObj.address || '—',
      city: addrObj.city || 'Chennai',
      pincode: addrObj.pincode || '',
      totalAmount: Number(o.total_amount || 0),
      paymentMethod: o.payment_method || 'Razorpay UPI',
      paymentStatus: o.payment_status || 'PAID',
      courierName: o.courier_name || 'ST Courier Express',
      trackingNumber: o.awb_number || 'Pending AWB Assignment',
      items: itemsList,
      createdAt: new Date(o.ordered_at || Date.now()).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });

    const fileName = `invoice-${o.order_number || o.id}.html`;
    return new NextResponse(invoiceHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Invoice Route Error:', err.message);
    return NextResponse.json({ error: 'Could not generate invoice.' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
