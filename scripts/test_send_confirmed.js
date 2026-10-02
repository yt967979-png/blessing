const fs = require('fs');

const envContent = fs.readFileSync('/etc/blessing.env', 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    env[k] = v;
  }
});

async function testSend() {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;

  console.log('Testing Graph API with Phone ID:', phoneNumberId);
  console.log('Token exists:', Boolean(accessToken));

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '918248345770',
    type: 'text',
    text: {
      preview_url: true,
      body: `✅ *PAYMENT VERIFIED & ORDER CONFIRMED!*\n\nHello Yogesh! 🙏\nYour order has been safely placed with *Blessing Power Guide Chennai*.\n\n📋 *Order ID*: #BPG-SAOQLYGH\n📚 *Items*: 10th Std 5-in-1 Combo (x2)\n💰 *Amount Paid*: ₹2\n🚚 *Delivery*: 100% Free Doorstep Delivery via ST Courier\n\n📍 *Live Order Tracker*:\nhttps://blessingpowerguide.in/track?order=BPG-SAOQLYGH\n\n🌐 *Website Sync*: Log in with *yogesh234456@gmail.com* at https://blessingpowerguide.in/orders to view GST invoice & tracking.\n\n📦 We are currently packing your books in tamper-proof packaging. As soon as your parcel is handed to ST Courier Express, we will send your official tracking docket right here! 🚀`,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Result:', JSON.stringify(data, null, 2));
}

testSend().catch(console.error);
