import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import {
  getAuthenticatedUser,
  unauthorizedResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';

export async function GET(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return unauthorizedResponse('Please login to view notifications.');
  }

  const rl = await applyRateLimitAsync(`notif-get:${session.userId}:${clientIp(request)}`, 60, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  try {
    const res = await queryDb(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [session.userId]
    );

    const unreadCountRes = await queryDb(
      `SELECT COUNT(*)::int as unread FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [session.userId]
    );

    const notifications = res.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type || 'info',
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
    }));

    const unreadCount = Number(unreadCountRes.rows[0]?.unread || 0);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err: any) {
    console.error('Error fetching notifications:', err?.message);
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return unauthorizedResponse('Please login to update notifications.');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      await queryDb(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
        [session.userId]
      );
      return NextResponse.json({ success: true, markedAll: true });
    }

    if (notificationId) {
      await queryDb(
        `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
        [notificationId, session.userId]
      );
      return NextResponse.json({ success: true, notificationId });
    }

    return NextResponse.json({ error: 'notificationId or markAllRead required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}
