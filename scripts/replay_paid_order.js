const crypto = require('crypto');

const secret = 'blessing_secret_2026';
const payload = JSON.stringify({
  entity: 'event',
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_TiywY5LhsHuW2G',
        amount: 200,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_Tiyw0nFJjtpRxp',
        payment_link_id: 'plink_TiyvwjfBQOOBWl',
        notes: {
          order_source: 'whatsapp',
          whatsapp_phone: '918248345770',
          session_id: 'chk-wa-1790931462884',
        },
      },
    },
  },
});

const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

fetch('http://localhost:3000/api/webhooks/razorpay', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-razorpay-signature': sig,
  },
  body: payload,
})
  .then(async (r) => {
    console.log('Response Status:', r.status);
    console.log('Response Body:', await r.text());
  })
  .catch(console.error);
