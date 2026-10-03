const crypto = require('crypto');

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const signatureHex = signatureHeader.slice('sha256='.length).trim();
  const hmac = crypto.createHmac('sha256', appSecret);
  const expectedHex = hmac.update(rawBody, 'utf8').digest('hex');

  try {
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Verification Test Suite
const testSecret = 'mock_meta_app_secret_12345';
const validPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: '123',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '1234567890', phone_number_id: '123' },
        contacts: [{ profile: { name: 'Test User' }, wa_id: '910000000000' }],
        messages: [{ from: '910000000000', id: 'wamid.TEST1', timestamp: '123', text: { body: 'Hi' }, type: 'text' }]
      },
      field: 'messages'
    }]
  }]
});

const validHmac = 'sha256=' + crypto.createHmac('sha256', testSecret).update(validPayload, 'utf8').digest('hex');
const invalidHmac = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
const tamperedPayload = validPayload.replace('"Hi"', '"Hacked"');

console.log('=== RUNNING WHATSAPP HMAC 4-POINT SECURITY AUDIT ===');

// Test 1: Valid signature
const test1 = verifyMetaSignature(validPayload, validHmac, testSecret);
console.log('1. Valid Signature Test:    ', test1 ? 'PASSED (Accepted)' : 'FAILED');

// Test 2: Missing signature
const test2 = verifyMetaSignature(validPayload, null, testSecret);
console.log('2. Missing Signature Test:  ', !test2 ? 'PASSED (Rejected - 401)' : 'FAILED');

// Test 3: Invalid signature
const test3 = verifyMetaSignature(validPayload, invalidHmac, testSecret);
console.log('3. Invalid Signature Test:  ', !test3 ? 'PASSED (Rejected - 401)' : 'FAILED');

// Test 4: Tampered payload
const test4 = verifyMetaSignature(tamperedPayload, validHmac, testSecret);
console.log('4. Tampered Payload Test:   ', !test4 ? 'PASSED (Rejected - 401)' : 'FAILED');

if (test1 && !test2 && !test3 && !test4) {
  console.log('\n>>> ALL 4 CRYPTOGRAPHIC HMAC CHECKS PASSED PERFECTLY <<<');
} else {
  console.error('\n>>> HMAC CRYPTOGRAPHIC CHECK FAILED <<<');
  process.exit(1);
}
