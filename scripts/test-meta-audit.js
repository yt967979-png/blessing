const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const remoteCmd = `
node -e '
const fs = require("fs");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const envContent = fs.readFileSync("/etc/blessing.env", "utf8");
const env = {};
for (const line of envContent.split("\\n")) {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.trim().startsWith("#")) {
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["'"'"']|["'"'"']$/g, "");
  }
}

const token = env.WHATSAPP_ACCESS_TOKEN;
const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
const appSecret = env.WHATSAPP_APP_SECRET;
const verifyToken = env.WHATSAPP_VERIFY_TOKEN || "blessing_power_guide_webhook_token";

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https:");
    const lib = isHttps ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log("==================================================");
  console.log("🔍 COMPREHENSIVE WHATSAPP META AUDIT & HARDENING");
  console.log("==================================================");

  // 1. TOKEN VALIDATION
  console.log("\\n--- 1. WHATSAPP_ACCESS_TOKEN ---");
  console.log("Token configured:", Boolean(token));
  console.log("Phone ID:", phoneId);
  
  // Inspect debug_token
  const debugRes = await request("https://graph.facebook.com/v21.0/debug_token?input_token=" + token + "&access_token=" + token);
  try {
    const d = JSON.parse(debugRes.body).data;
    console.log("Is Valid:", d.is_valid);
    console.log("Token Type:", d.type);
    console.log("Expires At:", d.expires_at === 0 ? "0 (Never / Permanent System User Token)" : d.expires_at);
    console.log("Data Access Expires At:", d.data_access_expires_at === 0 ? "0 (Never)" : d.data_access_expires_at);
    console.log("App ID:", d.app_id);
    console.log("Scopes:", (d.scopes || []).join(", "));
  } catch (e) {
    console.log("Debug Token Parse Error:", debugRes.body);
  }

  // Check Templates
  const tplRes = await request("https://graph.facebook.com/v21.0/" + phoneId + "/message_templates", {
    headers: { Authorization: "Bearer " + token }
  });
  try {
    const tplData = JSON.parse(tplRes.body);
    console.log("Approved Templates Count:", (tplData.data || []).length);
    if (tplData.data && tplData.data.length > 0) {
      console.log("Sample Templates:", tplData.data.map(t => t.name + " (" + t.status + ")").slice(0, 5).join(", "));
    }
  } catch (e) {}

  // 2. WEBHOOK GET HANDSHAKE
  console.log("\\n--- 2. WEBHOOK GET HANDSHAKE (Meta Verification) ---");
  // Test invalid token
  const getFail = await request("http://127.0.0.1:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_123");
  console.log("Invalid Verify Token HTTP Status:", getFail.statusCode, "(Expected: 403)");
  console.log("Invalid Verify Token Response Body:", getFail.body);

  // Test valid token
  const getPass = await request("http://127.0.0.1:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=" + encodeURIComponent(verifyToken) + "&hub.challenge=test_challenge_123");
  console.log("Valid Verify Token HTTP Status:", getPass.statusCode, "(Expected: 200)");
  console.log("Valid Verify Token Response Body:", getPass.body, "(Expected: test_challenge_123)");

  // 3. WEBHOOK POST SIGNATURE & SECURITY
  console.log("\\n--- 3. WEBHOOK POST SIGNATURE VERIFICATION ---");
  console.log("WHATSAPP_APP_SECRET in /etc/blessing.env:", appSecret ? "Present (Length: " + appSecret.length + ")" : "MISSING / EMPTY");

  // Let us inspect what the code does:
  // If appSecret is present:
  //   Calculates HMAC-SHA256 of rawBody
  //   Compares with timingSafeEqual
  //   Returns 401 if invalid or missing
  // If appSecret is missing:
  //   Logs warning in production and lets request through

  // 4. EVENT DEDUPLICATION TEST (Redis + Postgres)
  console.log("\\n--- 4. EVENT DEDUPLICATION (wamid test) ---");
  const testWamid = "wamid.test_audit_" + Date.now();
  const testPayload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "6382963350", phone_number_id: phoneId },
          contacts: [{ profile: { name: "Audit Tester" }, wa_id: "919999999999" }],
          messages: [{
            from: "919999999999",
            id: testWamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: "Audit Ping" }
          }]
        },
        field: "messages"
      }]
    }]
  });

  const post1 = await request("http://127.0.0.1:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, testPayload);
  console.log("First Delivery (New Event) Status:", post1.statusCode, post1.body);

  const post2 = await request("http://127.0.0.1:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, testPayload);
  console.log("Second Delivery (Duplicate Event) Status:", post2.statusCode, post2.body);

  // 5. CHECK POSTGRES DEDUP LEDGER
  console.log("\\n--- 5. POSTGRES DEDUP LEDGER VERIFICATION ---");
}

main().catch(console.error);
'
sudo -u postgres psql -d blessing -c "SELECT event_id, event_type, processed_at FROM whatsapp_processed_events ORDER BY processed_at DESC LIMIT 5;"
redis-cli keys "wa:event:*" | head -n 5
  `;

  conn.exec(remoteCmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
