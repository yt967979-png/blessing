import { queryDb } from '@/lib/db';
import { fulfillmentStatus, isRecordCancelled } from '@/lib/orderStatus';

export interface RagResponse {
  answer: string;
  suggestions: string[];
  shouldEscalate: boolean;
  linkedOrderId?: string;
  linkedOrderData?: {
    orderId: string;
    status: string;
    totalAmount: number;
    trackingNumber?: string;
    courierName?: string;
    city?: string;
    pincode?: string;
    trackingUrl?: string;
    items?: { title: string; qty: number; price?: number }[];
  };
  cardType?: 'order' | 'books' | 'contact' | 'policy';
  cardData?: any;
}

const STORE_POLICIES = {
  moq: 4,
  shippingBelowMoqFee: 150, // Applied on exactly 4 books
  freeShippingQty: 5,       // Free shipping for 5+ books
  courier: 'ST Courier Express',
  turnaroundChennai: '24 to 48 hours for Chennai, Chengalpattu & Tiruvallur',
  turnaroundTN: '2 to 3 business days across other Tamil Nadu districts (Coimbatore, Madurai, Trichy, Salem, Tirunelveli, Erode, Vellore, Thanjavur, etc.)',
  turnaroundOther: '3 to 5 business days for other South Indian locations',
  helpline: '+91 98404 18228',
  office: 'Trust Square, Ayanavaram, Chennai - 600012, Tamil Nadu, India',
  hours: 'Monday to Saturday, 9:00 AM – 8:00 PM IST',
  returnPolicy: 'We provide a 100% Free Replacement Guarantee for any misprinted, missing pages, or transit-damaged guides. A fresh copy is dispatched immediately via ST Courier at zero extra cost.',
  payments: 'Prepaid online via Razorpay (UPI, Google Pay, PhonePe, Paytm, BHIM, RuPay, Visa, MasterCard, NetBanking). Cash on Delivery (COD) is not supported to ensure safe, moisture-proof educational delivery.',
  syllabus: '100% aligned with the Tamil Nadu State Board (Samacheer Kalvi) syllabus for Class 10 (SSLC).',
};

/**
 * Clean and extract potential order ID, phone number, or AWB docket from prompt.
 */
function extractOrderRef(prompt: string): string | null {
  const bpgMatch = prompt.match(/\b(BPG-?[A-Z0-9_-]{4,16})\b/i);
  if (bpgMatch) {
    const raw = bpgMatch[1].toUpperCase();
    return raw.startsWith('BPG-') ? raw : `BPG-${raw.replace(/^BPG-?/, '')}`;
  }
  const hashMatch = prompt.match(/#([A-Z0-9_-]{4,20})\b/i);
  if (hashMatch) {
    const code = hashMatch[1].toUpperCase();
    return code.startsWith('BPG-') ? code : `BPG-${code}`;
  }
  const ordMatch = prompt.match(/\b(ord[_-][a-z0-9_-]{4,32})\b/i);
  if (ordMatch) return ordMatch[1];
  const pureDigits = prompt.match(/\b(\d{4,8})\b/);
  if (pureDigits && !prompt.match(/\b([6-9]\d{9})\b/)) {
    return `BPG-${pureDigits[1]}`;
  }
  const tokenMatch = prompt.match(/\b([A-Z0-9]{7,12})\b/i);
  if (
    tokenMatch &&
    !prompt.match(
      /\b(delivery|shipping|customer|tracking|standard|question|feedback|chennai|courier|replace|package|orders?)\b/i
    )
  ) {
    return tokenMatch[1].toUpperCase();
  }
  return null;
}

function extractPhone(prompt: string): string | null {
  const phoneMatch = prompt.match(/\b([6-9]\d{9})\b/);
  return phoneMatch ? phoneMatch[1] : null;
}

function extractAwb(prompt: string): string | null {
  const awbMatch = prompt.match(/\b(ST-?\d{6,14}|\d{9,12})\b/i);
  return awbMatch ? awbMatch[1] : null;
}

export interface CustomerContext {
  phone?: string;
  customerId?: string;
  userName?: string;
  email?: string;
  sessionOrder?: string;
}

function parseShippingAddress(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeDbOrder(row: any) {
  if (!row) return null;
  const addr = parseShippingAddress(row.shipping_address);
  return {
    ...row,
    customer_name: addr.name || row.customer_name || 'Valued Customer',
    customer_phone: addr.phone || row.customer_phone || '',
    city: addr.city || row.city || 'Tamil Nadu',
    pincode: addr.pincode || row.pincode || '',
    courier_status: row.order_status || 'PACKED',
    is_official_awb: Boolean(row.awb_number),
    shipping_address: typeof row.shipping_address === 'string' ? row.shipping_address : JSON.stringify(addr),
  };
}

/**
 * Core RAG Generation: Resolves user intent against live PostgreSQL database and verified store knowledge.
 */
export async function generateSupportRagAnswer(
  userPrompt: string,
  customerContext?: CustomerContext
): Promise<RagResponse> {
  const q = userPrompt.trim().toLowerCase();

  // ── Pre-fetch logged-in user's account orders ───────────────────────────────
  let accountOrders: any[] = [];
  let userAccountName = customerContext?.userName || '';
  const customerId = customerContext?.customerId;
  const userPhone = customerContext?.phone;
  const cleanUserPhone = userPhone ? userPhone.replace(/\D/g, '').slice(-10) : '';

  if (customerId || cleanUserPhone) {
    try {
      const ordersRes = await queryDb(
        `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
                courier_name, tracking_url, estimated_delivery, shipping_address, 
                packed_at, shipped_at, delivered_at, ordered_at 
         FROM orders 
         WHERE (user_id IS NOT NULL AND user_id = $1)
            OR ($2 <> '' AND (
                shipping_address LIKE $2 
                OR user_id IN (SELECT id FROM users WHERE phone LIKE $2 OR email LIKE $2)
            ))
         ORDER BY ordered_at DESC 
         LIMIT 5`,
        [customerId || 'NONE', cleanUserPhone ? `%${cleanUserPhone}%` : '']
      );
      accountOrders = (ordersRes.rows || []).map(normalizeDbOrder);
      if (!userAccountName && accountOrders.length > 0 && accountOrders[0].customer_name) {
        userAccountName = accountOrders[0].customer_name;
      }
    } catch (err) {
      console.error('[supportRag] Failed to prefetch orders:', err);
    }
  }

  // ── 1. Greetings & Casual Hello ───────────────────────────────────────────
  const greetingPattern = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|vanakkam|hlo|hii+|namaste|namaskar|howdy|ola)\b/i;
  if (greetingPattern.test(q) && q.length < 30) {
    const greeting = userAccountName ? `Hello **${userAccountName}**! 👋 ` : 'Hello! 👋 ';
    if (accountOrders.length > 0) {
      const latest = accountOrders[0];
      const latestCode = latest.order_number || latest.id;
      const latestStatus = fulfillmentStatus(latest);
      return {
        answer: `${greeting}Welcome to **Blessing Power Guide Support**!\n\nI can see your recent order **#${latestCode}** (Status: **${latestStatus.toUpperCase()}**). What would you like help with today?`,
        suggestions: [`🚚 Track Order #${latestCode}`, '📚 10th Guides & Prices', '📦 Shipping & Delivery', '🔄 Damaged Book Replacement', '👨‍💼 Talk to Admin'],
        shouldEscalate: false,
        linkedOrderId: latestCode,
        cardType: 'order',
        linkedOrderData: {
          orderId: latestCode,
          status: latestStatus,
          totalAmount: Number(latest.total_amount || 0),
          trackingNumber: latest.awb_number,
          courierName: latest.courier_name || 'ST Courier Express',
          city: latest.city,
          pincode: latest.pincode,
          trackingUrl: latest.tracking_url || `/track?orderId=${encodeURIComponent(latestCode)}`,
        },
      };
    }
    return {
      answer: `${greeting}Welcome to **Blessing Power Guide Support**! 🤖\n\nI can help you with:\n1. 🚚 **Live Order Tracking** (ST Courier docket & delivery status)\n2. 📚 **10th Class Guides & Prices** (Tamil, English, Maths, Science & Social)\n3. 📦 **Shipping & Free Delivery** (5+ books = free shipping!)\n4. 🛡️ **100% Free Replacement** for damaged or misprinted books\n5. 👨‍💼 **Connect with Admin** for personal assistance\n\nHow can I help you today?`,
      suggestions: ['🚚 Track My Order', '📚 10th Guides & Prices', '📦 Shipping & Free Delivery', '🔄 Damaged Book Replacement', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 1b. Thank You / Bye / OK Acknowledgement ─────────────────────────────
  const thankPattern = /^(thanks?|thank\s*you|ok\s*thank|bye|goodbye|got\s*it|nandri|romba\s*nandri|super|great|perfect|nice|cool|awesome)\b/i;
  if (thankPattern.test(q) && q.length < 40) {
    return {
      answer: `You're welcome! 🙏 If you need anything else — order tracking, book info, or admin support — I'm here 24/7. Have a great day!`,
      suggestions: ['🚚 Track My Order', '📚 Browse 10th Guides', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 2. Explicit Human Escalation Request ────────────────────────────────────
  const humanEscalatePattern = /\b(admin|human|agent|person|manager|representative|customer care|call me|speak with someone|connect admin|talk to an? admin|talk to support|need real person|pesa mudiyuma|staff)\b/i;
  if (humanEscalatePattern.test(q)) {
    return {
      answer: 'I am connecting you directly with our Chennai head office support team right now. An administrator has been alerted with an audible chime and will accept your chat momentarily.\n\nOur team is available **Monday to Saturday, 9:00 AM – 8:00 PM IST**.',
      suggestions: ['👨‍💼 Connect to Admin Now', '🚚 Track My Order', '📚 Browse 10th Guides', '📞 Call Office (+91 98404 18228)'],
      shouldEscalate: true,
      cardType: 'contact',
    };
  }

  // ── 3. Order Tracking & Live Delivery Status Inquiries (Live DB Resolution) ──
  const orderRef = extractOrderRef(userPrompt) || customerContext?.sessionOrder;
  const phoneRef = extractPhone(userPrompt) || cleanUserPhone;
  const awbRef = extractAwb(userPrompt);

  // Only trigger order query for genuine order-related intents, not casual mentions
  const isExplicitOrderRef = Boolean(orderRef) || Boolean(awbRef);
  const isOrderKeyword =
    q.includes('order') ||
    q.includes('track') ||
    q.includes('shipped') ||
    q.includes('where is') ||
    q.includes('dispatch') ||
    q.includes('awb') ||
    q.includes('docket') ||
    (q.includes('status') && !q.includes('stock')) ||
    (q.includes('delivery') && !q.includes('charge') && !q.includes('fee') && !q.includes('free')) ||
    q.includes('courier') ||
    q.includes('reach') ||
    q.includes('arrive') ||
    q.includes('when will i get') ||
    q.includes('st courier') ||
    q.includes('ennoda order') ||
    q.includes('order eppo varum') ||
    q.includes('parcel');

  const isOrderQuery = isExplicitOrderRef || isOrderKeyword;

  if (isOrderQuery) {
    let orderRow: any = null;
    let orderItems: any[] = [];
    try {
      if (orderRef) {
        const res = await queryDb(
          `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
                  courier_name, tracking_url, estimated_delivery, shipping_address, 
                  packed_at, shipped_at, delivered_at, ordered_at 
           FROM orders 
           WHERE order_number = $1 
              OR id = $1 
              OR UPPER(order_number) = $1 
              OR UPPER(id) = $1
              OR order_number ILIKE '%' || $1 || '%'
              OR id ILIKE '%' || $1 || '%'
           LIMIT 1`,
          [orderRef]
        );
        orderRow = normalizeDbOrder(res.rows[0]);
      } else if (awbRef) {
        const res = await queryDb(
          `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
                  courier_name, tracking_url, estimated_delivery, shipping_address, 
                  packed_at, shipped_at, delivered_at, ordered_at 
           FROM orders 
           WHERE awb_number = $1 OR shipment_id = $1
           LIMIT 1`,
          [awbRef]
        );
        orderRow = normalizeDbOrder(res.rows[0]);
      } else if (accountOrders.length > 0) {
        // Automatically take the logged-in user's latest order!
        orderRow = accountOrders[0];
      } else if (phoneRef) {
        const cleanPhone = phoneRef.replace(/\D/g, '').slice(-10);
        const res = await queryDb(
          `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
                  courier_name, tracking_url, estimated_delivery, shipping_address, 
                  packed_at, shipped_at, delivered_at, ordered_at 
           FROM orders 
           WHERE shipping_address LIKE $1 
              OR user_id IN (SELECT id FROM users WHERE phone LIKE $1)
           ORDER BY ordered_at DESC 
           LIMIT 1`,
          [`%${cleanPhone}%`]
        );
        orderRow = normalizeDbOrder(res.rows[0]);
      }

      if (orderRow) {
        const itemsRes = await queryDb(
          `SELECT book_title, quantity, book_price FROM order_items WHERE order_id = $1`,
          [orderRow.id]
        );
        orderItems = itemsRes.rows || [];
      }
    } catch (err) {
      console.error('[supportRag] order lookup error:', err);
    }

    if (orderRow) {
      const orderCode = orderRow.order_number || orderRow.id;
      const statusLabel = fulfillmentStatus(orderRow);
      const isCancelled = isRecordCancelled(orderRow);
      const awb = orderRow.awb_number;
      const hasAwb = Boolean(awb && !awb.startsWith('SHP-') && !awb.includes('Pending'));
      const greeting = userAccountName ? `Hello **${userAccountName}**! ` : 'Hello! ';

      let statusDescription = `${greeting}Here is your order **#${orderCode}**:\n\n• **Current Status**: **${statusLabel.toUpperCase()}**\n• **Customer**: ${orderRow.customer_name || userAccountName || 'Valued Customer'}\n• **Destination**: ${orderRow.city || 'Tamil Nadu'}${orderRow.pincode ? ` (${orderRow.pincode})` : ''}\n• **Total Paid**: ₹${orderRow.total_amount} (Prepaid via Razorpay)\n\n`;

      if (isCancelled) {
        statusDescription += `❌ **Status**: This order was cancelled. Any pre-paid amount has been initiated for refund back to the original payment source within 5-7 business days.`;
      } else if (hasAwb) {
        statusDescription += `🚚 **Courier Partner**: ${orderRow.courier_name || 'ST Courier Express'}\n📍 **ST Courier Docket (AWB)**: \`${awb}\`\n⏱️ **Delivery Estimate**: ${STORE_POLICIES.turnaroundChennai}, ${STORE_POLICIES.turnaroundTN}.\n\nYour parcel is dispatched and scanned with ST Courier Express.`;
      } else {
        statusDescription += `⏳ **Packaging in Progress**: Our Chennai packaging hub is preparing your order. Your books will be handed over to ST Courier Express today. An SMS with your official ST Courier docket tracking link will be sent to ${orderRow.customer_phone || 'your phone'}.`;
      }

      if (orderItems.length > 0) {
        statusDescription += `\n\n📚 **Guides in this package**:\n` +
          orderItems.map((it) => `• ${it.book_title} (×${it.quantity})`).join('\n');
      }

      if (accountOrders.length > 1) {
        statusDescription += `\n\n📋 **You have ${accountOrders.length} recent orders under this account**:\n` +
          accountOrders.slice(1, 4).map((o) => `• #${o.order_number || o.id} — ₹${o.total_amount} (${fulfillmentStatus(o)})`).join('\n');
      }

      const suggestionsList = [
        '📍 View Live Tracking',
        '📄 Download Tax Invoice',
        ...accountOrders.slice(1, 3).map((o) => `🚚 Track #${o.order_number || o.id}`),
        '🔄 Report Damaged Book',
        '👨‍💼 Talk to Admin',
      ];

      return {
        answer: statusDescription,
        suggestions: suggestionsList,
        shouldEscalate: false,
        linkedOrderId: orderCode,
        cardType: 'order',
        linkedOrderData: {
          orderId: orderCode,
          status: statusLabel,
          totalAmount: Number(orderRow.total_amount || 0),
          trackingNumber: orderRow.awb_number,
          courierName: orderRow.courier_name || 'ST Courier Express',
          city: orderRow.city,
          pincode: orderRow.pincode,
          trackingUrl: orderRow.tracking_url || `/track?orderId=${encodeURIComponent(orderCode)}`,
          items: orderItems.map((i) => ({ title: i.book_title, qty: i.quantity, price: Number(i.book_price || 0) })),
        },
      };
    }

    // Logged in user but no orders found
    if (customerId || cleanUserPhone) {
      return {
        answer: `Hello **${userAccountName || 'there'}**! We checked your account and found no orders placed yet.\n\nWould you like to browse our Class 10 guides? All orders with 5 or more books unlock **100% Free Doorstep Delivery** anywhere in Tamil Nadu!`,
        suggestions: ['📚 View 10th Full Set (5 Books - Free Delivery)', '🚚 Shipping & Delivery Rules', '💳 Payment Options', '👨‍💼 Talk to Admin'],
        shouldEscalate: false,
      };
    }

    // Completely anonymous user (no logged-in account, no phone, no order #)
    return {
      answer: 'To check your live delivery status, I need one of these:\n\n1. Your **Order ID** (e.g. `BPG-1048` or `#1048`)\n2. Or the **10-digit mobile number** used during checkout\n3. Or your **ST Courier AWB number**\n\n💡 **Tip**: Log in to your account to see all orders automatically!',
      suggestions: ['🚚 Where is my order?', '👨‍💼 Talk to Admin', '📚 Browse 10th Guides', '📞 Call Helpline'],
      shouldEscalate: false,
    };
  }

  // ── 3b. If user is logged in with orders but query didn't match order keywords, still show context ──
  // (This lets the fallback at the bottom handle it with order context)

  // ── 4. Minimum Order Quantity (MOQ) Queries ─────────────────────────────────
  if (
    q.includes('minimum') ||
    q.includes('moq') ||
    q.includes('1 book') ||
    q.includes('one book') ||
    q.includes('can i buy 1') ||
    q.includes('can i order 1') ||
    q.includes('single book') ||
    q.includes('2 book') ||
    q.includes('3 book') ||
    q.includes('oru book') ||
    q.includes('quantity limit')
  ) {
    return {
      answer: `📦 **Minimum Order Quantity (MOQ) Rule**:\n\n• **Minimum Requirement**: Exactly **4 books** per order.\n• **Why?**: Blessing Power Guides are packed in heavy-duty, moisture-proof protective packaging and shipped via priority ST Courier Express.\n• **Shipping Fee**: Ordering 4 books has a flat courier fee of ₹${STORE_POLICIES.shippingBelowMoqFee}.\n• **🎁 Free Delivery Unlock**: If you order **5 or more books** (e.g. the Complete 10th 5-Subject Full Set), delivery is **100% FREE** anywhere in Tamil Nadu!\n\n💡 *Recommendation: Adding a 5th guide saves you the ₹150 delivery charge!*`,
      suggestions: ['📚 View 10th Full Set (5 Books - Free Delivery)', '🚚 Delivery Timelines', '💳 Payment Options', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      cardType: 'policy',
    };
  }

  // ── 5. Shipping Charges & Free Delivery Offer ───────────────────────────────
  if (
    q.includes('shipping') ||
    q.includes('delivery charge') ||
    q.includes('delivery fee') ||
    q.includes('cost of delivery') ||
    q.includes('free delivery') ||
    q.includes('courier charge') ||
    q.includes('charges') ||
    q.includes('postage') ||
    q.includes('delivery evvalo') ||
    q.includes('free shipping')
  ) {
    return {
      answer: `🚚 **Shipping & Delivery Rates**:\n\n• **4 Books (MOQ)**: ₹${STORE_POLICIES.shippingBelowMoqFee} flat delivery fee across Tamil Nadu.\n• **5 or more Books**: **100% FREE DOORSTEP DELIVERY (₹0 shipping)**!\n• **Delivery Partner**: ${STORE_POLICIES.courier} (Direct daily dispatch from Chennai Central Packaging Hub).\n• **Transit Times**:\n  - Chennai & suburbs: **24 to 48 hours**\n  - Rest of Tamil Nadu (Coimbatore, Madurai, Trichy, Salem, Tirunelveli, Erode, etc.): **2 to 3 business days**\n\n🎯 *Pro Tip: Buying the complete 10th set (5 subjects) gives you free shipping automatically!*`,
      suggestions: ['📚 View 10th Full Set (5 Books - Free Delivery)', '🚚 Delivery Timelines', '👨‍💼 Talk to Admin', '📞 Helpline'],
      shouldEscalate: false,
      cardType: 'policy',
    };
  }

  // ── 6. Delivery Timelines & Coverage Districts ──────────────────────────────
  if (
    q.includes('how many days') ||
    q.includes('when will it come') ||
    q.includes('delivery time') ||
    q.includes('transit time') ||
    q.includes('timelines') ||
    q.includes('how long') ||
    q.includes('chennai') ||
    q.includes('madurai') ||
    q.includes('coimbatore') ||
    q.includes('trichy') ||
    q.includes('salem') ||
    q.includes('tirunelveli') ||
    q.includes('erode') ||
    q.includes('vellore') ||
    q.includes('thanjavur') ||
    q.includes('bangalore') ||
    q.includes('kerala') ||
    q.includes('eppo varum')
  ) {
    return {
      answer: `⏱️ **ST Courier Delivery Timelines**:\n\n• **Chennai, Chengalpattu & Tiruvallur**: ${STORE_POLICIES.turnaroundChennai}.\n• **All Other Tamil Nadu Districts**: ${STORE_POLICIES.turnaroundTN}.\n• **Other South Indian States**: ${STORE_POLICIES.turnaroundOther}.\n\nAll parcels are packed in tamper-evident, water-resistant packaging and scanned onto daily express ST Courier vans. Live SMS updates are sent with your official tracking docket.`,
      suggestions: ['🚚 Track My Order', '📦 Minimum Order & Delivery Fee', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 7. Books, Class 10th Subjects, Syllabus & Prices (Dynamic DB Query) ────
  if (
    q.includes('book') ||
    q.includes('guide') ||
    q.includes('math') ||
    q.includes('science') ||
    q.includes('tamil') ||
    q.includes('english') ||
    q.includes('social') ||
    q.includes('10th') ||
    q.includes('class') ||
    q.includes('standard') ||
    q.includes('price') ||
    q.includes('cost') ||
    q.includes('rate') ||
    q.includes('combo') ||
    q.includes('full set') ||
    q.includes('all books') ||
    q.includes('subject') ||
    q.includes('catalog') ||
    q.includes('edition') ||
    q.includes('2026') ||
    q.includes('samacheer') ||
    q.includes('pta')
  ) {
    let sampleBooks: any[] = [];
    try {
      const res = await queryDb(
        `SELECT id, title, standard, subject, price, discount_price, stock, badge, sample_pdf_url 
         FROM books 
         WHERE status = 'published' 
         ORDER BY id ASC 
         LIMIT 8`
      );
      sampleBooks = res.rows;
    } catch (_) {}

    const bookListText = sampleBooks.length > 0
      ? sampleBooks.map((b) => {
          const mrp = Number(b.price || 0);
          const sale = Number(b.discount_price || 0);
          const effective = sale > 0 && sale < mrp ? sale : mrp;
          const stockLabel = b.stock > 0 ? '✓ Available in Stock' : '⚠️ Low Stock';
          return `• **${b.title}**: ₹${effective} (${stockLabel})`;
        }).join('\n')
      : '• **10th Tamil Guide** — ₹260\n• **10th English Guide** — ₹260\n• **10th Mathematics Guide** — ₹280\n• **10th Science Guide** — ₹280\n• **10th Social Science Guide** — ₹280\n• **🌟 10th All-in-One Full Set Combo (5 Books)** — Unlocks Free Delivery!';

    return {
      answer: `📚 **Class 10 Guides & Prices**:\n\n${bookListText}\n\n• **Minimum Order**: 4 books (flat ₹150 courier fee)\n• **Free Delivery**: 5 or more books qualify for **100% Free Doorstep Delivery** across Tamil Nadu!\n• **Sample PDFs**: Free sample PDFs can be previewed directly on each book's page.`,
      suggestions: ['🛒 View 10th Full Set (5 Books - Free Delivery)', '🚚 Check Delivery Timelines', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      cardType: 'books',
      cardData: sampleBooks,
    };
  }

  // ── 8. Sample PDFs & Book Preview ───────────────────────────────────────────
  if (q.includes('sample') || q.includes('pdf') || q.includes('preview') || q.includes('inside book') || q.includes('demo') || q.includes('view page')) {
    return {
      answer: `📄 **Sample PDFs**:\n\nYou can preview and download sample chapter PDFs for all available 10th standard guides directly on each book's page on our website before placing an order.`,
      suggestions: ['📚 Browse 10th Guides', '🛒 Buy 10th Full Set', '🚚 Check Delivery Days', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 9. Payment Methods, Razorpay & Cash on Delivery (COD) ───────────────────
  if (
    q.includes('cod') ||
    q.includes('cash on delivery') ||
    q.includes('pay on delivery') ||
    q.includes('payment') ||
    q.includes('pay') ||
    q.includes('upi') ||
    q.includes('google pay') ||
    q.includes('gpay') ||
    q.includes('phonepe') ||
    q.includes('paytm') ||
    q.includes('bhim') ||
    q.includes('card') ||
    q.includes('safe') ||
    q.includes('secure')
  ) {
    return {
      answer: `💳 **Payment Options & COD Policy**:\n\n• **Supported Online Payments**: ${STORE_POLICIES.payments}\n• **Cash on Delivery (COD)**: We do **not** offer Cash on Delivery. Educational textbooks are packaged in special protective wrappers that cannot be kept in open transit. Online prepaid orders receive priority same-day packaging, instant SMS confirmation, and live ST Courier tracking.`,
      suggestions: ['📦 How to Place Order', '📚 View 10th Full Set', '🛡️ Is Payment Safe?', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      cardType: 'policy',
    };
  }

  // ── 10. Return, Damaged, Torn or Misprinted Replacement Guarantee ─────────────
  if (
    q.includes('return') ||
    q.includes('replace') ||
    q.includes('damage') ||
    q.includes('wrong book') ||
    q.includes('misprint') ||
    q.includes('missing page') ||
    q.includes('torn') ||
    q.includes('defect') ||
    q.includes('book kizhinjirukku') ||
    q.includes('exchange')
  ) {
    return {
      answer: `🛡️ **100% Free Replacement Guarantee**:\n\n${STORE_POLICIES.returnPolicy}\n\nIf your parcel arrived damaged in transit or has any printing defect, please click **Connect to Admin Now** below or send a photo of the parcel/book to our WhatsApp helpline at **+91 98404 18228**. Our Chennai dispatch office will send a fresh copy immediately.`,
      suggestions: ['👨‍💼 Connect to Admin Now', '📞 Call Helpline (+91 98404 18228)', '💬 WhatsApp Support', '🚚 Track Order'],
      shouldEscalate: true,
      cardType: 'contact',
    };
  }

  // ── 11. Address, Phone Number or Pincode Correction ─────────────────────────
  if (
    q.includes('change address') ||
    q.includes('wrong address') ||
    q.includes('change phone') ||
    q.includes('wrong phone') ||
    q.includes('update address') ||
    q.includes('pincode') ||
    q.includes('address mathanum')
  ) {
    return {
      answer: `✏️ **Update Delivery Address or Mobile Number**:\n\nIf your parcel has not yet been scanned and picked up by ST Courier Express, our team can update your shipping label immediately.\n\nClick **Connect to Admin Now** so our warehouse staff can make the change before dispatch.`,
      suggestions: ['👨‍💼 Connect to Admin Now', '📞 Call Office Directly', '🚚 Track Order'],
      shouldEscalate: true,
    };
  }

  // ── 12. Order Cancellation & Refund ─────────────────────────────────────────
  if (
    q.includes('cancel') ||
    q.includes('cancellation') ||
    q.includes('refund') ||
    q.includes('money back') ||
    q.includes('order cancel')
  ) {
    return {
      answer: `❌ **Order Cancellation & Refund Process**:\n\n• **Before Dispatch**: You can cancel an order before it has been dispatched from our Chennai packaging hub.\n• **Refund Processing**: Once cancelled, 100% of your pre-paid amount is automatically refunded via Razorpay back to your original payment method (Bank Account, UPI, or Card) within **5 to 7 business days**.\n• **After Dispatch**: Once an official ST Courier AWB docket has been scanned, the package is in transit with the courier and cannot be cancelled, but is fully covered under our Free Replacement Guarantee.`,
      suggestions: ['👨‍💼 Request Cancellation with Admin', '🚚 Track Order', '📞 Call Office'],
      shouldEscalate: true,
    };
  }

  // ── 13. Office Location, Timings & Contact Info ─────────────────────────────
  if (
    q.includes('office') ||
    q.includes('contact') ||
    q.includes('phone') ||
    q.includes('location') ||
    q.includes('address') ||
    q.includes('store') ||
    q.includes('where are you') ||
    q.includes('ayanavaram') ||
    q.includes('email') ||
    q.includes('helpline') ||
    q.includes('hours')
  ) {
    return {
      answer: `🏢 **Blessing Power Guide Head Office**:\n\n• **Address**: ${STORE_POLICIES.office}\n• **Phone / WhatsApp**: ${STORE_POLICIES.helpline}\n• **Working Hours**: ${STORE_POLICIES.hours}\n• **Courier Dispatch Hub**: Central Chennai (Direct daily ST Courier pickup for statewide express delivery).`,
      suggestions: ['📞 Call Helpline', '💬 WhatsApp Support', '🚚 Track Order', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      cardType: 'contact',
    };
  }

  // ── 14. School / Institutional Bulk Orders & Teacher Discounts ──────────────
  if (
    q.includes('bulk') ||
    q.includes('school') ||
    q.includes('institution') ||
    q.includes('teacher') ||
    q.includes('tuition') ||
    q.includes('coaching') ||
    q.includes('bulk discount') ||
    q.includes('20 books') ||
    q.includes('50 books') ||
    q.includes('100 books') ||
    q.includes('discount code')
  ) {
    return {
      answer: `🏫 **School & Institutional Bulk Orders**:\n\nWe provide special institutional pricing, teacher evaluation copies, and custom courier logistics for schools, tuition centers, and educators ordering **20 or more books**.\n\nPlease connect with our administration team directly to receive an official school quotation and invoice.`,
      suggestions: ['👨‍💼 Request School Bulk Quote', '📞 Call Office (+91 98404 18228)', '💬 WhatsApp Admin'],
      shouldEscalate: true,
    };
  }

  // ── 15. Class 10 Guides & Syllabus ──────────────────────────────────────────
  if (
    q.includes('exam') ||
    q.includes('syllabus') ||
    q.includes('study material') ||
    q.includes('guide details')
  ) {
    return {
      answer: `📚 **Tamil Nadu Class 10 Samacheer Kalvi Guides**:\n\nBlessing Power Guide offers comprehensive guides for Class 10 SSLC subjects (Tamil, English, Mathematics, Science, and Social Science).\n\nYou can preview and download sample chapter PDFs directly on each book page before ordering.`,
      suggestions: ['📚 View 10th Full Set (5 Books - Free Delivery)', '📄 Download Sample PDF', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 16. Other Standards (11th, 12th, 9th) ──────────────────────────────────
  if (
    q.includes('11th') ||
    q.includes('12th') ||
    q.includes('9th') ||
    q.includes('8th') ||
    q.includes('plus one') ||
    q.includes('plus two') ||
    q.includes('neet')
  ) {
    return {
      answer: `Currently, Blessing Power Guide specializes exclusively in **Tamil Nadu Class 10 (SSLC) Samacheer Kalvi** guides.`,
      suggestions: ['📚 View 10th Guides', '🛒 10th Full Set Combo', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 17. How to Place an Order ───────────────────────────────────────────────
  if (
    q.includes('how to order') ||
    q.includes('how to buy') ||
    q.includes('order pannuradhu epdi') ||
    q.includes('steps to order') ||
    q.includes('how can i order')
  ) {
    return {
      answer: `🛒 **How to Place an Order**:\n\n1. Go to the **Books** page and add guides to your Cart (Minimum order: 4 books; 5+ books get Free Delivery).\n2. Click the Cart icon to review.\n3. Enter your delivery address and mobile number.\n4. Complete payment online via Razorpay (UPI, GPay, PhonePe, Cards).\n\nYou will receive an SMS confirmation and ST Courier tracking details once dispatched.`,
      suggestions: ['📚 Browse 10th Guides', '🛒 Buy 10th Full Set (Free Delivery)', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 18. Why 4 Books MOQ ─────────────────────────────────────────────────────
  if (
    q.includes('why 4 books') ||
    q.includes('can i buy 1 book') ||
    q.includes('only single book') ||
    q.includes('1 book only') ||
    q.includes('single guide') ||
    q.includes('why moq')
  ) {
    return {
      answer: `📦 **Minimum Order Policy**:\n\nOur minimum order quantity is **4 books** for direct dispatch from our Chennai warehouse.\n\n• Ordering 4 books has a courier charge of ₹${STORE_POLICIES.shippingBelowMoqFee}.\n• Ordering **5 or more books** unlocks **100% Free Doorstep Delivery** across Tamil Nadu!`,
      suggestions: ['📚 View 10th Full Set (Free Delivery)', '📦 Shipping Charges', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 19. Invoice & Receipt ───────────────────────────────────────────────────
  if (
    q.includes('invoice') ||
    q.includes('bill') ||
    q.includes('receipt')
  ) {
    return {
      answer: `🧾 **Order Invoice & Receipt**:\n\n• Digital order details are sent via SMS upon checkout and accessible in **My Account > Orders**.\n• A printed invoice is included inside your ST Courier parcel.\n• For GST invoice requests, please contact our admin team.`,
      suggestions: ['🚚 Track Order', '👨‍💼 Request GST Invoice from Admin', '📞 Call Office (+91 98404 18228)'],
      shouldEscalate: false,
    };
  }

  // ── 20. Offline Chennai Purchase ────────────────────────────────────────────
  if (
    q.includes('offline') ||
    q.includes('bookstore') ||
    q.includes('book shop') ||
    q.includes('store near me') ||
    q.includes('can i buy directly') ||
    q.includes('direct purchase') ||
    q.includes('chennai shop') ||
    q.includes('ayanavaram store') ||
    q.includes('shop address') ||
    q.includes('nerla vandhu vangalama')
  ) {
    return {
      answer: `🏬 **Direct Purchase in Chennai**:\n\n• **Head Office**: Blessing Power Guide, Trust Square, Ayanavaram, Chennai - 600012, Tamil Nadu.\n• **Hours**: Monday to Saturday, 9:00 AM – 8:00 PM IST.\n• **Phone / WhatsApp**: +91 98404 18228.\n\nFor customers across Tamil Nadu, online orders are delivered to your doorstep within 2–3 business days via ST Courier.`,
      suggestions: ['🏢 Office Map & Contact', '📞 Call Office (+91 98404 18228)', '🛒 Buy Online for Home Delivery'],
      shouldEscalate: false,
    };
  }

  // ── 30. ST Courier Docket Tracking, Branch Contact & Delivery Executive ──────
  if (
    q.includes('delivery boy') ||
    q.includes('courier boy') ||
    q.includes('st courier contact') ||
    q.includes('courier phone') ||
    q.includes('branch number') ||
    q.includes('docket number') ||
    q.includes('st courier website')
  ) {
    return {
      answer: `🚚 **ST Courier Express Support & Branch Tracking**:\n\n• **Track on ST Courier Website**: Visit [stcourier.com](https://stcourier.com) and enter your AWB docket number.\n• **Delivery Executive Contact**: Once your parcel status changes to **"Out for Delivery"**, the local ST Courier delivery executive will call your mobile number before arrival.\n• **ST Courier Customer Helpline**: If you need local branch assistance, you can locate your nearest ST Courier branch at [stcourier.com/branches](https://stcourier.com/branches) or connect with our admin team.`,
      suggestions: ['🚚 Track My Order', '👨‍💼 Talk to Admin for Courier Help', '📞 Call Helpline'],
      shouldEscalate: false,
    };
  }

  // ── 31. Order Confirmation SMS & Email Receipt Missing ───────────────────────
  if (
    q.includes('sms not received') ||
    q.includes('confirmation message') ||
    q.includes('confirmation sms') ||
    q.includes('no message') ||
    q.includes('order message') ||
    q.includes('receipt mail') ||
    q.includes('sms varala')
  ) {
    return {
      answer: `📱 **Order Confirmation SMS & Updates**:\n\n• **Instant SMS**: As soon as your Razorpay payment completes, an automated SMS confirmation is sent to your mobile number.\n• **Didn't receive SMS?**: Check if DND (Do Not Disturb) is active on your phone number, or check the **Profile > Orders** page on our website.\n• **Docket SMS**: A second SMS with your ST Courier live tracking docket is sent as soon as your parcel is dispatched from Chennai!`,
      suggestions: ['🚚 Track My Order', '👨‍💼 Confirm Order with Admin', '📞 Call Helpline (+91 98404 18228)'],
      shouldEscalate: true,
    };
  }

  // ── 32. Account, Login, OTP, Password & Profile Help ─────────────────────────
  if (
    q.includes('login') ||
    q.includes('cant login') ||
    q.includes('otp') ||
    q.includes('otp not coming') ||
    q.includes('password') ||
    q.includes('forgot password') ||
    q.includes('register') ||
    q.includes('signup') ||
    q.includes('profile')
  ) {
    return {
      answer: `👤 **Account & Login Assistance**:\n\n• **Phone OTP Login**: Enter your 10-digit mobile number to receive an instant one-time password.\n• **Didn't get OTP?**: Please wait 30 seconds and click "Resend OTP", or ensure your mobile network has active signal.\n• **Guest Checkout**: You can also order directly by entering your delivery details at checkout without needing a pre-existing account!\n• **Order History**: Logging in with the same mobile number you used during checkout will automatically link all your previous orders.`,
      suggestions: ['🔐 Go to Login Page', '🛒 View Cart', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 33. Tamil / Tanglish Prompts Support ─────────────────────────────────────
  if (
    q.includes('velai') ||
    q.includes('vilai') ||
    q.includes('rate enna') ||
    q.includes('book eppo varum') ||
    q.includes('delivery charge evvalavu') ||
    q.includes('free delivery irukka') ||
    q.includes('enga irukku shop') ||
    q.includes('order epdi poduradhu') ||
    q.includes('evvalo naalaagum')
  ) {
    return {
      answer: `வணக்கம்! 🙏 **Blessing Power Guide** பற்றிய முக்கிய விவரங்கள்:\n\n• 📚 **10-ஆம் வகுப்பு சமச்சீர் கல்வி வழிகாட்டிகள்**: தமிழ், ஆங்கிலம், கணிதம், அறிவியல், சமூக அறிவியல்.\n• 🚚 **டெலிவரி விவரங்கள்**: 5 அல்லது அதற்கு மேற்பட்ட புத்தகங்கள் ஆர்டர் செய்தால் **முழுக்க முழுக்க இலவச டோர் டெலிவரி (Free Delivery)**!\n• ⏱️ **வந்து சேரும் காலம்**: ST Courier வழியாக 2 முதல் 3 நாட்களுக்குள் உங்கள் வீட்டிற்கே வந்து சேரும்.\n• 💳 **பணம் செலுத்துதல்**: Razorpay (GPay, PhonePe, Paytm, UPI, Card).\n• 🏢 **முகவரி**: Trust Square, அயனாவரம், சென்னை - 600012.\n• 📞 **உதவிக்கு**: +91 98404 18228.`,
      suggestions: ['📚 10th Full Set (இலவச டெலிவரி)', '🚚 Track Order', '👨‍💼 Talk to Admin', '📞 Call Office'],
      shouldEscalate: false,
    };
  }

  // ── 34. Strict Verified Fallback (No Guessing or Unverified Answers) ───────
  const greeting = userAccountName ? `Hello **${userAccountName}**! ` : 'Hello! ';

  if (accountOrders.length > 0) {
    const latest = accountOrders[0];
    const latestCode = latest.order_number || latest.id;
    const latestStatus = fulfillmentStatus(latest);
    return {
      answer: `${greeting}I only provide verified information for Blessing Power Guide.\n\n• 🚚 **Your Order #${latestCode}**: Status is **${latestStatus.toUpperCase()}**\n• 📚 **10th Class Guides & Prices**\n• 📦 **Shipping Rules** (4 books MOQ, 5+ books Free Delivery)\n• 🛡️ **100% Free Replacement** for damaged books\n\nFor any other questions, please connect directly with our admin team:`,
      suggestions: [`🚚 Track Order #${latestCode}`, '📚 10th Guides & Prices', '📦 Shipping & Delivery Rules', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      linkedOrderId: latestCode,
      cardType: 'order',
      linkedOrderData: {
        orderId: latestCode,
        status: latestStatus,
        totalAmount: Number(latest.total_amount || 0),
        trackingNumber: latest.awb_number,
        courierName: latest.courier_name || 'ST Courier Express',
        city: latest.city,
        pincode: latest.pincode,
        trackingUrl: latest.tracking_url || `/track?orderId=${encodeURIComponent(latestCode)}`,
      },
    };
  }

  return {
    answer: `${greeting}I only provide verified information for Blessing Power Guide:\n\n1. 🚚 **Where is my order?** (Live ST Courier tracking & order status)\n2. 📚 **10th Class Guides & Prices** (Tamil, English, Maths, Science & Social Science)\n3. 📦 **Order Rules** (Minimum 4 books MOQ, 100% Free delivery on 5+ books)\n4. 🛡️ **100% Free Replacement** for transit-damaged or misprinted books\n5. 💳 **Razorpay Online Payments** (UPI, GPay, PhonePe, Cards)\n6. 🏢 **Chennai Head Office**: Trust Square, Ayanavaram (+91 98404 18228)\n\nFor any other questions, please click **Talk to Admin** to chat directly with our staff:`,
    suggestions: ['🚚 Track My Order', '📚 10th Guides & Prices', '📦 Minimum Order & Delivery Fee', '👨‍💼 Talk to Admin'],
    shouldEscalate: false,
  };
}
