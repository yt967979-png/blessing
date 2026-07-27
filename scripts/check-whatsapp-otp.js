/**
 * Quick WhatsApp OTP health check.
 * Usage: node scripts/check-whatsapp-otp.js
 */
const http = require('http');

const PORT = process.env.WHATSAPP_PORT || 4000;

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('── WhatsApp OTP Health Check ──\n');

  // 1. Sidecar service
  try {
    const r = await get(`http://127.0.0.1:${PORT}/status`);
    console.log(`✅ Sidecar (port ${PORT}):`, r.body);
  } catch (e) {
    console.log(`❌ Sidecar not running on port ${PORT}: ${e.message}`);
    console.log('   Start with: npm run whatsapp');
  }

  // 2. Next.js QR status (if app is running)
  try {
    const r = await get('http://127.0.0.1:3000/api/whatsapp/qr');
    console.log('✅ Next.js WhatsApp API:', {
      status: r.body.status,
      connected: r.body.connected,
      message: r.body.message,
    });
    if (!r.body.connected) {
      console.log('\n⚠️  WhatsApp is NOT connected.');
      console.log('   Fix: Open /admin → WhatsApp tab → Scan QR or enter pairing code.');
      console.log('   Until connected, OTP will try email fallback (needs GMAIL_* env).');
    } else {
      console.log('\n✅ WhatsApp connected — OTP via WhatsApp should work.');
    }
  } catch (e) {
    console.log(`❌ Next.js app not reachable on :3000: ${e.message}`);
    console.log('   Start with: npm run dev');
  }

  console.log('\n── OTP Flow ──');
  console.log('1. npm run whatsapp   (or scan QR in Admin)');
  console.log('2. npm run dev');
  console.log('3. Register with email + phone → OTP sent to WhatsApp');
  console.log('4. If WA fails → email OTP if GMAIL_USER + GMAIL_APP_PASSWORD set');
}

main();
