import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/serverSecurity';
import { generateAdminCopilotDraft } from '@/lib/supportCopilot';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/copilot
 * High-speed AI Copilot endpoint for Staff Support Dashboard.
 * Uses Groq (openai/gpt-oss-120b) + 360° customer/order context to draft accurate,
 * empathetic, non-generic replies addressing the exact customer question.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req).catch(() => null);
    const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customerMessage = String(body.customerMessage || '').trim();
    const context = body.context || {};

    const rawName = context.customerName || context.order?.customerName || 'Customer';
    const name = rawName === 'Store Guest' || rawName === 'Student/Parent' ? 'Customer' : rawName.split(' ')[0];

    // 1. Groq LLM Inference
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && customerMessage) {
      try {
        const orderInfo = context.order
          ? `Order #${context.order.orderId}: Status is ${context.order.status}, Delivery to ${context.order.city || 'Tamil Nadu'}, ST Courier Docket: ${context.order.awbNumber || 'Preparing for dispatch'}`
          : 'No specific placed order found';

        const prompt = `Customer Question: "${customerMessage}"
Customer Name: ${name}
Customer Order Context: ${orderInfo}

Verified Blessing Power Guide Facts:
1. Minimum Order Quantity (MOQ): 4 individual books OR 1 Combo Pack. (Any 1 Combo Pack automatically satisfies MOQ and qualifies for 100% Free Doorstep Delivery via ST Courier).
2. Shipping: 100% Free Doorstep Delivery on 5+ books or any Combo Box Set. A flat ₹150 courier charge applies only on orders of exactly 4 individual books.
3. Delivery Speed: ST Courier Express from Chennai hub. Transit time is 24–48 hours for Chennai/suburbs and 2–3 business days across other Tamil Nadu districts.
4. "Coming Soon" / Booking: Guides marked "Coming Soon" are undergoing our faculty board's 2026 Samacheer Kalvi syllabus verification or are in print at our press; pre-orders opening shortly.
5. Mediums: All Class 10 SSLC guides available in both Tamil Medium & English Medium.
6. Prices: Class 10 5-in-1 Combo Box Set (Tamil Medium & English Medium) is ₹1,300 (MRP ₹1,650) with 100% Free Doorstep Delivery. Individual guides are priced by subject.
7. Payments: 100% prepaid online via Razorpay (UPI, GPay, PhonePe, Cards, NetBanking). COD is not supported.
8. Free Replacement Guarantee: 100% Free Replacement copy dispatched via ST Courier for any misprinted, missing page, or transit-damaged copies.
9. Contact: Trust Square, Ayanavaram, Chennai. Helpline: +91 94860 17820.

Instruction:
Draft a concise, warm, professional response (2 to 3 sentences maximum) directly answering the customer's question. Address their exact topic (e.g. minimum quantity, price, delivery, booking, tracking). Do NOT start with a generic robotic greeting. Address them as "Hello ${name}, ...".`;

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey.trim()}`,
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
            messages: [
              {
                role: 'system',
                content: 'You are the Blessing Power Guide Customer Support Copilot assisting store administrators in drafting direct, factual, polite answers.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 1000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const draft = data.choices?.[0]?.message?.content?.trim();
          if (draft) {
            return NextResponse.json({ success: true, draft, provider: 'groq' });
          }
        }
      } catch (e) {
        console.warn('[Support Copilot] Groq call warning:', e);
      }
    }

    // 2. Deterministic Fallback
    const fallbackDraft = generateAdminCopilotDraft(customerMessage, context);
    return NextResponse.json({ success: true, draft: fallbackDraft, provider: 'deterministic' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate copilot reply' }, { status: 500 });
  }
}
