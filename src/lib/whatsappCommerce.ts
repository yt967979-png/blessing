/**
 * WhatsApp Conversational E-Commerce State Machine
 *
 * Implements:
 * 1. Catalog Search & Real-Time Stock Status (Out of stock, Coming soon)
 * 2. Medium selection (Tamil / English)
 * 3. Cart State, MOQ Rules (4 books MOQ or 1 Combo) & Free Courier calculation
 * 4. Structured Address Collection & Validation
 * 5. Razorpay 1-Tap UPI Payment Link generation
 * 6. Live ST Courier Tracking Lookup in same chat
 */

import { queryDb, getDbClient, releaseDbClient } from '@/lib/db';
import {
  sendWhatsAppText,
  sendWhatsAppButtons,
  sendWhatsAppList,
  WhatsAppButton,
  WhatsAppListSection,
} from '@/lib/whatsapp';
import { generateTrackingToken } from '@/lib/trackToken';

export interface WhatsAppSession {
  phone: string;
  name: string | null;
  email?: string | null;
  step: 'IDLE' | 'SEARCH' | 'AWAITING_NAME' | 'AWAITING_EMAIL' | 'AWAITING_ADDRESS' | 'CHECKOUT_GENERATED';
  cart: Array<{
    id: string;
    title: string;
    price: number;
    qty: number;
    medium?: string;
    isCombo?: boolean;
  }>;
  shipping_address: any;
  razorpay_order_id?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_link_url?: string;
}

export async function getOrCreateWhatsAppSession(phone: string, senderName?: string): Promise<WhatsAppSession> {
  const selectRes = await queryDb(
    `SELECT phone, name, email, step, cart, shipping_address, razorpay_order_id, razorpay_payment_link_id, razorpay_payment_link_url
     FROM whatsapp_sessions WHERE phone = $1 LIMIT 1`,
    [phone]
  );

  if (selectRes.rows.length > 0) {
    const row = selectRes.rows[0];
    return {
      phone: row.phone,
      name: row.name || senderName || null,
      email: row.email || null,
      step: row.step || 'IDLE',
      cart: Array.isArray(row.cart) ? row.cart : [],
      shipping_address: row.shipping_address || null,
      razorpay_order_id: row.razorpay_order_id || undefined,
      razorpay_payment_link_id: row.razorpay_payment_link_id || undefined,
      razorpay_payment_link_url: row.razorpay_payment_link_url || undefined,
    };
  }

  const initialCart: any[] = [];
  await queryDb(
    `INSERT INTO whatsapp_sessions (phone, name, email, step, cart, last_interaction, created_at, updated_at)
     VALUES ($1, $2, NULL, 'IDLE', $3, NOW(), NOW(), NOW())
     ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()`,
    [phone, senderName || null, JSON.stringify(initialCart)]
  );

  return {
    phone,
    name: senderName || null,
    email: null,
    step: 'IDLE',
    cart: [],
    shipping_address: null,
  };
}

export async function saveWhatsAppSession(session: WhatsAppSession) {
  await queryDb(
    `UPDATE whatsapp_sessions
     SET step = $1,
         cart = $2,
         shipping_address = $3,
         razorpay_order_id = $4,
         razorpay_payment_link_id = $5,
         razorpay_payment_link_url = $6,
         name = $7,
         email = $8,
         last_interaction = NOW(),
         updated_at = NOW()
     WHERE phone = $9`,
    [
      session.step,
      JSON.stringify(session.cart || []),
      session.shipping_address ? JSON.stringify(session.shipping_address) : null,
      session.razorpay_order_id || null,
      session.razorpay_payment_link_id || null,
      session.razorpay_payment_link_url || null,
      session.name || null,
      session.email || null,
      session.phone,
    ]
  );
}

/** Calculate cart totals, MOQ compliance, and shipping fee */
export function calculateWhatsAppCartTotals(cart: WhatsAppSession['cart']) {
  let subtotal = 0;
  let totalBookCount = 0;
  let hasCombo = false;

  for (const item of cart) {
    const qty = item.qty || 1;
    subtotal += item.price * qty;
    if (item.isCombo) {
      hasCombo = true;
      totalBookCount += 5 * qty;
    } else {
      totalBookCount += qty;
    }
  }

  // Business Rules:
  // 1. Any Combo pack qualifies for FREE delivery automatically.
  // 2. 5 or more individual books qualify for FREE delivery.
  // 3. 4 books MOQ has a flat ₹150 courier fee across Tamil Nadu.
  // 4. Less than 4 books cannot checkout (MOQ = 4 books or 1 Combo).
  const isMoqMet = hasCombo || totalBookCount >= 4;
  const isFreeDelivery = hasCombo || totalBookCount >= 5;
  const shippingFee = isMoqMet && !isFreeDelivery ? 150 : 0;
  const totalAmount = subtotal + shippingFee;

  return {
    subtotal,
    totalBookCount,
    hasCombo,
    isMoqMet,
    isFreeDelivery,
    shippingFee,
    totalAmount,
  };
}

/** Format cart display for WhatsApp text */
export function renderCartText(cart: WhatsAppSession['cart']) {
  if (cart.length === 0) {
    return '🛒 *Your Cart is Empty!* Type a subject (e.g. "Maths" or "10th") to add guides.';
  }

  const { subtotal, totalBookCount, hasCombo, isMoqMet, isFreeDelivery, shippingFee, totalAmount } =
    calculateWhatsAppCartTotals(cart);

  const lines = ['🛒 *YOUR SHOPPING CART*:'];
  cart.forEach((it, idx) => {
    const med = it.medium ? ` (${it.medium})` : '';
    lines.push(`${idx + 1}. *${it.title}${med}* × ${it.qty} = ₹${it.price * it.qty}`);
  });

  lines.push('');
  lines.push(`📚 Total Books: *${totalBookCount}*`);
  lines.push(`💰 Guides Subtotal: *₹${subtotal}*`);

  if (isFreeDelivery) {
    lines.push(`🚚 Delivery: *100% FREE DOORSTEP DELIVERY* 🎉`);
  } else if (isMoqMet) {
    lines.push(`🚚 ST Courier Delivery: *₹${shippingFee}* (Add 1 more book for FREE delivery!)`);
  } else {
    lines.push(`⚠️ *Minimum Order Requirement*: 4 books OR 1 Combo Pack.`);
    lines.push(`(Please add ${4 - totalBookCount} more book(s) to checkout)`);
  }

  lines.push(`💵 *Final Total: ₹${totalAmount}*`);
  return lines.join('\n');
}

/** Look up live ST Courier tracking for customer */
export async function lookupOrderTracking(phone: string, queryStr?: string): Promise<string> {
  const digits = phone.replace(/\D/g, '').slice(-10);

  let ordersRes = await queryDb(
    `SELECT id, order_number, order_status, courier_name, awb_number, tracking_url, total_amount, ordered_at, shipping_address
     FROM orders
     WHERE (razorpay_order_id = $1 OR order_number ILIKE $2 OR shipping_address ILIKE $3)
     ORDER BY created_at DESC
     LIMIT 3`,
    [queryStr || '', `%${queryStr || ''}%`, `%${digits}%`]
  );

  if (ordersRes.rows.length === 0) {
    ordersRes = await queryDb(
      `SELECT id, order_number, order_status, courier_name, awb_number, tracking_url, total_amount, ordered_at
       FROM orders
       WHERE shipping_address ILIKE $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [`%${digits}%`]
    );
  }

  if (ordersRes.rows.length === 0) {
    return `📦 We couldn't find any recent orders for phone number *+91 ${digits}*.\n\nIf you placed an order with a different phone number or Order ID, please reply with your Order ID (e.g. *BPG-1042*)!`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://blessingpowerguide.in';
  const outLines = ['📦 *YOUR RECENT ORDERS & LIVE TRACKING*:'];

  ordersRes.rows.forEach((ord: any) => {
    outLines.push('');
    outLines.push(`📋 *Order #${ord.order_number || ord.id}*`);
    outLines.push(`• Status: *${ord.order_status || 'Processing'}*`);
    outLines.push(`• Amount: *₹${ord.total_amount}*`);

    const token = digits ? generateTrackingToken(ord.order_number || ord.id, digits) : '';
    const tokenParam = token ? `&t=${token}` : '';
    const trackLink = `${siteUrl}/track?order=${encodeURIComponent(ord.order_number || ord.id)}${tokenParam}`;

    if (ord.awb_number) {
      outLines.push(`• Courier: *${ord.courier_name || 'ST Courier Express'}*`);
      outLines.push(`• Docket (AWB): \`${ord.awb_number}\``);
      outLines.push(`• Live Tracker: ${trackLink}`);
    } else {
      outLines.push(`• Status: 📦 Being packaged in Chennai hub.`);
      outLines.push(`• Live Tracker: ${trackLink}`);
    }
  });

  return outLines.join('\n');
}

export interface SavedCustomerProfile {
  userId: string;
  name: string;
  email: string;
  phone: string;
  addressObj: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
  };
  displayAddress: string;
}

/** Look up existing registered customer profile from website DB */
export async function findSavedCustomerProfile(phone: string): Promise<SavedCustomerProfile | null> {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) return null;

  try {
    // 1. Try finding in `users` + `addresses` table
    const userRes = await queryDb(
      `SELECT u.id as user_id, u.name as user_name, u.email as user_email, u.phone as user_phone,
              a.id as address_id, a.full_name, a.address_line1, a.address_line2, a.city, a.district, a.state, a.pincode
       FROM users u
       LEFT JOIN addresses a ON a.user_id = u.id
       WHERE u.phone LIKE $1 OR u.phone LIKE $2
       ORDER BY a.is_default DESC NULLS LAST, a.created_at DESC NULLS LAST
       LIMIT 1`,
      [`%${cleanPhone}`, `%${cleanPhone}%`]
    );

    if (userRes.rows.length > 0) {
      const row = userRes.rows[0];
      const email = (row.user_email || '').trim().toLowerCase();
      const name = (row.full_name || row.user_name || 'Valued Student').trim();
      const line1 = (row.address_line1 || '').trim();
      const line2 = (row.address_line2 || '').trim();
      const city = (row.city || 'Tamil Nadu').trim();
      const pincode = (row.pincode || '600001').trim();

      if (line1) {
        const fullAddr = [line1, line2, city].filter(Boolean).join(', ') + (pincode ? ` - ${pincode}` : '');
        return {
          userId: row.user_id,
          name,
          email,
          phone: cleanPhone,
          addressObj: {
            name,
            email,
            phone: cleanPhone,
            address: [line1, line2].filter(Boolean).join(', '),
            city,
            pincode,
          },
          displayAddress: fullAddr,
        };
      } else if (email) {
        // User found but no address yet
        return {
          userId: row.user_id,
          name,
          email,
          phone: cleanPhone,
          addressObj: {
            name,
            email,
            phone: cleanPhone,
            address: '',
            city: 'Tamil Nadu',
            pincode: '600001',
          },
          displayAddress: '',
        };
      }
    }

    // 2. Try finding recent completed order in `orders` table
    const orderRes = await queryDb(
      `SELECT user_id, shipping_address
       FROM orders
       WHERE shipping_address ILIKE $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [`%${cleanPhone}%`]
    );

    if (orderRes.rows.length > 0) {
      try {
        const rawAddr = orderRes.rows[0].shipping_address;
        const parsed = typeof rawAddr === 'string' ? JSON.parse(rawAddr) : rawAddr;
        if (parsed && (parsed.address || parsed.address_line1)) {
          const addrText = (parsed.address || parsed.address_line1 || '').trim();
          const name = (parsed.name || parsed.full_name || 'Valued Student').trim();
          const email = (parsed.email || '').trim().toLowerCase();
          const city = (parsed.city || 'Tamil Nadu').trim();
          const pincode = (parsed.pincode || '600001').trim();
          return {
            userId: orderRes.rows[0].user_id || '',
            name,
            email,
            phone: cleanPhone,
            addressObj: {
              name,
              email,
              phone: cleanPhone,
              address: addrText,
              city,
              pincode,
            },
            displayAddress: `${addrText}, ${city} - ${pincode}`,
          };
        }
      } catch {}
    }
  } catch (err) {
    console.error('[findSavedCustomerProfile Error]', err);
  }

  return null;
}

/** Remove 4-byte characters (emojis) and non-ASCII characters that trigger Razorpay MySQL utf8mb3 collation errors */
function sanitizeForRazorpay(input: string, maxLen = 40): string {
  if (!input) return '';
  return input
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Generate Razorpay Payment Link for WhatsApp Checkout */
export async function createWhatsAppPaymentLink(
  session: WhatsAppSession,
  totals: ReturnType<typeof calculateWhatsAppCartTotals>
) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://blessingpowerguide.in';

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured on server env.');
  }

  // Pre-payment live stock re-verification: if any book sold out on website, block payment immediately
  for (const item of session.cart) {
    const stockRes = await queryDb(
      `SELECT title, stock, status, stock_tamil, stock_english FROM books WHERE id = $1 LIMIT 1`,
      [item.id]
    );
    if (stockRes.rows.length === 0) {
      throw new Error(`"${item.title}" is no longer available.`);
    }
    const b = stockRes.rows[0];
    const isOut = b.status === 'out_of_stock' || (b.stock !== null && b.stock < item.qty);
    if (isOut) {
      throw new Error(`"${b.title}" just sold out and is currently out of stock.`);
    }
  }

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const amountPaisa = Math.round(totals.totalAmount * 100);
  const addr = session.shipping_address || {};
  const cleanPhone = session.phone.replace(/\D/g, '').slice(-10);
  const checkoutSessionId = `chk-wa-${Date.now()}`;
  const rawCustomerName = addr.name || session.name || 'Valued Student';
  const customerName = sanitizeForRazorpay(rawCustomerName, 40) || 'Valued Student';
  const customerEmail = (session.email || addr.email || `${cleanPhone}@blessingpowerguide.in`).trim().toLowerCase();
  const safeAddress = sanitizeForRazorpay(addr.address || '', 200);
  const safeCity = sanitizeForRazorpay(addr.city || 'Tamil Nadu', 40);
  const safePincode = (String(addr.pincode || '').match(/\b\d{6}\b/) || ['600001'])[0];
  const cartSummary = sanitizeForRazorpay(
    session.cart.map((c) => `${c.title} x${c.qty}`).join(', '),
    100
  );

  // 1. Create Razorpay Payment Link
  const linkPayload = {
    amount: amountPaisa,
    currency: 'INR',
    accept_partial: false,
    description: `Order for ${customerName}`.slice(0, 50),
    customer: {
      name: customerName,
      email: customerEmail,
      contact: `+91${cleanPhone}`,
    },
    notify: {
      sms: false,
      email: false,
    },
    reminder_enable: true,
    notes: {
      order_source: 'whatsapp',
      whatsapp_phone: session.phone,
      session_id: checkoutSessionId,
      customer_email: customerEmail,
      customer_name: customerName,
      delivery_name: customerName,
      delivery_address: safeAddress,
      delivery_city: safeCity,
      delivery_pincode: safePincode,
      cart_summary: cartSummary,
    },
    callback_url: `${siteUrl}/orders`,
    callback_method: 'get',
  };

  const linkRes = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(linkPayload),
  });

  const linkData = await linkRes.json().catch(() => ({}));
  if (!linkRes.ok || !linkData.short_url) {
    console.error('[Razorpay Payment Link Error]', linkData);
    throw new Error(linkData?.error?.description || 'Could not generate Razorpay payment link.');
  }

  const paymentLinkId = String(linkData.id || '').trim();
  const rzpOrderId = String(linkData.order_id || linkData.id || '').trim();
  const paymentLinkUrl = linkData.short_url;

  // 2. Pre-create checkout_sessions row with both IDs so webhook matches instantly
  await queryDb(
    `INSERT INTO checkout_sessions (
      id, user_id, razorpay_order_id, status, source,
      cart_snapshot, price_snapshot, shipping_address,
      subtotal, discount, shipping_fee, total_amount,
      created_at, updated_at
    ) VALUES ($1, $2, $3, 'PAYMENT_PENDING', 'whatsapp', $4, $5, $6, $7, 0, $8, $9, NOW(), NOW())
    ON CONFLICT (razorpay_order_id) DO UPDATE SET 
      shipping_address = EXCLUDED.shipping_address,
      cart_snapshot = EXCLUDED.cart_snapshot,
      total_amount = EXCLUDED.total_amount,
      updated_at = NOW()`,
    [
      checkoutSessionId,
      `wa-${cleanPhone}`,
      paymentLinkId,
      JSON.stringify(session.cart),
      JSON.stringify({ subtotal: totals.subtotal, total: totals.totalAmount, shipping: totals.shippingFee }),
      JSON.stringify({
        name: customerName,
        email: customerEmail,
        phone: cleanPhone,
        address: safeAddress,
        city: safeCity,
        pincode: safePincode,
      }),
      totals.subtotal,
      totals.shippingFee,
      totals.totalAmount,
    ]
  );

  session.razorpay_order_id = rzpOrderId;
  session.razorpay_payment_link_id = paymentLinkId;
  session.razorpay_payment_link_url = paymentLinkUrl;
  session.step = 'CHECKOUT_GENERATED';
  await saveWhatsAppSession(session);

  return paymentLinkUrl;
}

/** Main Entry Point: Process incoming WhatsApp message */
export async function handleIncomingWhatsAppMessage(
  fromPhone: string,
  incomingText: string,
  interactiveId?: string,
  senderName?: string
) {
  const session = await getOrCreateWhatsAppSession(fromPhone, senderName);
  const text = (incomingText || '').trim();
  const lower = text.toLowerCase();
  const actionId = interactiveId || '';
  const cleanPhone = fromPhone.replace(/\D/g, '').slice(-10);

  // 1. Reset / Clear Cart
  if (lower === 'clear' || lower === 'reset' || actionId === 'ACTION_CLEAR_CART') {
    session.cart = [];
    session.step = 'IDLE';
    await saveWhatsAppSession(session);
    return sendWhatsAppText(
      fromPhone,
      '🗑️ Your cart has been cleared. Send a subject name (e.g. *"Maths"* or *"Combo"*) to start fresh!'
    );
  }

  // 2. Greeting / Menu Trigger
  if (
    lower === 'hi' ||
    lower === 'hello' ||
    lower === 'vanakkam' ||
    lower === 'menu' ||
    lower === 'start' ||
    actionId === 'ACTION_MAIN_MENU'
  ) {
    session.step = 'IDLE';
    await saveWhatsAppSession(session);

    const greeting = session.name || senderName ? `Hello ${session.name || senderName}! 🙏` : 'Hello! 🙏';
    const welcome = [
      `${greeting} Welcome to *Blessing Power Guide Official Store* (Chennai). 📚`,
      ``,
      `How can we help you today?`,
      `• 📚 *Order 10th Standard Guides* (Tamil & English Medium)`,
      `• 🎁 *All-in-1 Combo Pack* (5 Books = 100% Free ST Courier Delivery)`,
      `• 🚚 *Track Existing Parcel*`,
      ``,
      `Tap a button below or type any book name to search:`,
    ].join('\n');

    const buttons: WhatsAppButton[] = [
      { id: 'ACTION_BROWSE_10TH', title: '📚 10th Guides' },
      { id: 'ACTION_VIEW_CART', title: '🛒 View Cart' },
      { id: 'ACTION_TRACK_ORDER', title: '🚚 Track Parcel' },
    ];
    return sendWhatsAppButtons(fromPhone, welcome, buttons);
  }

  // 3. View Cart Action
  if (lower === 'cart' || lower === 'view cart' || actionId === 'ACTION_VIEW_CART') {
    const cartText = renderCartText(session.cart);
    const totals = calculateWhatsAppCartTotals(session.cart);

    if (session.cart.length === 0) {
      const buttons: WhatsAppButton[] = [
        { id: 'ACTION_BROWSE_10TH', title: '📚 Browse Guides' },
        { id: 'ACTION_MAIN_MENU', title: '🏠 Main Menu' },
      ];
      return sendWhatsAppButtons(fromPhone, cartText, buttons);
    }

    if (totals.isMoqMet) {
      const buttons: WhatsAppButton[] = [
        { id: 'ACTION_CHECKOUT', title: '🛍️ Checkout' },
        { id: 'ACTION_BROWSE_10TH', title: '➕ Add More Books' },
        { id: 'ACTION_CLEAR_CART', title: '🗑️ Clear Cart' },
      ];
      return sendWhatsAppButtons(fromPhone, cartText, buttons);
    } else {
      const buttons: WhatsAppButton[] = [
        { id: 'ACTION_BROWSE_10TH', title: '📚 Add Books' },
        { id: 'ACTION_CLEAR_CART', title: '🗑️ Clear Cart' },
      ];
      return sendWhatsAppButtons(fromPhone, cartText, buttons);
    }
  }

  // 4. Track Order Action
  if (lower.startsWith('track') || lower === 'where is my order' || actionId === 'ACTION_TRACK_ORDER') {
    const queryPart = text.replace(/^track/i, '').trim();
    const trackingMsg = await lookupOrderTracking(fromPhone, queryPart || undefined);
    return sendWhatsAppText(fromPhone, trackingMsg);
  }

  // 5. Checkout Action
  if (lower === 'checkout' || actionId === 'ACTION_CHECKOUT') {
    const totals = calculateWhatsAppCartTotals(session.cart);
    if (!totals.isMoqMet) {
      return sendWhatsAppText(
        fromPhone,
        `⚠️ *Minimum Order Policy*: Our dispatch hub requires a minimum of *4 books* or *1 Combo Pack*.\nCurrently you have ${totals.totalBookCount} book(s).\n\nPlease add more books to proceed to checkout!`
      );
    }

    // Check if customer profile & address are already in website DB
    const savedProfile = await findSavedCustomerProfile(fromPhone);

    if (savedProfile && savedProfile.displayAddress) {
      session.name = savedProfile.name;
      session.email = savedProfile.email;
      session.shipping_address = savedProfile.addressObj;
      session.step = 'IDLE';
      await saveWhatsAppSession(session);

      const promptText = [
        `📍 *SAVED DELIVERY ADDRESS FOUND!*`,
        ``,
        `Welcome back, *${savedProfile.name}*! 🙏`,
        savedProfile.email ? `We found your account (*${savedProfile.email}*).` : `Found your registered address.`,
        ``,
        `📦 *Deliver to your saved address?*`,
        `🏠 *${savedProfile.displayAddress}*`,
        `📞 +91 ${cleanPhone}`,
      ].join('\n');

      const buttons: WhatsAppButton[] = [
        { id: 'ACTION_USE_SAVED_ADDRESS', title: '✅ Deliver to this Address' },
        { id: 'ACTION_ENTER_NEW_ADDRESS', title: '✏️ Use New Address' },
      ];
      return sendWhatsAppButtons(fromPhone, promptText, buttons);
    }

    // No saved address: start clean step-by-step entry
    session.step = 'AWAITING_NAME';
    await saveWhatsAppSession(session);

    return sendWhatsAppText(
      fromPhone,
      `✍️ *STEP 1 OF 3: RECIPIENT NAME*\n\nPlease reply with the *Student / Recipient Full Name*:`
    );
  }

  // 5b. Use Saved Address -> Generate Payment Link Immediately
  if (actionId === 'ACTION_USE_SAVED_ADDRESS') {
    const totals = calculateWhatsAppCartTotals(session.cart);
    if (!totals.isMoqMet) {
      return sendWhatsAppText(fromPhone, `⚠️ Cart requires minimum 4 books or 1 Combo to checkout.`);
    }

    try {
      const paymentLinkUrl = await createWhatsAppPaymentLink(session, totals);
      const addr = session.shipping_address || {};

      const payPrompt = [
        `✅ *ORDER READY & VERIFIED!*`,
        ``,
        `👤 *Recipient*: ${addr.name || session.name}`,
        session.email ? `📧 *Account Email*: ${session.email}` : '',
        `📍 *Delivery Address*: ${addr.address}`,
        `📮 *Pincode*: ${addr.pincode}`,
        ``,
        `💳 *BILL SUMMARY*:`,
        `• Books Subtotal: ₹${totals.subtotal}`,
        `• ST Courier Delivery: ${totals.isFreeDelivery ? '🎁 FREE Doorstep Delivery' : `₹${totals.shippingFee}`}`,
        `• *Total Payable: ₹${totals.totalAmount}*`,
        ``,
        `👉 *Click here to Pay securely via UPI / GPay / PhonePe / Paytm*:`,
        `${paymentLinkUrl}`,
        ``,
        `⚡ *Instant Verification*: Once paid, your order is verified and confirmed automatically right here in WhatsApp with your ST Courier live tracking docket!`,
      ].filter(Boolean).join('\n');

      return sendWhatsAppText(fromPhone, payPrompt);
    } catch (err: any) {
      console.error('[Create Payment Link Error]', err);
      return sendWhatsAppText(
        fromPhone,
        `⚠️ Could not generate payment link: ${err?.message || 'Please try again.'}`
      );
    }
  }

  // 5c. New Address or Change Name
  if (actionId === 'ACTION_ENTER_NEW_ADDRESS' || actionId === 'ACTION_EDIT_NAME') {
    session.step = 'AWAITING_NAME';
    await saveWhatsAppSession(session);

    return sendWhatsAppText(
      fromPhone,
      `✍️ *STEP 1 OF 3: RECIPIENT NAME*\n\nPlease reply with the *Student / Recipient Full Name*:`
    );
  }

  // 5d. Name Input Step
  if (session.step === 'AWAITING_NAME' && !actionId) {
    const cleanName = sanitizeForRazorpay(text, 40).replace(/[^a-zA-Z\s.]/g, '').trim();
    if (!cleanName || cleanName.length < 2) {
      return sendWhatsAppText(fromPhone, `⚠️ Please reply with a valid *Student / Recipient Full Name* (letters only):`);
    }

    session.name = cleanName;
    session.step = 'AWAITING_EMAIL';
    await saveWhatsAppSession(session);

    return sendWhatsAppText(
      fromPhone,
      `📧 *STEP 2 OF 3: EMAIL ADDRESS*\n\nHello *${cleanName}*! Please reply with your *Email Address*:\n\n*(This links your order to blessingpowerguide.in so you can view your official GST invoice and track delivery)*`
    );
  }

  // 5e. Email Input Step
  if (session.step === 'AWAITING_EMAIL' && !actionId) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (lower === 'skip' || lower === 'no' || lower === 'none') {
      session.email = `${cleanPhone}@blessingpowerguide.in`;
    } else if (emailRegex.test(text.trim())) {
      session.email = text.trim().toLowerCase();
    } else {
      return sendWhatsAppText(
        fromPhone,
        `⚠️ Please enter a valid email address (e.g. *student@gmail.com*) or reply *skip* to proceed:`
      );
    }

    session.step = 'AWAITING_ADDRESS';
    await saveWhatsAppSession(session);

    return sendWhatsAppText(
      fromPhone,
      `🏠 *STEP 3 OF 3: DELIVERY ADDRESS*\n\nPlease reply with your complete *Doorstep Delivery Address & 6-digit Pincode*:\n\n👉 *Example:*\n*Door No. 12, Anna Salai, T. Nagar, Chennai - 600017*\n\n*(100% Free Doorstep Delivery across Tamil Nadu via ST Courier Express)* 🚚`
    );
  }

  // 6. Address Input Step (Or all-in-one address detector)
  const isAddressStep = session.step === 'AWAITING_ADDRESS' && !actionId;
  const hasPincodeAndKeywords =
    !actionId &&
    session.cart.length > 0 &&
    /\b\d{6}\b/.test(text) &&
    /(nagar|street|road|salai|chennai|arani|tiruvallur|coimbatore|madurai|door|house|no\b|st\b|near)/i.test(text);

  if (isAddressStep || hasPincodeAndKeywords) {
    // Extract name if provided as label (e.g. Name: ...)
    let extractedName = session.name || senderName || 'Valued Student';
    const nameMatch = text.match(/Name\s*:\s*([^\n\r]+)/i);
    if (nameMatch && nameMatch[1].trim()) {
      extractedName = sanitizeForRazorpay(nameMatch[1].trim(), 40);
      session.name = extractedName;
    }

    // Extract email if provided
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && emailMatch[1]) {
      session.email = emailMatch[1].toLowerCase().trim();
    } else if (!session.email) {
      session.email = `${cleanPhone}@blessingpowerguide.in`;
    }

    // Clean address by stripping labels
    let cleanAddr = text
      .replace(/Name\s*:[^\n\r]+/gi, '')
      .replace(/Email\s*:[^\n\r]+/gi, '')
      .replace(/Phone\s*:[^\n\r]+/gi, '')
      .replace(/Mobile\s*:[^\n\r]+/gi, '')
      .replace(/Town\/City\s*:/gi, '')
      .replace(/District\s*:/gi, '')
      .replace(/Address\s*:/gi, '')
      .replace(/Pincode\s*:[^\n\r]+/gi, '')
      .replace(/(\r\n|\n|\r)+/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/^[\s,]+|[\s,]+$/g, '')
      .trim();

    if (!cleanAddr || cleanAddr.length < 3) {
      cleanAddr = text.trim();
    }

    const pincodeMatch = text.match(/\b\d{6}\b/);
    const parsedAddr = {
      name: extractedName,
      email: session.email,
      phone: cleanPhone,
      address: cleanAddr,
      city: 'Tamil Nadu',
      pincode: pincodeMatch ? pincodeMatch[0] : '600001',
    };

    session.shipping_address = parsedAddr;
    const totals = calculateWhatsAppCartTotals(session.cart);

    if (!totals.isMoqMet) {
      await saveWhatsAppSession(session);
      return sendWhatsAppText(
        fromPhone,
        `📍 Address saved for *${parsedAddr.name}*!\n\n⚠️ *Minimum Order Notice*: You currently have ${totals.totalBookCount} book(s) in your cart. Please add more books (Minimum 4 books or 1 Combo) to proceed to payment!`
      );
    }

    try {
      const paymentLinkUrl = await createWhatsAppPaymentLink(session, totals);

      const payPrompt = [
        `✅ *ADDRESS SAVED & ORDER READY!*`,
        ``,
        `👤 *Recipient*: ${parsedAddr.name}`,
        `📧 *Account Email*: ${parsedAddr.email}`,
        `📍 *Delivery Address*: ${parsedAddr.address}`,
        `📮 *Pincode*: ${parsedAddr.pincode}`,
        ``,
        `💳 *BILL SUMMARY*:`,
        `• Books Subtotal: ₹${totals.subtotal}`,
        `• ST Courier Delivery: ${totals.isFreeDelivery ? '🎁 FREE Doorstep Delivery' : `₹${totals.shippingFee}`}`,
        `• *Total Payable: ₹${totals.totalAmount}*`,
        ``,
        `👉 *Click here to Pay securely via UPI / GPay / PhonePe / Paytm*:`,
        `${paymentLinkUrl}`,
        ``,
        `⚡ *Instant Verification*: Once paid, your order is verified and confirmed automatically right here in WhatsApp with your ST Courier live tracking docket!`,
      ].join('\n');

      return sendWhatsAppText(fromPhone, payPrompt);
    } catch (err: any) {
      console.error('[Create Payment Link Error]', err);
      return sendWhatsAppText(
        fromPhone,
        `⚠️ We encountered an issue setting up online payment: ${err?.message || 'Please try again in a few moments.'}`
      );
    }
  }

  // 7. Pick Medium for Bilingual Guides (Maths, Science, Social)
  if (actionId.startsWith('PICK_MEDIUM_')) {
    const bookId = actionId.replace('PICK_MEDIUM_', '');
    const bookRes = await queryDb(
      `SELECT id, title, price, discount_price, language
       FROM books WHERE id = $1 LIMIT 1`,
      [bookId]
    );

    if (bookRes.rows.length === 0) {
      return sendWhatsAppText(fromPhone, '⚠️ Book not found or unavailable.');
    }

    const b = bookRes.rows[0];
    const finalPrice = Number(b.discount_price || b.price || 330);
    const promptText = [
      `📘 *${b.title}* (₹${finalPrice})`,
      ``,
      `Please select your medium of study:`,
    ].join('\n');

    const buttons: WhatsAppButton[] = [
      { id: `ADD_BOOK_${b.id}:Tamil Medium`, title: '📕 Tamil Medium' },
      { id: `ADD_BOOK_${b.id}:English Medium`, title: '📗 English Medium' },
    ];

    return sendWhatsAppButtons(fromPhone, promptText, buttons);
  }

  // 8. Add to Cart Selection (from interactive list / buttons)
  if (actionId.startsWith('ADD_BOOK_')) {
    const parts = actionId.replace('ADD_BOOK_', '').split(':');
    const bookId = parts[0];
    const mediumChoice = parts[1] || '';

    const bookRes = await queryDb(
      `SELECT id, title, price, discount_price, stock, stock_tamil, stock_english, status,
        CASE 
          WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' OR (combo_subjects IS NOT NULL AND combo_subjects != '[]'::jsonb) 
          THEN true 
          ELSE false 
        END AS is_combo
       FROM books WHERE id = $1 LIMIT 1`,
      [bookId]
    );

    if (bookRes.rows.length === 0) {
      return sendWhatsAppText(fromPhone, '⚠️ Book not found or unavailable.');
    }

    const b = bookRes.rows[0];
    const isOutOfStock = b.status === 'out_of_stock' || (b.stock !== null && b.stock <= 0);
    const isComingSoon = b.status === 'coming_soon';

    if (isComingSoon) {
      return sendWhatsAppText(
        fromPhone,
        `🚀 *COMING SOON*: "${b.title}" is currently in final printing and will be available shortly!`
      );
    }

    if (isOutOfStock) {
      return sendWhatsAppText(
        fromPhone,
        `⚠️ *OUT OF STOCK*: Sorry, "${b.title}" is currently out of stock. Fresh copies are arriving soon from Chennai press!`
      );
    }

    const finalPrice = Number(b.discount_price || b.price || 0);
    const existingIndex = session.cart.findIndex(
      (c) => c.id === b.id && (!mediumChoice || c.medium === mediumChoice)
    );

    if (existingIndex >= 0) {
      session.cart[existingIndex].qty += 1;
    } else {
      session.cart.push({
        id: b.id,
        title: b.title,
        price: finalPrice,
        qty: 1,
        medium: mediumChoice || undefined,
        isCombo: Boolean(b.is_combo),
      });
    }

    await saveWhatsAppSession(session);

    const addedMed = mediumChoice && mediumChoice !== 'Combo' ? ` (${mediumChoice})` : '';
    const replyText = [
      `✅ Added *${b.title}${addedMed}* to your cart!`,
      ``,
      renderCartText(session.cart),
    ].join('\n');

    const totals = calculateWhatsAppCartTotals(session.cart);
    const buttons: WhatsAppButton[] = totals.isMoqMet
      ? [
          { id: 'ACTION_CHECKOUT', title: '🛍️ Checkout' },
          { id: 'ACTION_BROWSE_10TH', title: '➕ Add More Books' },
          { id: 'ACTION_VIEW_CART', title: '🛒 View Cart' },
        ]
      : [
          { id: 'ACTION_BROWSE_10TH', title: '📚 Add More Books' },
          { id: 'ACTION_VIEW_CART', title: '🛒 View Cart' },
        ];

    return sendWhatsAppButtons(fromPhone, replyText, buttons);
  }

  // 9. Natural Language Quick Add / Search Shortcuts
  if (lower.includes('combo') || lower.includes('full set') || lower.includes('5 in 1')) {
    const comboRes = await queryDb(
      `SELECT id, title, price, discount_price FROM books
       WHERE category_id = 'cat-combos' OR title ILIKE '%combo%' LIMIT 1`
    );
    if (comboRes.rows.length > 0) {
      const b = comboRes.rows[0];
      const price = b.discount_price || b.price;
      const buttons: WhatsAppButton[] = [
        { id: `ADD_BOOK_${b.id}:Combo`, title: '🎁 Add Combo to Cart' },
        { id: 'ACTION_BROWSE_10TH', title: '📚 View All Guides' },
      ];
      return sendWhatsAppButtons(
        fromPhone,
        `🎁 *10th Standard 5-in-1 Combo Pack* (₹${price})\n• Includes all 5 subjects: Tamil, English, Maths, Science, Social Science\n• *100% FREE ST Courier Doorstep Delivery*\n\nTap below to add to cart:`,
        buttons
      );
    }
  }

  if (lower.includes('math')) {
    const mathRes = await queryDb(`SELECT id, title FROM books WHERE subject ILIKE '%math%' OR title ILIKE '%math%' LIMIT 1`);
    if (mathRes.rows.length > 0) {
      const b = mathRes.rows[0];
      if (lower.includes('tamil')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:Tamil Medium`, senderName);
      }
      if (lower.includes('english')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:English Medium`, senderName);
      }
      const buttons: WhatsAppButton[] = [
        { id: `ADD_BOOK_${b.id}:Tamil Medium`, title: '📕 Tamil Medium' },
        { id: `ADD_BOOK_${b.id}:English Medium`, title: '📗 English Medium' },
      ];
      return sendWhatsAppButtons(fromPhone, `📘 *10th Maths Guide*\nPlease choose your Medium:`, buttons);
    }
  }

  if (lower.includes('science')) {
    const sciRes = await queryDb(`SELECT id, title FROM books WHERE subject ILIKE '%science%' OR title ILIKE '%science%' LIMIT 1`);
    if (sciRes.rows.length > 0) {
      const b = sciRes.rows[0];
      if (lower.includes('tamil')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:Tamil Medium`, senderName);
      }
      if (lower.includes('english')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:English Medium`, senderName);
      }
      const buttons: WhatsAppButton[] = [
        { id: `ADD_BOOK_${b.id}:Tamil Medium`, title: '📕 Tamil Medium' },
        { id: `ADD_BOOK_${b.id}:English Medium`, title: '📗 English Medium' },
      ];
      return sendWhatsAppButtons(fromPhone, `🔬 *10th Science Guide*\nPlease choose your Medium:`, buttons);
    }
  }

  if (lower.includes('social')) {
    const socRes = await queryDb(`SELECT id, title FROM books WHERE subject ILIKE '%social%' OR title ILIKE '%social%' LIMIT 1`);
    if (socRes.rows.length > 0) {
      const b = socRes.rows[0];
      if (lower.includes('tamil')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:Tamil Medium`, senderName);
      }
      if (lower.includes('english')) {
        return handleIncomingWhatsAppMessage(fromPhone, '', `ADD_BOOK_${b.id}:English Medium`, senderName);
      }
      const buttons: WhatsAppButton[] = [
        { id: `ADD_BOOK_${b.id}:Tamil Medium`, title: '📕 Tamil Medium' },
        { id: `ADD_BOOK_${b.id}:English Medium`, title: '📗 English Medium' },
      ];
      return sendWhatsAppButtons(fromPhone, `🌍 *10th Social Science Guide*\nPlease choose your Medium:`, buttons);
    }
  }

  // 10. Search / Browse Catalog
  const searchTerm = actionId === 'ACTION_BROWSE_10TH' ? '' : text.trim();
  const isBrowseAll = actionId === 'ACTION_BROWSE_10TH' || !searchTerm || /^(all|browse|catalog|books|guides|10th)/i.test(searchTerm);

  let booksRes;
  if (isBrowseAll) {
    booksRes = await queryDb(
      `SELECT id, title, price, discount_price, stock, status, language,
        CASE 
          WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' OR (combo_subjects IS NOT NULL AND combo_subjects != '[]'::jsonb) 
          THEN true 
          ELSE false 
        END AS is_combo
       FROM books
       WHERE (status = 'published' OR status IS NULL)
       ORDER BY (CASE WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' THEN 1 ELSE 2 END), title ASC
       LIMIT 10`
    );
  } else {
    booksRes = await queryDb(
      `SELECT id, title, price, discount_price, stock, status, language,
        CASE 
          WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' OR (combo_subjects IS NOT NULL AND combo_subjects != '[]'::jsonb) 
          THEN true 
          ELSE false 
        END AS is_combo
       FROM books
       WHERE (status = 'published' OR status IS NULL)
         AND (title ILIKE $1 OR COALESCE(subject, '') ILIKE $1 OR COALESCE(description, '') ILIKE $1 OR category_id ILIKE $1)
       ORDER BY (CASE WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' THEN 1 ELSE 2 END), title ASC
       LIMIT 10`,
      [`%${searchTerm}%`]
    );

    // Fall back to all published books if no match
    if (booksRes.rows.length === 0) {
      booksRes = await queryDb(
        `SELECT id, title, price, discount_price, stock, status, language,
          CASE 
            WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' OR (combo_subjects IS NOT NULL AND combo_subjects != '[]'::jsonb) 
            THEN true 
            ELSE false 
          END AS is_combo
         FROM books
         WHERE (status = 'published' OR status IS NULL)
         ORDER BY (CASE WHEN category_id = 'cat-combos' OR title ILIKE '%combo%' THEN 1 ELSE 2 END), title ASC
         LIMIT 10`
      );
    }
  }

  if (booksRes.rows.length === 0) {
    return sendWhatsAppText(
      fromPhone,
      `🔍 No books are currently published in the catalog.\n\nPlease type *"menu"* to return to the main options!`
    );
  }

  // Build Interactive List Picker for Found Books
  const sections: WhatsAppListSection[] = [
    {
      title: 'Blessing Power Guides',
      rows: booksRes.rows.map((b: any) => {
        const isOutOfStock = b.status === 'out_of_stock' || (b.stock !== null && b.stock <= 0);
        const isComingSoon = b.status === 'coming_soon';
        const price = b.discount_price || b.price;
        const isCombo = Boolean(b.is_combo);

        let statusText = `₹${price}`;
        if (isCombo) statusText += ' • 🎁 Free Courier';
        else statusText += ' • 4 Books MOQ';

        if (isComingSoon) statusText = '🚀 Coming Soon';
        if (isOutOfStock) statusText = '⚠️ Out of Stock';

        // Direct action depending on book type
        let actionId = `PICK_MEDIUM_${b.id}`;
        if (isCombo) {
          actionId = `ADD_BOOK_${b.id}:Combo`;
        } else if (b.language === 'Tamil') {
          actionId = `ADD_BOOK_${b.id}:Tamil Medium`;
        } else if (b.language === 'English') {
          actionId = `ADD_BOOK_${b.id}:English Medium`;
        }

        return {
          id: actionId,
          title: b.title.slice(0, 24),
          description: statusText.slice(0, 72),
        };
      }),
    },
  ];

  const headerMsg = isBrowseAll
    ? `📚 *Available 10th Guides & Combos:*\nSelect any book below to add to your cart or choose medium:`
    : `📚 *Found Guides for "${searchTerm}":*\nSelect any book below to add to your cart:`;

  return sendWhatsAppList(
    fromPhone,
    headerMsg,
    'Select Guide',
    sections
  );
}
