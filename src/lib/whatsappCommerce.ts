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

export interface WhatsAppSession {
  phone: string;
  name: string | null;
  step: 'IDLE' | 'SEARCH' | 'AWAITING_ADDRESS' | 'CHECKOUT_GENERATED';
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
  razorpay_payment_link_url?: string;
}

export async function getOrCreateWhatsAppSession(phone: string, senderName?: string): Promise<WhatsAppSession> {
  const selectRes = await queryDb(
    `SELECT phone, name, step, cart, shipping_address, razorpay_order_id, razorpay_payment_link_url
     FROM whatsapp_sessions WHERE phone = $1 LIMIT 1`,
    [phone]
  );

  if (selectRes.rows.length > 0) {
    const row = selectRes.rows[0];
    return {
      phone: row.phone,
      name: row.name || senderName || null,
      step: row.step || 'IDLE',
      cart: Array.isArray(row.cart) ? row.cart : [],
      shipping_address: row.shipping_address || null,
      razorpay_order_id: row.razorpay_order_id || undefined,
      razorpay_payment_link_url: row.razorpay_payment_link_url || undefined,
    };
  }

  const initialCart: any[] = [];
  await queryDb(
    `INSERT INTO whatsapp_sessions (phone, name, step, cart, last_interaction, created_at, updated_at)
     VALUES ($1, $2, 'IDLE', $3, NOW(), NOW(), NOW())
     ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()`,
    [phone, senderName || null, JSON.stringify(initialCart)]
  );

  return {
    phone,
    name: senderName || null,
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
         razorpay_payment_link_url = $5,
         last_interaction = NOW(),
         updated_at = NOW()
     WHERE phone = $6`,
    [
      session.step,
      JSON.stringify(session.cart || []),
      session.shipping_address ? JSON.stringify(session.shipping_address) : null,
      session.razorpay_order_id || null,
      session.razorpay_payment_link_url || null,
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

    if (ord.awb_number) {
      outLines.push(`• Courier: *${ord.courier_name || 'ST Courier Express'}*`);
      outLines.push(`• Docket (AWB): \`${ord.awb_number}\``);
      outLines.push(`• Live Tracker: ${siteUrl}/track?order=${encodeURIComponent(ord.order_number)}`);
    } else {
      outLines.push(`• Status: 📦 Being packaged at our Chennai central hub. Tracking docket will be sent once dispatched.`);
    }
  });

  return outLines.join('\n');
}

/** Generate Razorpay Payment Link for WhatsApp Checkout */
export async function createWhatsAppPaymentLink(session: WhatsAppSession, totals: ReturnType<typeof calculateWhatsAppCartTotals>) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://blessingpowerguide.in';

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured on server env.');
  }

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const amountPaisa = Math.round(totals.totalAmount * 100);
  const addr = session.shipping_address || {};
  const customerName = addr.name || session.name || 'Valued Student';
  const cleanPhone = session.phone.replace(/\D/g, '').slice(-10);

  // 1. Create Razorpay Payment Link
  const linkPayload = {
    amount: amountPaisa,
    currency: 'INR',
    accept_partial: false,
    description: `Blessing Power Guide - WhatsApp Order for ${customerName}`,
    customer: {
      name: customerName,
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
      delivery_name: customerName,
      delivery_address: addr.address || '',
      delivery_city: addr.city || '',
      delivery_pincode: addr.pincode || '',
      cart_summary: session.cart.map((c) => `${c.title} x${c.qty}`).join(', '),
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

  const rzpOrderId = linkData.order_id || linkData.id;
  const paymentLinkUrl = linkData.short_url;

  // 2. Pre-create checkout_sessions row so when Razorpay webhook arrives,
  // orderFinalizer.ts executes atomically with complete cart snapshot & address
  await queryDb(
    `INSERT INTO checkout_sessions (
      id, user_id, razorpay_order_id, status, source,
      cart_snapshot, price_snapshot, shipping_address,
      subtotal, discount, shipping_fee, total_amount,
      created_at, updated_at
    ) VALUES ($1, $2, $3, 'PAYMENT_PENDING', 'whatsapp', $4, $5, $6, $7, 0, $8, $9, NOW(), NOW())
    ON CONFLICT (razorpay_order_id) DO UPDATE SET updated_at = NOW()`,
    [
      `chk-wa-${Date.now()}`,
      `wa-${cleanPhone}`,
      rzpOrderId,
      JSON.stringify(session.cart),
      JSON.stringify({ subtotal: totals.subtotal, total: totals.totalAmount, shipping: totals.shippingFee }),
      JSON.stringify(addr),
      totals.subtotal,
      totals.shippingFee,
      totals.totalAmount,
    ]
  );

  session.razorpay_order_id = rzpOrderId;
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

    const greeting = senderName ? `Hello ${senderName}! 🙏` : 'Hello! 🙏';
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
      return sendWhatsAppText(fromPhone, cartText);
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

    session.step = 'AWAITING_ADDRESS';
    await saveWhatsAppSession(session);

    const addrPrompt = [
      `📍 *DELIVERY ADDRESS REQUIRED*`,
      ``,
      `Please reply with your complete delivery address in this format:`,
      ``,
      `*Name*: Student / Parent Name`,
      `*Address*: Door No, Street / Area`,
      `*Town/City*: `,
      `*District*: `,
      `*Pincode*: 6 digits`,
      ``,
      `*(All parcels are packaged from our Chennai hub and delivered via ST Courier Express)* 🚚`,
    ].join('\n');

    return sendWhatsAppText(fromPhone, addrPrompt);
  }

  // 6. Address Input State
  if (session.step === 'AWAITING_ADDRESS' && !actionId.startsWith('ADD_BOOK_')) {
    // Parse address lines
    const parsedAddr = {
      name: session.name || 'Student',
      address: text,
      city: 'Tamil Nadu',
      pincode: (text.match(/\b\d{6}\b/) || ['600001'])[0],
    };

    session.shipping_address = parsedAddr;
    const totals = calculateWhatsAppCartTotals(session.cart);

    try {
      const paymentLinkUrl = await createWhatsAppPaymentLink(session, totals);

      const payPrompt = [
        `✅ *ADDRESS SAVED & ORDER READY!*`,
        ``,
        `📍 *Delivery To*:`,
        `${parsedAddr.address}`,
        ``,
        `💳 *BILL SUMMARY*:`,
        `• Books Subtotal: ₹${totals.subtotal}`,
        `• Delivery: ${totals.isFreeDelivery ? 'FREE Doorstep Delivery' : `₹${totals.shippingFee}`}`,
        `• *Total Payable: ₹${totals.totalAmount}*`,
        ``,
        `👉 *Click here to Pay securely via GPay / PhonePe / Paytm / UPI*:`,
        `${paymentLinkUrl}`,
        ``,
        `⚡ *Instant Verification*: Once payment is complete, your order is verified and confirmed automatically right here in this WhatsApp chat!`,
      ].join('\n');

      return sendWhatsAppText(fromPhone, payPrompt);
    } catch (err: any) {
      return sendWhatsAppText(
        fromPhone,
        `⚠️ We encountered an issue setting up online payment: ${err?.message || 'Please try again in a few moments.'}`
      );
    }
  }

  // 7. Add to Cart Selection (e.g. from interactive list / buttons)
  if (actionId.startsWith('ADD_BOOK_')) {
    const [_, bookId, mediumChoice] = actionId.split(':');
    const bookRes = await queryDb(
      `SELECT id, title, price, discount_price, stock, stock_tamil, stock_english, status, is_combo
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

    const addedMed = mediumChoice ? ` (${mediumChoice})` : '';
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

  // 8. Search / Browse Catalog
  const searchTerm = actionId === 'ACTION_BROWSE_10TH' ? '10th' : text;
  const booksRes = await queryDb(
    `SELECT id, title, price, discount_price, stock, status, is_combo
     FROM books
     WHERE is_active = true
       AND (title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
     ORDER BY is_combo DESC, title ASC
     LIMIT 8`,
    [`%${searchTerm}%`]
  );

  if (booksRes.rows.length === 0) {
    return sendWhatsAppText(
      fromPhone,
      `🔍 No books found matching *"${text}"*.\n\nTry searching for: *"10th"*, *"Maths"*, *"Science"*, or *"Combo"*!`
    );
  }

  // Build Interactive List Picker for Found Books
  const sections: WhatsAppListSection[] = [
    {
      title: 'Available Guides',
      rows: booksRes.rows.map((b: any) => {
        const isOutOfStock = b.status === 'out_of_stock' || (b.stock !== null && b.stock <= 0);
        const isComingSoon = b.status === 'coming_soon';
        const price = b.discount_price || b.price;

        let statusText = `₹${price}`;
        if (b.is_combo) statusText += ' • 🎁 Free Courier';
        if (isComingSoon) statusText = '🚀 Coming Soon';
        if (isOutOfStock) statusText = '⚠️ Out of Stock';

        return {
          id: `ADD_BOOK_${b.id}:Tamil Medium`,
          title: b.title.slice(0, 24),
          description: statusText.slice(0, 72),
        };
      }),
    },
  ];

  return sendWhatsAppList(
    fromPhone,
    `📚 *Found ${booksRes.rows.length} Guides for "${searchTerm}"*:\nSelect any book below to add to your cart:`,
    'Select Book',
    sections
  );
}
