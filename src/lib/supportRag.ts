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
  syllabus: '100% aligned with the latest Tamil Nadu State Board (Samacheer Kalvi) syllabus for Class 10 (SSLC). Includes textbook solutions, PTA model questions, and solved previous public exam papers.',
};

/**
 * Clean and extract potential order ID, phone number, or AWB docket from prompt.
 */
function extractOrderRef(prompt: string): string | null {
  const bpgMatch = prompt.match(/\b(BPG-?\d{3,8})\b/i);
  if (bpgMatch) return bpgMatch[1].replace('-', '').toUpperCase().replace('BPG', 'BPG-');
  const numMatch = prompt.match(/#(\d{4,8})\b/);
  if (numMatch) return `BPG-${numMatch[1]}`;
  const pureDigits = prompt.match(/\b(\d{4,6})\b/);
  if (pureDigits && !prompt.match(/\b([6-9]\d{9})\b/)) {
    // Potential pure order number like 1048
    return `BPG-${pureDigits[1]}`;
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

/**
 * Core RAG Generation: Resolves user intent against live PostgreSQL database and verified store knowledge.
 */
export async function generateSupportRagAnswer(
  userPrompt: string,
  customerContext?: { phone?: string; customerId?: string; sessionOrder?: string }
): Promise<RagResponse> {
  const q = userPrompt.trim().toLowerCase();

  // ── 1. Explicit Human Escalation Request ────────────────────────────────────
  const humanEscalatePattern = /\b(admin|human|agent|person|manager|representative|customer care|call me|speak with someone|connect admin|talk to an? admin|talk to support|need real person|pesa mudiyuma|staff)\b/i;
  if (humanEscalatePattern.test(q)) {
    return {
      answer: 'I am connecting you directly with our Chennai head office support team right now. An administrator has been alerted with an audible chime and will accept your chat momentarily.\n\nOur team is available **Monday to Saturday, 9:00 AM – 8:00 PM IST**.',
      suggestions: ['👨‍💼 Connect to Admin Now', '🚚 Track My Order', '📚 Browse 10th Guides', '📞 Call Office (+91 98404 18228)'],
      shouldEscalate: true,
      cardType: 'contact',
    };
  }

  // ── 2. Order Tracking & Live Delivery Status Inquiries (Live DB Resolution) ──
  const orderRef = extractOrderRef(userPrompt) || customerContext?.sessionOrder;
  const phoneRef = extractPhone(userPrompt) || customerContext?.phone;
  const awbRef = extractAwb(userPrompt);

  const isOrderQuery =
    Boolean(orderRef) ||
    Boolean(phoneRef) ||
    Boolean(awbRef) ||
    q.includes('order') ||
    q.includes('track') ||
    q.includes('shipped') ||
    q.includes('where is') ||
    q.includes('dispatch') ||
    q.includes('awb') ||
    q.includes('docket') ||
    q.includes('status') ||
    q.includes('delivery') ||
    q.includes('courier') ||
    q.includes('reach') ||
    q.includes('arrive') ||
    q.includes('when will i get') ||
    q.includes('st courier') ||
    q.includes('ennoda order') ||
    q.includes('order eppo varum') ||
    q.includes('parcel');

  if (isOrderQuery) {
    let orderRow: any = null;
    let orderItems: any[] = [];
    try {
      if (orderRef) {
        const res = await queryDb(
          `SELECT id, order_number, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at, shipping_address 
           FROM orders 
           WHERE order_number = $1 OR id = $1 OR UPPER(order_number) = $1 OR UPPER(id) = $1
           LIMIT 1`,
          [orderRef]
        );
        orderRow = res.rows[0];
      } else if (awbRef) {
        const res = await queryDb(
          `SELECT id, order_number, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at, shipping_address 
           FROM orders 
           WHERE awb_number = $1 OR shipment_id = $1
           LIMIT 1`,
          [awbRef]
        );
        orderRow = res.rows[0];
      } else if (phoneRef) {
        const cleanPhone = phoneRef.replace(/\D/g, '').slice(-10);
        const res = await queryDb(
          `SELECT id, order_number, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at, shipping_address 
           FROM orders 
           WHERE customer_phone LIKE $1 
           ORDER BY ordered_at DESC 
           LIMIT 1`,
          [`%${cleanPhone}`]
        );
        orderRow = res.rows[0];
      } else if (customerContext?.customerId) {
        const res = await queryDb(
          `SELECT id, order_number, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at, shipping_address 
           FROM orders 
           WHERE user_id = $1 
           ORDER BY ordered_at DESC 
           LIMIT 1`,
          [customerContext.customerId]
        );
        orderRow = res.rows[0];
      }

      if (orderRow) {
        const itemsRes = await queryDb(
          `SELECT book_title, quantity, book_price FROM order_items WHERE order_id = $1`,
          [orderRow.id]
        );
        orderItems = itemsRes.rows;
      }
    } catch (_) {}

    if (orderRow) {
      const orderCode = orderRow.order_number || orderRow.id;
      const statusLabel = fulfillmentStatus(orderRow);
      const isCancelled = isRecordCancelled(orderRow);
      const awb = orderRow.awb_number;
      const hasAwb = Boolean(awb && !awb.startsWith('SHP-') && !awb.includes('Pending'));

      let statusDescription = `📦 **Order Details for #${orderCode}**:\n\n• **Current Status**: **${statusLabel.toUpperCase()}**\n• **Customer**: ${orderRow.customer_name || 'Valued Customer'}\n• **Destination**: ${orderRow.city || 'Tamil Nadu'}${orderRow.pincode ? ` (${orderRow.pincode})` : ''}\n• **Total Paid**: ₹${orderRow.total_amount} (Prepaid via Razorpay)\n\n`;

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

      return {
        answer: statusDescription,
        suggestions: ['📍 View Live Tracking', '📄 Download Tax Invoice', '🔄 Report Damaged Book', '👨‍💼 Talk to Admin', '📦 Order More Books'],
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

    if (!orderRef && !phoneRef && !awbRef) {
      return {
        answer: 'To check your live delivery status and ST Courier tracking docket, please provide:\n\n1. Your **Order ID** (e.g. `BPG-1048` or `#1048`)\n2. Or the **10-digit mobile number** used during checkout\n3. Or your **ST Courier AWB number**\n\nYou can also find your order number in the instant SMS sent after your Razorpay payment.',
        suggestions: ['🚚 Where is my order?', '👨‍💼 Talk to Admin', '📚 Browse 10th Guides', '📞 Call Helpline'],
        shouldEscalate: false,
      };
    }
  }

  // ── 3. Minimum Order Quantity (MOQ) Queries ─────────────────────────────────
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

  // ── 4. Shipping Charges & Free Delivery Offer ───────────────────────────────
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

  // ── 5. Delivery Timelines & Coverage Districts ──────────────────────────────
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

  // ── 6. Books, Class 10th Subjects, Syllabus & Prices (Dynamic DB Query) ────
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
      answer: `📚 **Tamil Nadu Class 10 (SSLC) Samacheer Kalvi Guides (2026–2027 Edition)**:\n\n${bookListText}\n\n**Key Features in Every Blessing Power Guide**:\n• 100% textbook book-back solved exercises\n• Government PTA (Parent-Teacher Association) model question banks\n• Chapter-wise 1-mark objective questions with complete step-by-step reasoning\n• Solved previous years' public board examination papers\n• Free sample chapter PDFs available on every book page!`,
      suggestions: ['🛒 View 10th Full Set (5 Books - Free Delivery)', '📄 Download Sample PDF', '🚚 Check Delivery Timelines', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
      cardType: 'books',
      cardData: sampleBooks,
    };
  }

  // ── 7. Sample PDFs & Book Preview ───────────────────────────────────────────
  if (q.includes('sample') || q.includes('pdf') || q.includes('preview') || q.includes('inside book') || q.includes('demo') || q.includes('view page')) {
    return {
      answer: `📄 **Download Free Sample Chapter PDFs**:\n\nYou can preview sample chapter pages, typography, question patterns, and solved exercises for all 10th standard guides directly on each book page on our website!\n\nEvery guide includes:\n1. Unit summaries\n2. 1-mark objective questions\n3. 2-mark & 5-mark structured answers\n4. Public exam model questions`,
      suggestions: ['📚 Browse 10th Guides', '🛒 Buy 10th Full Set', '🚚 Check Delivery Days', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 8. Payment Methods, Razorpay & Cash on Delivery (COD) ───────────────────
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

  // ── 9. Return, Damaged, Torn or Misprinted Replacement Guarantee ─────────────
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

  // ── 10. Address, Phone Number or Pincode Correction ─────────────────────────
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

  // ── 11. Order Cancellation & Refund ─────────────────────────────────────────
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

  // ── 12. Office Location, Timings & Contact Info ─────────────────────────────
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

  // ── 13. School / Institutional Bulk Orders & Teacher Discounts ──────────────
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

  // ── 14. Exam Preparation & Public Exam Board Syllabus ───────────────────────
  if (
    q.includes('exam') ||
    q.includes('centum') ||
    q.includes('board exam') ||
    q.includes('public exam') ||
    q.includes('question paper') ||
    q.includes('study material') ||
    q.includes('is it good')
  ) {
    return {
      answer: `🎯 **Designed for Centum Scores in Tamil Nadu Class 10 Board Exams**:\n\nBlessing Power Guides are authored by veteran Tamil Nadu educators and specifically designed to turn average marks into Centum (100/100):\n\n• **100% Book-Back Solved**: Every exercise, diagram, theorem, and grammar rule completely explained.\n• **Government PTA Model Papers**: Complete solutions for all official PTA sets.\n• **High-Yield 1-Mark Objective Banks**: Full step-by-step reasoning for all objective questions.\n• **Solved Public Exam Papers**: Real public exam question patterns from recent years.`,
      suggestions: ['📚 View 10th Full Set (5 Books - Free Delivery)', '📄 Download Sample PDF', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 15. Other Classes / Standards (11th, 12th, 9th) ──────────────────────────
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
      answer: `Currently, Blessing Power Guide specializes exclusively in **Tamil Nadu Class 10 (SSLC) Samacheer Kalvi** to deliver the absolute highest quality and top-scoring results for board exams.\n\nHigher secondary editions (Class 11 & 12) are currently in editorial review and will be announced soon!`,
      suggestions: ['📚 View 10th Guides', '🛒 10th Full Set Combo', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // ── 16. Dynamic FAQ Table Search in Database ────────────────────────────────
  try {
    const faqSearchWords = q.split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
    if (faqSearchWords.length > 0) {
      const condition = faqSearchWords.map((_, idx) => `(LOWER(question) LIKE $${idx + 1} OR LOWER(answer) LIKE $${idx + 1})`).join(' OR ');
      const params = faqSearchWords.map((w) => `%${w}%`);
      const faqRes = await queryDb(
        `SELECT question, answer FROM faqs WHERE status = 'active' AND (${condition}) LIMIT 1`,
        params
      );
      if (faqRes.rows.length > 0) {
        const found = faqRes.rows[0];
        return {
          answer: `💡 **${found.question}**\n\n${found.answer}`,
          suggestions: ['🚚 Track My Order', '📚 10th Standard Guides', '📦 Shipping Charges?', '👨‍💼 Talk to Admin'],
          shouldEscalate: false,
        };
      }
    }
  } catch (_) {}

  // ── 17. Welcoming & General Intelligent Fallback ────────────────────────────
  return {
    answer: `Hello! I am the **Blessing Power Guide AI Assistant** 🤖.\n\nI can assist you immediately with:\n1. 🚚 **Live Shipment Tracking** (ST Courier docket & estimated arrival)\n2. 📚 **10th Class Guides & Prices** (Tamil, English, Maths, Science & Social)\n3. 📦 **Order Rules** (Minimum 4 books MOQ, 100% Free delivery on 5+ books)\n4. 🛡️ **100% Free Replacement** for damaged or misprinted books\n5. 💳 **Razorpay Online Payments** (UPI, GPay, PhonePe, Cards)\n6. 👨‍💼 **Instant connection to our Chennai office support team**\n\nClick any topic below or type your question:`,
    suggestions: ['🚚 Track My Order', '📦 Minimum Order & Delivery Fee', '📚 10th Guides & Prices', '🔄 Damaged Book Replacement', '👨‍💼 Talk to Admin'],
    shouldEscalate: false,
  };
}
