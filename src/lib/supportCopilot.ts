export interface AdminCopilotContext {
  customerName?: string;
  customerPhone?: string;
  order?: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    address: string;
    city: string;
    pincode: string;
    totalAmount: number;
    status: string;
    awbNumber?: string;
    courierName: string;
    items?: Array<{ title: string; qty: number }>;
  } | null;
}

/**
 * Smart Admin AI Copilot: Instant, factual, polite reply generator for support staff.
 * Uses 360° customer order & tracking context without hallucination. Zero external API cost.
 */
export function generateAdminCopilotDraft(customerMessage: string, context?: AdminCopilotContext): string {
  const q = String(customerMessage || '').toLowerCase().trim();
  const order = context?.order;
  const rawName = context?.customerName || order?.customerName || 'Customer';
  const name = rawName === 'Store Guest' || rawName === 'Student/Parent' ? 'Customer' : rawName.split(' ')[0];
  const orderId = order?.orderId;
  const city = order?.city;
  const awb = order?.awbNumber;
  const status = (order?.status || '').toUpperCase();

  // 1. Order Tracking & Delivery ETA
  if (
    q.includes('track') ||
    q.includes('where is') ||
    q.includes('order status') ||
    q.includes('innum varala') ||
    q.includes('varala') ||
    q.includes('eppo varum') ||
    q.includes('eppa varum') ||
    q.includes('delivery') ||
    q.includes('courier') ||
    q.includes('docket') ||
    q.includes('awb') ||
    q.includes('dispatch') ||
    q.includes('enga iruku')
  ) {
    if (orderId) {
      if (status === 'DELIVERED') {
        return `Hello ${name}, your order #${orderId} has already been marked as DELIVERED by ST Courier. Please check with your household/school and let us know if you received all copies safely!`;
      }
      if (awb) {
        return `Hello ${name}, your order #${orderId} was dispatched via ST Courier (Docket: ${awb}). It is currently ${status}${city ? ` en route to ${city}` : ''} and estimated to reach you within 24–48 hours. Track live here: https://blessingpowerguide.in/track?orderId=${encodeURIComponent(orderId)}`;
      }
      return `Hello ${name}, your order #${orderId} is currently ${status || 'PROCESSING'} at our Chennai publication center and scheduled for ST Courier pickup today. We will send an SMS with your live tracking docket the moment it is scanned!`;
    }
    return `Hello ${name}, could you please share your 10-digit mobile number or Order Number (e.g. #BPG-...) so I can check your live ST Courier tracking status right away?`;
  }

  // 2. Damaged Book / Misprinted / Torn Replacement
  if (
    q.includes('damage') ||
    q.includes('misprint') ||
    q.includes('torn') ||
    q.includes('page') ||
    q.includes('replace') ||
    q.includes('wrong book') ||
    q.includes('kizhinjirukku')
  ) {
    if (orderId) {
      return `Hello ${name}, we sincerely apologize for the inconvenience! Under our 100% Free Replacement Guarantee, we have approved a fresh replacement copy for Order #${orderId}. We are dispatching it via ST Courier today at zero extra charge. You do not need to pay anything!`;
    }
    return `Hello ${name}, we sincerely apologize! We offer a 100% Free Replacement Guarantee for all transit-damaged or misprinted books. Please upload a photo of the defect here or share your Order ID so our dispatch desk can send a fresh copy immediately.`;
  }

  // 3. Tax Invoice / Receipt Download
  if (q.includes('invoice') || q.includes('bill') || q.includes('receipt') || q.includes('tax')) {
    if (orderId) {
      return `Hello ${name}, here is your official GST Tax Invoice download link for Order #${orderId}: https://blessingpowerguide.in/api/orders/${encodeURIComponent(orderId)}/invoice`;
    }
    return `Hello ${name}, please share your Order Number (#BPG-...) and I will send your official GST Tax Invoice download link immediately.`;
  }

  // 4. Tamil / English Medium availability
  if (q.includes('tamil medium') || q.includes('english medium') || q.includes('medium') || q.includes('both')) {
    return `Hello ${name}, our Class 10 guides are available in both Tamil Medium (தமிழ் வழி) and English Medium editions, fully aligned with the 2026 Tamil Nadu Samacheer Kalvi syllabus. You can choose your medium on any book page or order our 5-in-1 Combo Box Set with 100% Free Doorstep Delivery!`;
  }

  // 5. Address / Phone correction before dispatch
  if (q.includes('address') || q.includes('phone') || q.includes('pincode') || q.includes('mathanum') || q.includes('change')) {
    if (orderId && status !== 'DISPATCHED' && status !== 'DELIVERED') {
      return `Hello ${name}, your order #${orderId} is currently being packed and has not yet left our Chennai packaging hub. Please reply with your updated delivery address and phone number, and I will update your shipping label immediately!`;
    }
    return `Hello ${name}, please provide your new delivery address, pincode, and mobile number so our team can update your shipping label before courier pickup.`;
  }

  // 6. Minimum Order Quantity (MOQ)
  if (
    q.includes('minimum') ||
    q.includes('moq') ||
    q.includes('quantity') ||
    q.includes('how many') ||
    q.includes('one book') ||
    q.includes('1 book') ||
    q.includes('single book') ||
    q.includes('ethana book') ||
    q.includes('oru book') ||
    q.includes('bulk')
  ) {
    return `Hello ${name}, our minimum order requirement is 4 individual books OR any 1 Combo Pack! Any 1 Combo Pack bundles all key subjects and automatically qualifies for 100% FREE Doorstep Delivery across Tamil Nadu via ST Courier. For 4 individual books, a ₹150 delivery charge applies, while ordering 5 or more books gives you 100% Free Delivery!`;
  }

  // 7. Booking / Coming Soon Status
  if (
    q.includes('coming soon') ||
    q.includes('booking') ||
    q.includes('book panna') ||
    q.includes('mudila') ||
    q.includes('cant book') ||
    q.includes('why coming soon') ||
    q.includes('preorder') ||
    q.includes('reserve')
  ) {
    return `Hello ${name}, guides marked as "Coming Soon" are currently undergoing our editorial board's 2026 Samacheer Kalvi syllabus verification or are in active print at our Chennai packaging hub. Pre-orders and instant checkout will open very shortly. If you'd like us to reserve a copy for you, please reply with your subject and medium!`;
  }

  // 8. Prices, Costs & Discounts
  if (
    q.includes('price') ||
    q.includes('cost') ||
    q.includes('rate') ||
    q.includes('vilai') ||
    q.includes('evlo') ||
    q.includes('discount') ||
    q.includes('offer') ||
    q.includes('combo')
  ) {
    return `Hello ${name}, our complete Class 10 5-in-1 Combo Box Set (Tamil, English, Maths, Science & Social Science) is available at a special discounted package price of ₹1,300 (MRP ₹1,650) with 100% Free Doorstep Delivery via ST Courier!`;
  }

  // 9. Shipping Charges & Free Delivery
  if (
    q.includes('shipping') ||
    q.includes('delivery charge') ||
    q.includes('free delivery') ||
    q.includes('postage') ||
    q.includes('courier charge') ||
    q.includes('how many days') ||
    q.includes('ethana naal')
  ) {
    return `Hello ${name}, shipping is 100% FREE on any 5 or more books or any Combo Box Set! For smaller orders of 4 books, a subsidized ₹150 courier charge applies. We dispatch daily via ST Courier from Chennai, reaching within 24–48 hours for Chennai/suburbs, and 2–3 business days across other Tamil Nadu districts.`;
  }

  // 10. Syllabus & Edition Verification
  if (
    q.includes('syllabus') ||
    q.includes('samacheer') ||
    q.includes('edition') ||
    q.includes('new syllabus') ||
    q.includes('2026') ||
    q.includes('exam')
  ) {
    return `Hello ${name}, all Blessing Power Guide editions are 100% aligned with the latest Tamil Nadu State Board (Samacheer Kalvi) syllabus for Class 10 (SSLC). They include chapter summaries, textbook question-and-answers, creative one-marks, and previous years' public exam question papers.`;
  }

  // 11. COD Inquiry
  if (q.includes('cod') || q.includes('cash on delivery')) {
    return `Hello ${name}, we accept safe prepaid online payments via UPI (GPay, PhonePe, Paytm, BHIM), Cards, and NetBanking via Razorpay. We do not support COD to ensure educational textbooks remain safely moisture-sealed and tracked directly via ST Courier.`;
  }

  // 12. Context-Aware Fallback (Answers when customer message is provided)
  if (q.length > 5) {
    return `Hello ${name}, thank you for your query regarding "${customerMessage}". At Blessing Power Guide, we offer Class 10 Tamil & English medium guides with fast ST Courier delivery across Tamil Nadu. How may I best assist you with this right now?`;
  }

  if (orderId) {
    return `Hello ${name}, thank you for reaching out to Blessing Power Guide regarding Order #${orderId} (${order?.items?.length || 1} guide${(order?.items?.length || 1) !== 1 ? 's' : ''}). How can I assist you with your books today?`;
  }

  return `Hello ${name}! Thank you for reaching out to Blessing Power Guide. I am here to help you with guide book details, syllabus questions, or ST Courier delivery tracking. How may I assist you today?`;
}
