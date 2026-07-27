import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { isBackgroundLeader } from '@/lib/backgroundLeader';
import { resolveTunedNumber, shouldRunBackgroundTask } from '@/lib/runtimeProfile';

const SESSION_DIR = path.join(process.cwd(), 'whatsapp_session');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

let sock: any = null;
let isConnected = false;
let isInitializing = false;

async function updateSessionStatus(data: { status: string; connected: boolean; qrImage?: string | null; message: string }) {
  try {
    fs.writeFileSync(path.join(PUBLIC_DIR, 'whatsapp_status.json'), JSON.stringify({ ...data, timestamp: Date.now() }, null, 2));
    const client = await getDbClient();
    if (client) {
      await client.query(
        `INSERT INTO whatsapp_sessions (id, status, connected, qr_image, message, updated_at)
         VALUES ('default', $1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE 
         SET status = EXCLUDED.status,
             connected = EXCLUDED.connected,
             qr_image = EXCLUDED.qr_image,
             message = EXCLUDED.message,
             updated_at = NOW()`,
        [data.status, data.connected, data.qrImage || null, data.message]
      );
      await client.end();
    }
  } catch (_) {}
}

async function backupSessionToDb() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return;
    const files = fs.readdirSync(SESSION_DIR);
    const sessionMap: Record<string, string> = {};
    for (const f of files) {
      if (f.endsWith('.json')) {
        sessionMap[f] = fs.readFileSync(path.join(SESSION_DIR, f), 'utf8');
      }
    }
    if (Object.keys(sessionMap).length === 0) return;
    const sessionJson = JSON.stringify(sessionMap);

    const client = await getDbClient();
    if (client) {
      await client.query(
        `INSERT INTO whatsapp_sessions (id, status, connected, session_data, updated_at)
         VALUES ('default', 'CONNECTED', true, $1, NOW())
         ON CONFLICT (id) DO UPDATE 
         SET session_data = EXCLUDED.session_data,
             status = 'CONNECTED',
             connected = true,
             updated_at = NOW()`,
        [sessionJson]
      );
      await client.end();
    }
  } catch (_) {}
}

async function restoreSessionFromDb() {
  try {
    const client = await getDbClient();
    if (client) {
      const res = await client.query(`SELECT session_data FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`);
      await client.end();
      if (res.rows.length > 0 && res.rows[0].session_data) {
        const sessionMap = JSON.parse(res.rows[0].session_data);
        for (const [filename, content] of Object.entries(sessionMap)) {
          fs.writeFileSync(path.join(SESSION_DIR, filename), content as string);
        }
        console.log('✅ WhatsApp Auth Credentials successfully restored in-process!');
      }
    }
  } catch (_) {}
}

export async function initWhatsAppInProcess(opts?: { requireLeader?: boolean }) {
  const requireLeader = opts?.requireLeader !== false;
  if (requireLeader && !isBackgroundLeader()) {
    return null;
  }
  if (sock && isConnected) return sock;
  if (isInitializing) return null;
  isInitializing = true;

  try {
    await restoreSessionFromDb();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Blessing Power Guide', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      await backupSessionToDb();
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          await updateSessionStatus({
            status: 'QR_READY',
            connected: false,
            qrImage: qrDataUrl,
            message: 'Scan QR Code with WhatsApp phone to link',
          });
        } catch (_) {}
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        isConnected = false;
        isInitializing = false;

        await updateSessionStatus({
          status: 'DISCONNECTED',
          connected: false,
          qrImage: null,
          message: isLoggedOut ? 'WhatsApp logged out permanently.' : 'Reconnecting to WhatsApp...',
        });

        if (!isLoggedOut && isBackgroundLeader()) {
          setTimeout(() => initWhatsAppInProcess(), 5000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        isInitializing = false;
        await backupSessionToDb();
        const linkedPhone = sock?.user?.id?.split(':')[0] || sock?.user?.id?.split('@')[0] || null;
        await updateSessionStatus({
          status: 'CONNECTED',
          connected: true,
          qrImage: null,
          message: linkedPhone
            ? `Admin WhatsApp linked (+${linkedPhone}). OTPs & order updates will send from this number.`
            : 'WhatsApp Bot Connected and Active!',
        });
        try {
          const client = await getDbClient();
          if (client && linkedPhone) {
            await client.query(
              `UPDATE whatsapp_sessions SET pairing_code = $1, updated_at = NOW() WHERE id = 'default'`,
              [linkedPhone]
            );
            await client.end();
          }
        } catch (_) {}
        console.log('✅ In-Process Baileys WhatsApp Bot Connected and Active!', linkedPhone || '');
      }
    });

    return sock;
  } catch (err: any) {
    isInitializing = false;
    console.error('Error starting in-process WhatsApp socket:', err.message);
    return null;
  }
}

let sendQueue: Promise<any> = Promise.resolve();
let outboxWorkerStarted = false;
let outboxInterval: ReturnType<typeof setInterval> | null = null;

function newOutboxId() {
  return `wa-out-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function enqueueWhatsAppOutbox(to: string, message: string) {
  const client = await getDbClient();
  try {
    await client.query(
      `INSERT INTO whatsapp_outbox (id, phone, message) VALUES ($1, $2, $3)`,
      [newOutboxId(), to.replace(/\D/g, ''), message]
    );
  } finally {
    releaseDbClient(client);
  }
}

async function sendWhatsAppDirect(to: string, message: string) {
  const activeSock = await initWhatsAppInProcess();
  if (!activeSock || !isConnected) {
    throw new Error('WhatsApp not linked. Open Admin → WhatsApp and scan QR with the admin phone.');
  }

  const cleanPhone = to.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    throw new Error('Customer phone number is missing or invalid');
  }
  const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const jid = `${phoneWithCountry}@s.whatsapp.net`;

  await activeSock.sendMessage(jid, { text: message });
  console.log(`✅ [IN-PROCESS BAILEYS SENT] Message sent to +${phoneWithCountry}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: true, recipient: phoneWithCountry };
}

async function drainWhatsAppOutboxOnce() {
  if (!shouldRunBackgroundTask('outbox')) return;
  if (!isBackgroundLeader() || !isConnected) return;
  const client = await getDbClient();
  let rows: { id: string; phone: string; message: string }[] = [];
  try {
    const res = await client.query(
      `SELECT id, phone, message FROM whatsapp_outbox
       WHERE sent_at IS NULL
       ORDER BY created_at ASC
       LIMIT 5
       FOR UPDATE SKIP LOCKED`
    );
    rows = res.rows;
  } finally {
    releaseDbClient(client);
  }

  for (const row of rows) {
    try {
      await sendWhatsAppDirect(row.phone, row.message);
      const c = await getDbClient();
      try {
        await c.query(`UPDATE whatsapp_outbox SET sent_at = NOW(), last_error = NULL WHERE id = $1`, [row.id]);
      } finally {
        releaseDbClient(c);
      }
    } catch (err: any) {
      const c = await getDbClient();
      try {
        await c.query(`UPDATE whatsapp_outbox SET last_error = $2 WHERE id = $1`, [
          row.id,
          String(err?.message || err).slice(0, 500),
        ]);
      } finally {
        releaseDbClient(c);
      }
    }
  }
}

/** Leader replica only — drains cross-replica WhatsApp queue. */
export function startWhatsAppOutboxWorker() {
  if (outboxWorkerStarted || !isBackgroundLeader()) return;
  outboxWorkerStarted = true;
  const intervalMs = resolveTunedNumber('WHATSAPP_OUTBOX_INTERVAL_MS', 'whatsappOutboxIntervalMs');
  outboxInterval = setInterval(() => {
    void drainWhatsAppOutboxOnce();
  }, intervalMs);
  console.log(`[whatsapp] outbox worker enabled — every ${Math.round(intervalMs / 1000)}s`);
}

export function stopWhatsAppOutboxWorker() {
  if (outboxInterval) clearInterval(outboxInterval);
  outboxInterval = null;
  outboxWorkerStarted = false;
}

export async function shutdownWhatsAppInProcess() {
  isConnected = false;
  isInitializing = false;
  if (sock) {
    try {
      sock.end(undefined);
    } catch (_) {
      /* ignore */
    }
    sock = null;
  }
}

export async function sendWhatsAppMessageInProcess(to: string, message: string) {
  if (!isBackgroundLeader()) {
    await enqueueWhatsAppOutbox(to, message);
    return { success: true, queued: true, recipient: to.replace(/\D/g, '') };
  }

  const task = sendQueue.then(async () => {
    try {
      return await sendWhatsAppDirect(to, message);
    } catch (err: any) {
      console.error('Failed to send WhatsApp message in-process:', err.message);
      throw err;
    }
  });

  sendQueue = task.catch(() => {});
  return task;
}

export function getWhatsAppConnectionState() {
  return { connected: isConnected, hasSocket: !!sock };
}
