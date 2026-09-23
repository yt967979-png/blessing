/**
 * Phase 14: File Upload Security Adversarial Test Harness
 * Tests file type validation, magic byte sniffing, SVG XSS rejection, path traversal neutrality,
 * and role-based upload permissions.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 5 });

let SESSION_SECRET = process.env.SESSION_SECRET || 'bpg-dev-session-secret-change-in-production';
if (fs.existsSync('/etc/blessing.env')) {
  try {
    const env = fs.readFileSync('/etc/blessing.env', 'utf8');
    for (const line of env.split('\n')) {
      if (line.startsWith('SESSION_SECRET=')) {
        SESSION_SECRET = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {}
}

function makeToken(secret, payload) {
  const pStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(pStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: pStr, s: sig })).toString('base64url');
}

function buildMultipartBody(boundary, fields, files) {
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${val}\r\n`
    ));
  }

  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`
    ));
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function requestMultipart(path, boundary, bodyBuffer, options = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const headers = {
      'User-Agent': 'UploadSecurityTester/1.0',
      'Accept': 'application/json,*/*',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length,
      'Origin': BASE_URL,
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_upload_123'}`;
    }

    const req = client.request(url, {
      method: 'POST',
      headers,
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json,
        });
      });
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'Timeout' }); });

    req.write(bodyBuffer);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🛡️  PHASE 14: FILE UPLOAD SECURITY ADVERSARIAL MATRIX');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  const now = Date.now();
  const adminId = `usr_up_admin_${now}`;
  const customerId = `usr_up_cust_${now}`;
  const devId = `dev_up_${now}`;
  const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';

  let uploadedFileUrl = null;

  try {
    // 0. Setup Users
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES
      ($1, 'Upload Admin', $2, '9999888801', $4, 'admin', 'active'),
      ($3, 'Upload Cust', $5, '9999888802', $4, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [adminId, `admin_up_${now}@test.com`, customerId, dummyHash, `cust_up_${now}@test.com`]);

    const adminToken = makeToken(SESSION_SECRET, { userId: adminId, role: 'admin', exp: now + 86400000, did: devId });
    const custToken = makeToken(SESSION_SECRET, { userId: customerId, role: 'customer', exp: now + 86400000, did: devId });

    // Minimal valid 1x1 PNG image buffer
    const validPngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d450000000049454e44ae426082',
      'hex'
    );

    // ── TEST 1: Unauthenticated upload to catalog ─────────────────────────────
    const b1 = '----Boundary' + Math.random().toString(16);
    const body1 = buildMultipartBody(b1, { folder: 'catalog' }, [
      { field: 'file', filename: 'test.png', contentType: 'image/png', data: validPngBuffer }
    ]);
    const res1 = await requestMultipart('/api/upload', b1, body1);
    record('UPLOAD-01', 'Unauthenticated upload to catalog blocked (401)', res1.status === 401,
      `Status: ${res1.status}`);

    // ── TEST 2: Customer token upload to catalog blocked ──────────────────────
    const b2 = '----Boundary' + Math.random().toString(16);
    const body2 = buildMultipartBody(b2, { folder: 'catalog' }, [
      { field: 'file', filename: 'test.png', contentType: 'image/png', data: validPngBuffer }
    ]);
    const res2 = await requestMultipart('/api/upload', b2, body2, { token: custToken, deviceId: devId });
    record('UPLOAD-02', 'Customer upload to catalog blocked (401/403)', res2.status === 401 || res2.status === 403,
      `Status: ${res2.status}`);

    // ── TEST 3: Customer uploading PDF to reviews blocked ─────────────────────
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%...\n%%EOF');
    const b3 = '----Boundary' + Math.random().toString(16);
    const body3 = buildMultipartBody(b3, { folder: 'reviews' }, [
      { field: 'file', filename: 'book.pdf', contentType: 'application/pdf', data: validPdfBuffer }
    ]);
    const res3 = await requestMultipart('/api/upload', b3, body3, { token: custToken, deviceId: devId });
    record('UPLOAD-03', 'Customer uploading PDF to reviews blocked (400/401)', res3.status === 400 || res3.status === 401,
      `Status: ${res3.status}`);

    // ── TEST 4: PHP webshell upload attempt ────────────────────────────────────
    const phpPayload = Buffer.from('<?php system($_GET["cmd"]); ?>');
    const b4 = '----Boundary' + Math.random().toString(16);
    const body4 = buildMultipartBody(b4, { folder: 'reviews' }, [
      { field: 'file', filename: 'shell.php', contentType: 'application/x-php', data: phpPayload }
    ]);
    const res4 = await requestMultipart('/api/upload', b4, body4, { token: custToken, deviceId: devId });
    record('UPLOAD-04', 'PHP script upload blocked by magic bytes inspection (400)', res4.status === 400,
      `Status: ${res4.status}, Error: ${res4.json?.error}`);

    // ── TEST 5: SVG XSS file blocked ──────────────────────────────────────────
    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>');
    const b5 = '----Boundary' + Math.random().toString(16);
    const body5 = buildMultipartBody(b5, { folder: 'reviews' }, [
      { field: 'file', filename: 'xss.svg', contentType: 'image/svg+xml', data: svgPayload }
    ]);
    const res5 = await requestMultipart('/api/upload', b5, body5, { token: custToken, deviceId: devId });
    record('UPLOAD-05', 'SVG XSS file upload strictly rejected (400)', res5.status === 400,
      `Status: ${res5.status}, Error: ${res5.json?.error}`);

    // ── TEST 6: Path traversal in filename neutralized ────────────────────────
    const b6 = '----Boundary' + Math.random().toString(16);
    const body6 = buildMultipartBody(b6, { folder: 'reviews' }, [
      { field: 'file', filename: '../../../../tmp/evil.png', contentType: 'image/png', data: validPngBuffer }
    ]);
    const res6 = await requestMultipart('/api/upload', b6, body6, { token: custToken, deviceId: devId });
    const returnedUrl = res6.json?.url || '';
    const safePath = returnedUrl.startsWith('/uploads/reviews/img-') && !returnedUrl.includes('..') && !returnedUrl.includes('tmp');
    record('UPLOAD-06', 'Path traversal in filename completely neutralized by server-generated name',
      res6.status === 200 && safePath, `Status: ${res6.status}, Sanitized URL: ${returnedUrl}`);

    if (returnedUrl) {
      uploadedFileUrl = returnedUrl;
    }

    // ── TEST 7: Executable PE (MZ header) binary rejected ─────────────────────
    const peBinary = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(100)]);
    const b7 = '----Boundary' + Math.random().toString(16);
    const body7 = buildMultipartBody(b7, { folder: 'reviews' }, [
      { field: 'file', filename: 'trojan.exe', contentType: 'application/octet-stream', data: peBinary }
    ]);
    const res7 = await requestMultipart('/api/upload', b7, body7, { token: custToken, deviceId: devId });
    record('UPLOAD-07', 'Executable Windows/Linux binary rejected (400)', res7.status === 400,
      `Status: ${res7.status}, Error: ${res7.json?.error}`);

    // ── TEST 8: Valid review PNG upload by customer succeeds ───────────────────
    const b8 = '----Boundary' + Math.random().toString(16);
    const body8 = buildMultipartBody(b8, { folder: 'reviews' }, [
      { field: 'file', filename: 'review_proof.png', contentType: 'image/png', data: validPngBuffer }
    ]);
    const res8 = await requestMultipart('/api/upload', b8, body8, { token: custToken, deviceId: devId });
    const res8Ok = res8.status === 200 && res8.json?.url?.startsWith('/uploads/reviews/');
    record('UPLOAD-08', 'Legitimate PNG upload to reviews succeeds with safe relative path', res8Ok,
      `Status: ${res8.status}, URL: ${res8.json?.url}`);

    if (res8.json?.url) {
      // Clean up uploaded file from disk if local
      const localRelPath = res8.json.url.replace(/^\//, '');
      const fullPath = `/opt/blessing/public/${localRelPath}`;
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (_) {}
    }

  } finally {
    if (uploadedFileUrl) {
      const p = `/opt/blessing/public/${uploadedFileUrl.replace(/^\//, '')}`;
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
    }
    await client.query('DELETE FROM users WHERE id IN ($1, $2)', [adminId, customerId]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 14 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
