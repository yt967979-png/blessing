const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established to VPS.');

  const remoteScript = `
node -e '
const fs = require("fs");
const https = require("https");

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.status, ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, ok: false, raw: data });
        }
      });
    }).on("error", reject);
  });
}

async function run() {
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
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN;

  console.log("=== 1. WHATSAPP ENVIRONMENT CONFIGURATION ===");
  console.log("WHATSAPP_PHONE_NUMBER_ID configured:", Boolean(phoneId), phoneId ? phoneId.slice(0, 4) + "..." : "none");
  console.log("WHATSAPP_ACCESS_TOKEN configured:", Boolean(token), token ? "Length: " + token.length : "none");
  console.log("WHATSAPP_APP_SECRET configured:", Boolean(appSecret), appSecret ? "Length: " + appSecret.length : "none");
  console.log("WHATSAPP_VERIFY_TOKEN configured:", Boolean(verifyToken));

  console.log("\\n=== 2. META GRAPH API TOKEN VALIDATION ===");
  // Query phone number details using Bearer token
  const phoneRes = await fetchJson("https://graph.facebook.com/v21.0/" + phoneId, {
    Authorization: "Bearer " + token
  });
  console.log("Graph API Phone Details Query Status:", phoneRes.status || (phoneRes.data && phoneRes.data.error ? "Error" : "OK"));
  if (phoneRes.data) {
    if (phoneRes.data.error) {
      console.log("Graph API Error:", phoneRes.data.error.message, "Code:", phoneRes.data.error.code);
    } else {
      console.log("Verified Name:", phoneRes.data.verified_name);
      console.log("Display Phone:", phoneRes.data.display_phone_number);
      console.log("Quality Rating:", phoneRes.data.quality_rating);
      console.log("Code Verification Status:", phoneRes.data.code_verification_status);
    }
  }

  // Query token debug / me info
  const meRes = await fetchJson("https://graph.facebook.com/v21.0/debug_token?input_token=" + token + "&access_token=" + token, {});
  if (meRes.data && meRes.data.data) {
    const d = meRes.data.data;
    console.log("\\n=== 3. META TOKEN INTROSPECTION (/debug_token) ===");
    console.log("Is Valid:", d.is_valid);
    console.log("Token Type:", d.type);
    console.log("Expires At:", d.expires_at === 0 ? "0 (Never / Permanent Token)" : new Date(d.expires_at * 1000).toISOString());
    console.log("Data Access Expires At:", d.data_access_expires_at === 0 ? "Never" : new Date(d.data_access_expires_at * 1000).toISOString());
    console.log("App ID:", d.app_id);
    console.log("Granular Scopes / Scopes:", (d.scopes || []).join(", "));
  } else {
    // Try /v21.0/me
    const meDirect = await fetchJson("https://graph.facebook.com/v21.0/me?fields=id,name", {
      Authorization: "Bearer " + token
    });
    console.log("Direct /me Response:", JSON.stringify(meDirect.data || meDirect));
  }
}

run().catch(console.error);
'
  `;

  conn.exec(remoteScript, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d)).on('close', () => conn.end());
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
