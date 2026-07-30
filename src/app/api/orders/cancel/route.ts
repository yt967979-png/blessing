import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import {
  getAuthenticatedUser,
  verifyAdminRequest,
  unauthorizedResponse,
  forbiddenResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import { paymentStatusAfterCancel } from '@/lib/orderStatus';

const BLOCKED_AFTER = ['handed to st courier', 'in transit', 'out for delivery', 'delivered', 'cancelled'];

/**
 * Cancel order — admin anytime (before delivered), customer only before packed/shipped.
 * Restores stock, rolls back coupon usage, updates payment_status, notifies via WhatsApp.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Sign in to cancel an order.');

  const rl = await applyRateLimitAsync(`cancel:${session.userId}:${clientIp(request)}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many cancel attempts. Wait a minute.' }, { status: 429 });
  }

  const admin = await verifyAdminRequest(request);
  const isAdmin = admin.isAdmin;

  let client: any = null;
  try {
    const body = await request.json();
    const orderId = String(body.orderId || '').trim();
    const reason = String(body.reason || 'Cancelled by request').slice(0, 200);
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    client = await getDbClient();
    await client.query('BEGIN');

    const ord = await client.query(
      `SELECT id, order_number, user_id, order_status, payment_method, payment_status,
              shipping_address, coupon_id
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (!ord.rows.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const row = ord.rows[0];
    if (!isAdmin && row.user_id !== session.userId) {
      await client.query('ROLLBACK');
      return forbiddenResponse('You can only cancel your own orders.');
    }

    const status = String(row.order_status || '').toLowerCase();
    if (status.includes('cancel')) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: true,
        duplicate: true,
        orderId: row.order_number,
        message: 'Order already cancelled.',
      });
    }

    if (!isAdmin) {
      if (BLOCKED_AFTER.some((s) => status.includes(s)) || status.includes('packed')) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error:
              'Order already packed or shipped. Contact support on WhatsApp to cancel.',
          },
          { status: 409 }
        );
      }
    } else if (status.includes('delivered')) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Delivered orders cannot be cancelled.' }, { status: 409 });
    }

    const items = await client.query(
      `SELECT book_id, quantity FROM order_items WHERE order_id = $1`,
      [row.id]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) + $1,
             status = CASE WHEN COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [Number(item.quantity) || 0, item.book_id]
      );
    }

    const payStatus = paymentStatusAfterCancel(row.payment_method);
    await client.query(
      `UPDATE orders
       SET order_status = 'Cancelled',
           payment_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, payStatus]
    );
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, 'Cancelled', $3)`,
      [`tl-cancel-${Date.now()}`, row.id, reason]
    );

    // Restore coupon usage so customer can reuse after cancel
    if (row.coupon_id) {
      try {
        await client.query(
          `UPDATE coupons
           SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
           WHERE id = $1`,
          [row.coupon_id]
        );
        await client.query(
          `DELETE FROM coupon_redemptions WHERE order_id = $1 OR order_id = $2`,
          [row.id, row.order_number]
        );
      } catch (e: any) {
        console.warn('[cancel] coupon rollback skipped:', e?.message);
      }
    }

    await client.query('COMMIT');

    let phone = '';
    let name = 'Student';
    try {
      const addr =
        typeof row.shipping_address === 'string'
          ? JSON.parse(row.shipping_address)
          : row.shipping_address;
      phone = addr?.phone || '';
      name = addr?.name || 'Student';
    } catch {
      /* ignore */
    }

    if (phone) {
      try {
        const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';
        await sendWhatsAppMessageInProcess(
          phone,
          `*BLESSING POWER GUIDE*\n*❌ ORDER CANCELLED*\n\nDear *${name}*,\nYour order *${row.order_number}* has been cancelled.\n\n📝 ${reason}\n\nStock is restored. You can place a new order anytime:\n${siteUrl}`
        );
      } catch (e: any) {
        console.warn('[cancel] WA failed:', e?.message);
      }
    }

    const event = {
      type: 'ORDER_UPDATED',
      orderId: row.order_number,
      status: 'Cancelled',
      timestamp: Date.now(),
    };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch {
      /* ignore */
    }

    return NextResponse.json({ success: true, orderId: row.order_number, status: 'Cancelled' });
  } catch (err: any) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: err.message || 'Cancel failed' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
