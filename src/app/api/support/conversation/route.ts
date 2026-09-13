import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';
import { generateSupportRagAnswer } from '@/lib/supportRag';
import { notifySupportEvent } from '@/lib/supportEvents';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getOrCreateSessionToken(req: NextRequest): { sessionToken: string; isNew: boolean } {
  const existing = req.cookies.get('bpg_support_session')?.value;
  if (existing && existing.length >= 16) {
    return { sessionToken: existing, isNew: false };
  }
  return { sessionToken: crypto.randomBytes(16).toString('hex'), isNew: true };
}

/**
 * GET /api/support/conversation
 * Fetches the active or most recent conversation and message history.
 */
export async function GET(req: NextRequest) {
  try {
    const { sessionToken, isNew } = getOrCreateSessionToken(req);
    const user = await getAuthenticatedUser(req).catch(() => null);
    const convIdParam = req.nextUrl.searchParams.get('id');

    let conv: any = null;
    let feedbackSubmitted = false;

    if (convIdParam) {
      const res = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [convIdParam]);
      const candidate = res.rows[0];
      if (candidate) {
        const fbRes = await queryDb(`SELECT id, rating FROM support_feedback WHERE conversation_id = $1 LIMIT 1`, [candidate.id]);
        feedbackSubmitted = fbRes.rows.length > 0;
        if (candidate.status !== 'RESOLVED' || !feedbackSubmitted) {
          conv = candidate;
        }
      }
    } else if (user?.userId) {
      const res = await queryDb(
        `SELECT c.*, 
           (SELECT COUNT(*) FROM support_feedback f WHERE f.conversation_id = c.id) as fb_count
         FROM support_conversations c
         WHERE (c.customer_id = $1 OR c.session_token = $2)
           AND (
             c.status != 'RESOLVED' 
             OR (c.status = 'RESOLVED' AND c.updated_at > NOW() - INTERVAL '2 hours')
           )
         ORDER BY c.updated_at DESC LIMIT 1`,
        [user.userId, sessionToken]
      );
      if (res.rows.length > 0) {
        const candidate = res.rows[0];
        const isRated = parseInt(candidate.fb_count || '0', 10) > 0;
        feedbackSubmitted = isRated;
        if (candidate.status !== 'RESOLVED' || !isRated) {
          conv = candidate;
        }
      }
    } else {
      const res = await queryDb(
        `SELECT c.*, 
           (SELECT COUNT(*) FROM support_feedback f WHERE f.conversation_id = c.id) as fb_count
         FROM support_conversations c
         WHERE c.session_token = $1
           AND (
             c.status != 'RESOLVED' 
             OR (c.status = 'RESOLVED' AND c.updated_at > NOW() - INTERVAL '2 hours')
           )
         ORDER BY c.updated_at DESC LIMIT 1`,
        [sessionToken]
      );
      if (res.rows.length > 0) {
        const candidate = res.rows[0];
        const isRated = parseInt(candidate.fb_count || '0', 10) > 0;
        feedbackSubmitted = isRated;
        if (candidate.status !== 'RESOLVED' || !isRated) {
          conv = candidate;
        }
      }
    }

    if (!conv) {
      return NextResponse.json({ conversation: null, messages: [], feedbackSubmitted: false });
    }

    const msgsRes = await queryDb(
      `SELECT id, conversation_id, sender_type, sender_name, sender_id, text, metadata, is_read, read_at, created_at 
       FROM support_messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conv.id]
    );

    const formattedMessages = msgsRes.rows.map((r: any) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      sender_type: r.sender_type,
      sender_name: r.sender_name,
      sender_id: r.sender_id,
      text: r.text,
      suggestions: Array.isArray(r.metadata?.suggestions) ? r.metadata.suggestions : [],
      linkedOrderData: r.metadata?.linkedOrderData || null,
      cardType: r.metadata?.cardType || null,
      cardData: r.metadata?.cardData || null,
      is_read: r.is_read,
      created_at: r.created_at,
    }));

    const res = NextResponse.json({
      conversation: conv,
      messages: formattedMessages,
      feedbackSubmitted,
    });
    if (isNew) {
      res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
    }
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch conversation' }, { status: 500 });
  }
}

/**
 * POST /api/support/conversation
 * Sends a customer message.
 * If conversation status is 'BOT', triggers automated RAG response.
 * If user requests human, escalates to 'WAITING_ADMIN'.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    const action = String(body.action || '').trim();
    const linkedOrderId = String(body.orderId || '').trim();

    const { sessionToken, isNew } = getOrCreateSessionToken(req);
    const user = await getAuthenticatedUser(req).catch(() => null);
    const customerId = user?.userId || String(body.customerId || '').trim() || null;

    let customerName = String(body.name || '').trim();
    let customerPhone = String(body.phone || '').trim();
    let customerEmail = '';

    if (customerId) {
      try {
        const uRes = await queryDb(`SELECT id, name, phone, email FROM users WHERE id = $1 LIMIT 1`, [customerId]);
        if (uRes.rows.length > 0) {
          const uRow = uRes.rows[0];
          if (!customerName || customerName === 'Student/Parent' || customerName === 'Customer' || customerName === 'You') {
            customerName = uRow.name || customerName;
          }
          if (!customerPhone) {
            customerPhone = uRow.phone || customerPhone;
          }
          customerEmail = uRow.email || '';
        }
      } catch (_) {}
    }

    if (!customerName) customerName = 'Student/Parent';

    let conversationId = body.conversationId;
    let conv: any = null;

    // ── Handle Resolving for In-Chat CSAT Feedback Prompt
    if (action === 'resolve_for_feedback') {
      if (conversationId) {
        const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
        conv = cRes.rows[0];
      }
      if (conv) {
        await queryDb(
          `UPDATE support_conversations 
           SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
          [conv.id]
        );
        await notifySupportEvent({
          type: 'CHAT_RESOLVED',
          conversationId: conv.id,
          status: 'RESOLVED',
          timestamp: new Date().toISOString(),
        });
        return NextResponse.json({
          success: true,
          status: 'RESOLVED',
          conversation: { ...conv, status: 'RESOLVED' },
        });
      }
      return NextResponse.json({ success: true, status: 'RESOLVED' });
    }

    // ── Handle Starting a Clean, Brand-New Help Session (Distinct Unique Conversation ID for Every User)
    if (action === 'start_fresh' || action === 'new_session') {
      if (conversationId) {
        await queryDb(
          `UPDATE support_conversations SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [conversationId]
        );
      }
      if (customerId || sessionToken || customerPhone) {
        await queryDb(
          `UPDATE support_conversations 
           SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
           WHERE (
             (customer_id IS NOT NULL AND customer_id = $1)
             OR session_token = $2
             OR ($3 <> '' AND customer_phone IS NOT NULL AND customer_phone = $3)
           )
           AND status != 'RESOLVED'`,
          [customerId || 'NONE', sessionToken, customerPhone || '']
        );
      }

      const newConvId = `conv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const freshSession = crypto.randomBytes(16).toString('hex');

      const insRes = await queryDb(
        `INSERT INTO support_conversations 
           (id, customer_id, session_token, customer_name, customer_phone, order_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'BOT')
         RETURNING *`,
        [newConvId, customerId, freshSession, customerName, customerPhone || null, linkedOrderId || null]
      );
      const newConv = insRes.rows[0];

      const welcomeMsgId = `msg_${Date.now()}_welcome`;
      const greetingName = customerName && customerName !== 'Student/Parent' && customerName !== 'Customer' ? customerName.split(' ')[0] : '';
      const welcomeText = greetingName 
        ? `Hello **${greetingName}**! Welcome to your new Blessing Support session.\n\nHow can I help you today? You can check live ST Courier tracking, ask about 10th standard guides, delivery rules, or speak with an admin.`
        : `Welcome to your new Blessing Support session!\n\nHow can I help you today? You can check live ST Courier tracking, ask about 10th standard guides, delivery rules, or speak with an admin.`;

      const initialSuggestions = ['🚚 Where is my order right now?', '📚 10th Class Guides & Prices', '📦 Minimum Order & Delivery Fee', '👨‍💼 Talk to Admin'];

      await queryDb(
        `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text, metadata)
         VALUES ($1, $2, 'AI', 'Blessing AI Assistant', $3, $4)`,
        [
          welcomeMsgId,
          newConvId,
          welcomeText,
          JSON.stringify({ suggestions: initialSuggestions })
        ]
      );

      const res = NextResponse.json({
        success: true,
        isNewSession: true,
        conversation: newConv,
        messages: [
          {
            id: welcomeMsgId,
            conversation_id: newConvId,
            sender_type: 'AI',
            sender_name: 'Blessing AI Assistant',
            text: welcomeText,
            suggestions: initialSuggestions,
            created_at: new Date().toISOString(),
          }
        ],
        feedbackSubmitted: false,
      });

      res.cookies.set('bpg_support_session', freshSession, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    // ── Handle Customer Ending, Leaving, or Closing Chat to Start Fresh
    if (
      action === 'close_chat' ||
      action === 'close' ||
      action === 'end_chat' ||
      action === 'leave_chat' ||
      action === 'cancel_waiting'
    ) {
      if (conversationId) {
        const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
        conv = cRes.rows[0];
      }
      if (!conv && (customerId || sessionToken || customerPhone)) {
        const cRes = await queryDb(
          `SELECT * FROM support_conversations 
           WHERE (
             (customer_id IS NOT NULL AND customer_id = $1)
             OR session_token = $2
             OR ($3 <> '' AND customer_phone IS NOT NULL AND customer_phone = $3)
           )
           AND status != 'RESOLVED' 
           ORDER BY updated_at DESC LIMIT 1`,
          [customerId || 'NONE', sessionToken, customerPhone || '']
        );
        conv = cRes.rows[0];
      }

      if (conv) {
        const wasWaiting = conv.status === 'WAITING_ADMIN';
        const wasActive = conv.status === 'ACTIVE';

        await queryDb(
          `UPDATE support_conversations 
           SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
          [conv.id]
        );

        if (wasActive) {
          await queryDb(
            `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
             VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
            [`msg_${Date.now()}_sys`, conv.id, 'Customer left the chat session.']
          );
        }

        await notifySupportEvent({
          type: 'CONVERSATION_UPDATED',
          conversationId: conv.id,
          status: 'RESOLVED',
          data: {
            conversation: {
              ...conv,
              status: 'RESOLVED',
            },
            wasWaiting,
            wasActive,
          },
          timestamp: new Date().toISOString(),
        });

        await notifySupportEvent({
          type: 'CHAT_RESOLVED',
          conversationId: conv.id,
          status: 'RESOLVED',
          timestamp: new Date().toISOString(),
        });
      }

      const freshSession = crypto.randomBytes(16).toString('hex');
      const res = NextResponse.json({
        success: true,
        closed: true,
        left: true,
        conversation: null,
        messages: [],
      });
      res.cookies.set('bpg_support_session', freshSession, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }

    // ── Locate or Create Conversation
    if (conversationId) {
      const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      conv = cRes.rows[0];
    }

    // Check if customer ALREADY has an active or waiting conversation to NEVER duplicate tickets
    if (!conv) {
      const activeCheck = await queryDb(
        `SELECT * FROM support_conversations 
         WHERE (
           (customer_id IS NOT NULL AND customer_id = $1)
           OR (session_token = $2)
           OR ($3 <> '' AND customer_phone IS NOT NULL AND customer_phone = $3)
         )
         AND status IN ('WAITING_ADMIN', 'ACTIVE', 'BOT')
         ORDER BY updated_at DESC LIMIT 1`,
        [customerId || 'NONE', sessionToken, customerPhone || '']
      );
      if (activeCheck.rows.length > 0) {
        conv = activeCheck.rows[0];
        conversationId = conv.id;
      }
    }

    if (!conv) {
      conversationId = `conv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const insRes = await queryDb(
        `INSERT INTO support_conversations 
           (id, customer_id, session_token, customer_name, customer_phone, order_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'BOT')
         RETURNING *`,
        [conversationId, customerId, sessionToken, customerName, customerPhone || null, linkedOrderId || null]
      );
      conv = insRes.rows[0];
    } else if (customerId && !conv.customer_id) {
      await queryDb(
        `UPDATE support_conversations SET customer_id = $1, customer_name = $2, customer_phone = COALESCE(customer_phone, $3) WHERE id = $4`,
        [customerId, customerName, customerPhone || null, conv.id]
      );
    }

    // ── Direct Human Escalation Action
    if (action === 'escalate_human' || body.escalate === true) {
      // If already waiting for admin, return early with "Already requested" system message
      if (conv.status === 'WAITING_ADMIN') {
        const res = NextResponse.json({
          success: true,
          alreadyRequested: true,
          conversationId: conv.id,
          conversation: conv,
          systemMessage: {
            id: `msg_${Date.now()}_already`,
            conversation_id: conv.id,
            sender_type: 'SYSTEM' as const,
            sender_name: 'System',
            text: 'ℹ️ You have already requested support. Available admins have been alerted and will accept your chat shortly.',
            created_at: new Date().toISOString(),
          },
          status: 'WAITING_ADMIN',
        });
        if (isNew) {
          res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
        }
        return res;
      }

      if (conv.status === 'ACTIVE') {
        const res = NextResponse.json({
          success: true,
          alreadyConnected: true,
          conversationId: conv.id,
          conversation: conv,
          status: 'ACTIVE',
        });
        if (isNew) {
          res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
        }
        return res;
      }

      await queryDb(
        `UPDATE support_conversations 
         SET status = 'WAITING_ADMIN', updated_at = NOW(), last_message_at = NOW() 
         WHERE id = $1`,
        [conv.id]
      );

      const sysMsgId = `msg_${Date.now()}_sys`;
      await queryDb(
        `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
         VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
        [sysMsgId, conv.id, '⏳ Connecting you to our support team... Please wait while an agent joins.']
      );

      // Alert all online admins
      await notifySupportEvent({
        type: 'SUPPORT_REQUESTED',
        conversationId: conv.id,
        senderType: 'SYSTEM',
        senderName: customerName,
        text: 'Customer requested human assistance',
        status: 'WAITING_ADMIN',
        timestamp: new Date().toISOString(),
      });

      const sysMsg = {
        id: sysMsgId,
        conversation_id: conv.id,
        sender_type: 'SYSTEM' as const,
        sender_name: 'System',
        text: '⏳ Connecting you to our support team... Please wait while an agent joins.',
        created_at: new Date().toISOString(),
      };

      const res = NextResponse.json({
        success: true,
        conversationId: conv.id,
        conversation: {
          id: conv.id,
          status: 'WAITING_ADMIN',
          customer_name: customerName,
          customer_phone: customerPhone,
        },
        systemMessage: sysMsg,
        status: 'WAITING_ADMIN',
      });
      if (isNew) {
        res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
      }
      return res;
    }

    if (!text) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    // Insert Customer Message
    const custMsgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await queryDb(
      `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, sender_id, text)
       VALUES ($1, $2, 'CUSTOMER', $3, $4, $5)`,
      [custMsgId, conv.id, customerName, user?.userId || null, text]
    );

    await queryDb(`UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [conv.id]);

    await notifySupportEvent({
      type: 'NEW_MESSAGE',
      conversationId: conv.id,
      senderType: 'CUSTOMER',
      senderName: customerName,
      text,
      status: conv.status,
      timestamp: new Date().toISOString(),
    });

    // If conversation is in ACTIVE state (human assigned) or WAITING_ADMIN, do NOT run bot; notify assigned admin
    if (conv.status === 'ACTIVE' || conv.status === 'WAITING_ADMIN') {
      const res = NextResponse.json({
        success: true,
        conversationId: conv.id,
        conversation: conv,
        messageId: custMsgId,
        status: conv.status,
      });
      if (isNew) {
        res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
      }
      return res;
    }

    // ── BOT MODE: Execute RAG Engine
    const ragResult = await generateSupportRagAnswer(text, {
      phone: customerPhone || conv.customer_phone || undefined,
      customerId: customerId || undefined,
      userName: customerName || conv.customer_name || undefined,
      email: customerEmail || undefined,
      sessionOrder: linkedOrderId || conv.order_id || undefined,
    });

    if (ragResult.linkedOrderId && !conv.order_id) {
      await queryDb(`UPDATE support_conversations SET order_id = $1 WHERE id = $2`, [ragResult.linkedOrderId, conv.id]);
    }

    const aiMsgId = `msg_${Date.now() + 50}_ai`;
    const aiMetadata = {
      suggestions: ragResult.suggestions,
      linkedOrderData: ragResult.linkedOrderData,
      cardType: ragResult.cardType,
      cardData: ragResult.cardData,
    };
    await queryDb(
      `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text, metadata)
       VALUES ($1, $2, 'AI', 'Blessing AI Assistant', $3, $4)`,
      [aiMsgId, conv.id, ragResult.answer, JSON.stringify(aiMetadata)]
    );

    await notifySupportEvent({
      type: 'NEW_MESSAGE',
      conversationId: conv.id,
      senderType: 'AI',
      senderName: 'Blessing AI Assistant',
      text: ragResult.answer,
      message: {
        id: aiMsgId,
        conversation_id: conv.id,
        sender_type: 'AI',
        sender_name: 'Blessing AI Assistant',
        text: ragResult.answer,
        suggestions: ragResult.suggestions,
        linkedOrderData: ragResult.linkedOrderData,
        cardType: ragResult.cardType,
        cardData: ragResult.cardData,
        created_at: new Date().toISOString(),
      },
      status: conv.status,
      data: aiMetadata,
      timestamp: new Date().toISOString(),
    });

    // If RAG detected need for human escalation
    if (ragResult.shouldEscalate) {
      await queryDb(`UPDATE support_conversations SET status = 'WAITING_ADMIN' WHERE id = $1`, [conv.id]);
      await notifySupportEvent({
        type: 'SUPPORT_REQUESTED',
        conversationId: conv.id,
        senderType: 'SYSTEM',
        senderName: customerName,
        text: text,
        status: 'WAITING_ADMIN',
        timestamp: new Date().toISOString(),
      });
    }

    const finalStatus = ragResult.shouldEscalate ? 'WAITING_ADMIN' : conv.status || 'BOT';
    const res = NextResponse.json({
      success: true,
      conversationId: conv.id,
      conversation: {
        id: conv.id,
        status: finalStatus,
        customer_name: customerName,
        customer_phone: customerPhone,
        order_id: ragResult.linkedOrderId || conv.order_id || null,
      },
      reply: ragResult.answer,
      suggestions: ragResult.suggestions || [],
      aiMessage: {
        id: aiMsgId,
        conversation_id: conv.id,
        sender_type: 'AI' as const,
        sender_name: 'Blessing AI Assistant',
        text: ragResult.answer,
        suggestions: ragResult.suggestions || [],
        linkedOrderData: ragResult.linkedOrderData || null,
        cardType: ragResult.cardType || null,
        cardData: ragResult.cardData || null,
        created_at: new Date().toISOString(),
      },
      status: finalStatus,
    });

    if (isNew) {
      res.cookies.set('bpg_support_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
    }
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Support processing error' }, { status: 500 });
  }
}
