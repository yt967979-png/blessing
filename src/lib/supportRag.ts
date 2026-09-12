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
  };
}

const STORE_POLICIES = {
  moq: 4,
  shippingBelowMoqFee: 150, // Applied on exactly 4 books
  freeShippingQty: 5,       // Free shipping for 5+ books
  courier: 'ST Courier Express',
  turnaroundTN: '24 to 48 hours for Chennai, 2 to 3 business days across other Tamil Nadu districts',
  helpline: '+91 98404 18228',
  office: 'Trust Square, Ayanavaram, Chennai - 600012, Tamil Nadu',
  returnPolicy: 'We offer free replacement for misprinted or transit-damaged guides. Please share a photo or video with our team.',
  payments: 'Prepaid online via Razorpay (UPI, Google Pay, PhonePe, Paytm, Credit/Debit Cards, NetBanking). Cash on delivery is not supported.',
};

/**
 * Clean and extract potential order ID or phone number from prompt.
 */
function extractOrderRef(prompt: string): string | null {
  const bpgMatch = prompt.match(/\b(BPG-?\d{3,8})\b/i);
  if (bpgMatch) return bpgMatch[1].replace('-', '').toUpperCase().replace('BPG', 'BPG-');
  const numMatch = prompt.match(/#(\d{4,8})\b/);
  if (numMatch) return `BPG-${numMatch[1]}`;
  return null;
}

function extractPhone(prompt: string): string | null {
  const phoneMatch = prompt.match(/\b([6-9]\d{9})\b/);
  return phoneMatch ? phoneMatch[1] : null;
}

/**
 * Core RAG Generation: Resolves user intent against live database and store policies.
 */
export async function generateSupportRagAnswer(
  userPrompt: string,
  customerContext?: { phone?: string; customerId?: string; sessionOrder?: string }
): Promise<RagResponse> {
  const q = userPrompt.trim().toLowerCase();

  // 1. Explicit Human Escalation Request
  const humanEscalatePattern = /\b(admin|human|agent|person|manager|representative|customer care|call me|speak with someone|connect admin|talk to an? admin)\b/i;
  if (humanEscalatePattern.test(q)) {
    return {
      answer: 'I can connect you directly with our store support team right away. Click the button below to alert our active admins on duty.',
      suggestions: ['👨‍💼 Connect to Admin Now', '🚚 Track My Order', '📚 Browse Guides'],
      shouldEscalate: true,
    };
  }

  // 2. Order Tracking & Status Inquiries
  const orderRef = extractOrderRef(userPrompt) || customerContext?.sessionOrder;
  const phoneRef = extractPhone(userPrompt) || customerContext?.phone;

  const isOrderQuery =
    Boolean(orderRef) ||
    Boolean(phoneRef) ||
    q.includes('order') ||
    q.includes('track') ||
    q.includes('shipped') ||
    q.includes('where is') ||
    q.includes('dispatch') ||
    q.includes('status');

  if (isOrderQuery) {
    let orderRow: any = null;
    try {
      if (orderRef) {
        const res = await queryDb(
          `SELECT id, order_id, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at 
           FROM orders 
           WHERE order_id = $1 OR id = $1 
           LIMIT 1`,
          [orderRef]
        );
        orderRow = res.rows[0];
      } else if (phoneRef) {
        const res = await queryDb(
          `SELECT id, order_id, customer_name, customer_phone, city, pincode, total_amount, 
                  order_status, courier_status, awb_number, courier_name, is_official_awb, tracking_url, ordered_at 
           FROM orders 
           WHERE customer_phone = $1 OR customer_phone = $2
           ORDER BY ordered_at DESC 
           LIMIT 1`,
          [phoneRef, phoneRef.replace('+91', '')]
        );
        orderRow = res.rows[0];
      }
    } catch (_) {}

    if (orderRow) {
      const orderCode = orderRow.order_id || orderRow.id;
      const statusLabel = fulfillmentStatus(orderRow);
      const isCancelled = isRecordCancelled(orderRow);
      const awb = orderRow.awb_number;
      const hasAwb = Boolean(awb && !awb.startsWith('SHP-') && !awb.includes('Pending'));

      let statusDescription = `Your order #${orderCode} is currently **${statusLabel.toUpperCase()}**.`;
      if (isCancelled) {
        statusDescription = `Order #${orderCode} has been cancelled. Any refund is processed back to the original payment source.`;
      } else if (hasAwb) {
        statusDescription += `\n\n📦 **ST Courier Docket**: \`${awb}\`\n📍 Destination: ${orderRow.city || 'Tamil Nadu'} (${orderRow.pincode || '—'}).\n⏱ Expected Delivery: ${STORE_POLICIES.turnaroundTN}.`;
      } else {
        statusDescription += `\n\nOur packaging warehouse is preparing your guides. An ST Courier tracking docket will be assigned shortly and sent to your phone.`;
      }

      return {
        answer: statusDescription,
        suggestions: ['📍 View Live Tracking', '👨‍💼 Talk to Admin', '📚 Order More Books'],
        shouldEscalate: false,
        linkedOrderId: orderCode,
        linkedOrderData: {
          orderId: orderCode,
          status: statusLabel,
          totalAmount: Number(orderRow.total_amount || 0),
          trackingNumber: orderRow.awb_number,
          courierName: orderRow.courier_name || 'ST Courier',
          city: orderRow.city,
          pincode: orderRow.pincode,
        },
      };
    }

    if (!orderRef && !phoneRef) {
      return {
        answer: 'To check your real-time shipment status, please enter your **Order ID** (e.g. `BPG-00142`) or the **10-digit mobile number** used during checkout.',
        suggestions: ['👨‍💼 Talk to Admin', '📦 Track on Website', '📚 Catalog'],
        shouldEscalate: false,
      };
    }
  }

  // 3. Shipping & Pricing Policy Queries
  if (
    q.includes('shipping') ||
    q.includes('delivery charge') ||
    q.includes('charges') ||
    q.includes('free delivery') ||
    q.includes('minimum') ||
    q.includes('moq') ||
    q.includes('how many books')
  ) {
    return {
      answer: `Here are our store delivery & order rules:\n\n• **Minimum Order Quantity**: 4 books per order.\n• **Shipping Fee**: ₹${STORE_POLICIES.shippingBelowMoqFee} flat shipping for 4 books.\n• **FREE Shipping**: Order **5 or more books** to unlock 100% Free Doorstep Delivery!\n• **Courier Partner**: ${STORE_POLICIES.courier} (${STORE_POLICIES.turnaroundTN}).`,
      suggestions: ['📚 View 10th Full Set', '🚚 Check Delivery Days', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // 4. Books & Syllabus Inquiries (Dynamic catalog lookup)
  if (
    q.includes('book') ||
    q.includes('guide') ||
    q.includes('maths') ||
    q.includes('science') ||
    q.includes('tamil') ||
    q.includes('english') ||
    q.includes('social') ||
    q.includes('10th') ||
    q.includes('standard') ||
    q.includes('price') ||
    q.includes('sample') ||
    q.includes('pdf')
  ) {
    let sampleBooks: any[] = [];
    try {
      const res = await queryDb(
        `SELECT title, standard, subject, price, stock, sample_pdf_url 
         FROM books 
         WHERE status = 'published' 
         ORDER BY id ASC 
         LIMIT 4`
      );
      sampleBooks = res.rows;
    } catch (_) {}

    const bookListText = sampleBooks.length > 0
      ? sampleBooks.map((b) => `• **${b.title}**: ₹${b.price} (${b.stock > 0 ? '✓ In Stock' : 'Out of Stock'})`).join('\n')
      : '• **10th Tamil, English, Maths, Science & Social Science Guides** are updated for the 2026–2027 Tamil Nadu Board Syllabus.';

    return {
      answer: `We publish comprehensive, high-scoring school guides for Tamil Nadu state board students:\n\n${bookListText}\n\nAll guides include chapter summaries, book-back answers, PTA questions, and solved model exam papers. You can also view free sample chapter PDFs on each book's page!`,
      suggestions: ['🛒 View All Guides', '📄 Sample PDF Preview', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // 5. Payment & Cash on Delivery Inquiries
  if (q.includes('cod') || q.includes('cash on delivery') || q.includes('payment') || q.includes('pay')) {
    return {
      answer: `${STORE_POLICIES.payments}\n\nWe do **not** offer Cash on Delivery (COD) to prevent non-delivery of educational material. All online orders are safely secured with Razorpay instant invoice and SMS tracking.`,
      suggestions: ['💳 Payment Options', '📦 How to Order', '👨‍💼 Talk to Admin'],
      shouldEscalate: false,
    };
  }

  // 6. Return / Damaged / Replacement Queries
  if (q.includes('return') || q.includes('replace') || q.includes('damage') || q.includes('wrong book')) {
    return {
      answer: `${STORE_POLICIES.returnPolicy}\n\nIf you received a damaged package or incorrect book, our team will dispatch a fresh replacement copy immediately at no extra cost.`,
      suggestions: ['👨‍💼 Contact Admin for Replacement', '📞 Support Helpline', '🚚 Track Order'],
      shouldEscalate: true,
    };
  }

  // 7. General Fallback
  return {
    answer: `Hi! I am the **Blessing Power Guide AI Assistant** 🤖.\n\nI can help you with:\n1. 🚚 **Tracking your shipment** (ST Courier AWB & delivery time)\n2. 📚 **Guide availability, prices & 2026–2027 syllabus**\n3. 📦 **Shipping charges & minimum order rules**\n4. 👨‍💼 **Connecting you directly to our human support team**\n\nHow can I help you today?`,
    suggestions: ['🚚 Track My Order', '📚 View 10th Guides', '📦 Shipping Fee?', '👨‍💼 Talk to Admin'],
    shouldEscalate: false,
  };
}
