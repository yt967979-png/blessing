import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  initWhatsAppInProcess,
  resetWhatsAppSession,
  ensureWhatsAppQr,
  getWhatsAppConnectionState,
} from '@/lib/whatsapp';
import { isBackgroundLeader, tryAcquireBackgroundLeader } from '@/lib/backgroundLeader';
import { verifyAdminRequest, verifySuperAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

function looksLikePairingCode(code: string | null | undefined): boolean {
  const c = String(code || '').replace(/\s/g, '');
  // Real WhatsApp pairing codes are 8 chars, often shown as ABCD-EFGH — never a 10–12 digit phone
  if (!c) return false;
  if (/^\d{10,15}$/.test(c.replace(/-/g, ''))) return false;
  const raw = c.replace(/-/g, '');
  return raw.length >= 8 && raw.length <= 10;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const refresh = searchParams.get('refresh') === '1';

  // Ensure this process can run Baileys (Free = single replica).
  // Cap wait — Postgres timeout must not stall QR for 20–30s.
  await Promise.race([
    tryAcquireBackgroundLeader(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  // Pairing code path — must NOT fall through to DB phone leftover
  if (phone) {
    if (!isBackgroundLeader()) {
      return NextResponse.json(
        {
          error:
            'WhatsApp engine is on another server replica. Wait 10s and try Get Code again, or open this tab and wait for QR.',
        },
        { status: 503 }
      );
    }
    let activeSock: any = null;
    try {
      activeSock = await initWhatsAppInProcess();
    } catch (err) {
      console.error('Failed in-process init in QR route:', err);
    }
    if (!activeSock) {
      return NextResponse.json(
        { error: 'WhatsApp engine starting… wait 5 seconds, then click Get Code again.' },
        { status: 503 }
      );
    }
    try {
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
      if (cleanPhone.length < 11) {
        return NextResponse.json(
          { error: 'Enter full WhatsApp number with country code (e.g. 91XXXXXXXXXX)' },
          { status: 400 }
        );
      }
      const code = await activeSock.requestPairingCode(cleanPhone);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      if (!looksLikePairingCode(formattedCode)) {
        return NextResponse.json(
          { error: 'Could not generate a valid pairing code. Use QR scan instead.' },
          { status: 500 }
        );
      }

      const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
      fs.writeFileSync(
        statusFile,
        JSON.stringify(
          {
            status: 'PAIRING_CODE_READY',
            connected: false,
            pairingCode: formattedCode,
            message: `Enter this code on your phone (Linked Devices → Link with phone number)`,
            timestamp: Date.now(),
          },
          null,
          2
        )
      );

      try {
        const db = await import('@/lib/db');
        const client = await db.getDbClient();
        if (client) {
          await client.query(
            `UPDATE whatsapp_sessions SET pairing_code = $1, status = 'PAIRING_CODE_READY', message = $2, updated_at = NOW() WHERE id = 'default'`,
            [formattedCode, `Pairing code ready for +${cleanPhone}`]
          );
          db.releaseDbClient(client);
        }
      } catch (_) {}

      return NextResponse.json({ success: true, pairingCode: formattedCode });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Failed to generate pairing code' }, { status: 500 });
    }
  }

  // Kick / wait for QR (forceFresh on refresh=1)
  const ensured = await ensureWhatsAppQr({ forceFresh: refresh });
  if (ensured.qrImage || ensured.connected) {
    return NextResponse.json({
      status: ensured.status,
      connected: ensured.connected,
      qrImage: ensured.qrImage,
      pairingCode: null,
      message: ensured.message,
      leader: isBackgroundLeader(),
    });
  }

  // Memory / file first (works when Postgres is timing out)
  const { getLatestQrMemory } = await import('@/lib/whatsapp');
  const memQr = getLatestQrMemory();
  if (memQr) {
    return NextResponse.json({
      status: 'QR_READY',
      connected: false,
      qrImage: memQr,
      pairingCode: null,
      message: 'Scan QR Code with WhatsApp phone to link',
      leader: isBackgroundLeader(),
    });
  }

  // Fall back to DB / file status (QR may have landed a moment later)
  try {
    const db = await import('@/lib/db');
    const client = await Promise.race([
      db.tryGetDbClient(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (client) {
      try {
        const res = await client.query(
          `SELECT status, connected, qr_image, pairing_code, message FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          const rawPair = row.pairing_code;
          const pairingCode = looksLikePairingCode(rawPair) ? rawPair : null;
          const linkedFromMsg = String(row.message || '').match(/\+(\d{10,15})/);
          return NextResponse.json({
            status: row.status || ensured.status,
            connected: row.connected,
            qrImage: row.qr_image || ensured.qrImage,
            pairingCode,
            linkedPhone: row.connected && linkedFromMsg ? linkedFromMsg[1] : null,
            message: row.message || ensured.message,
            leader: isBackgroundLeader(),
          });
        }
      } finally {
        db.releaseDbClient(client);
      }
    }
  } catch (_) {}

  const statusFile = path.join(process.cwd(), 'public', 'whatsapp_status.json');
  if (fs.existsSync(statusFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (!looksLikePairingCode(data.pairingCode)) data.pairingCode = null;
      data.leader = isBackgroundLeader();
      return NextResponse.json(data);
    } catch (e: any) {
      console.error('Error reading whatsapp_status.json:', e.message);
    }
  }

  const live = getWhatsAppConnectionState();
  return NextResponse.json({
    status: ensured.status || 'INITIALIZING',
    connected: live.connected,
    qrImage: null,
    pairingCode: null,
    message: ensured.message,
    leader: isBackgroundLeader(),
  });
}

export async function DELETE(request: Request) {
  const auth = await verifySuperAdminRequest(request);
  if (!auth.isSuperAdmin) return forbiddenResponse(auth.error || 'Super Admin privilege required to disconnect WhatsApp');

  await tryAcquireBackgroundLeader();
  await resetWhatsAppSession();

  // Kick a fresh QR on the leader
  if (isBackgroundLeader()) {
    setTimeout(() => {
      void ensureWhatsAppQr({ forceFresh: true });
    }, 500);
  }

  return NextResponse.json({
    success: true,
    message: 'Unlinked. A new QR will appear in a few seconds — stay on this tab.',
  });
}
