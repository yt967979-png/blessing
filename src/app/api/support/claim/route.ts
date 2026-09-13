import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest } from '@/lib/serverSecurity';
import { notifySupportEvent } from '@/lib/supportEvents';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/claim
 * Server-Enforced Atomic Compare-And-Swap (CAS) Claim.
 * Guarantees exactly one admin can claim a waiting customer conversation.
 */
export async function POST(req: NextRequest) {
  try {
    const check = await verifyAdminRequest(req);
    if (!check.isAdmin || !check.user) {
      return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || '').trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const adminUser = check.user;
    const adminId = String(adminUser.userId);
    const uRes = await queryDb(`SELECT name, email FROM users WHERE id = $1 LIMIT 1`, [adminId]);
    const adminName = uRes.rows[0]?.name || uRes.rows[0]?.email?.split('@')[0] || 'Support Staff';

    // ── ATOMIC COMPARE-AND-SWAP (CAS) QUERY
    // Only transitions status if it is currently 'WAITING_ADMIN' OR idle active (>10 mins without admin message)
    const casResult = await queryDb(
      `UPDATE support_conversations 
       SET status = 'ACTIVE',
           assigned_admin_id = $1,
           assigned_admin_name = $2,
           accepted_at = NOW(),
           last_admin_activity_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 
         AND (
           status = 'WAITING_ADMIN' 
           OR (status = 'ACTIVE' AND COALESCE(last_admin_activity_at, accepted_at) < NOW() - INTERVAL '10 minutes' AND assigned_admin_id != $1)
         )
       RETURNING *`,
      [adminId, adminName, conversationId]
    );

    // If 0 rows updated, someone else already claimed it!
    if (casResult.rowCount === 0) {
      const checkRes = await queryDb(
        `SELECT assigned_admin_name, status FROM support_conversations WHERE id = $1`,
        [conversationId]
      );
      const current = checkRes.rows[0];
      const winnerName = current?.assigned_admin_name || 'another admin';

      return NextResponse.json(
        {
          success: false,
          error: `This conversation has already been accepted by ${winnerName}.`,
          claimedBy: winnerName,
          status: current?.status || 'ACTIVE',
        },
        { status: 409 }
      );
    }

    const claimedConv = casResult.rows[0];

    // Clean up any other duplicate pending waiting requests for the same order
    if (claimedConv.order_id) {
      await queryDb(
        `UPDATE support_conversations 
         SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
         WHERE status = 'WAITING_ADMIN' AND order_id = $1 AND id != $2`,
        [claimedConv.order_id, conversationId]
      );
    }

    // Winner: Insert System join notice
    const sysMsgId = `msg_${Date.now()}_sys`;
    await queryDb(
      `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
       VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
      [sysMsgId, conversationId, `🟢 ${adminName} joined the chat`]
    );

    // Insert friendly initial admin greeting
    const welcomeMsgId = `msg_${Date.now() + 20}_adm`;
    const greetingText = `Hi! 👋 I'm ${adminName} from Blessing Power Guide Support. How can I help you?`;
    await queryDb(
      `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, sender_id, text)
       VALUES ($1, $2, 'ADMIN', $3, $4, $5)`,
      [welcomeMsgId, conversationId, adminName, adminId, greetingText]
    );

    // Real-time broadcast to Customer and other Admins
    await notifySupportEvent({
      type: 'CHAT_CLAIMED',
      conversationId,
      assignedAdminName: adminName,
      status: 'ACTIVE',
      text: greetingText,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      conversation: claimedConv,
      assignedAdminName: adminName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to claim conversation' }, { status: 500 });
  }
}
