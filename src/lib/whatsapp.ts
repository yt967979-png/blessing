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
let sessionBackupTimer: ReturnType<typeof setTimeout> | null = null;
/** Skip reconnect/status overwrite when we intentionally end the socket for a fresh QR. */
let ignoreNextClose = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Debounce DB session writes — Baileys can fire creds.update often. */
function scheduleSessionBackup() {
  if (sessionBackupTimer) clearTimeout(sessionBackupTimer);
  sessionBackupTimer = setTimeout(() => {
    sessionBackupTimer = null;
    void backupSessionToDb();
  }, 8_000);
}

async function updateSessionStatus(data: {
  status: string;
  connected: boolean;
  qrImage?: string | null;
  message: string;
  pairingCode?: string | null;
  linkedPhone?: string | null;
}) {
  try {
    fs.writeFileSync(
      path.join(PUBLIC_DIR, 'whatsapp_status.json'),
      JSON.stringify({ ...data, timestamp: Date.now() }, null, 2)
    );
    const client = await getDbClient();
    if (client) {
      if (data.pairingCode !== undefined) {
        await client.query(
          `INSERT INTO whatsapp_sessions (id, status, connected, qr_image, message, pairing_code, updated_at)
           VALUES ('default', $1, $2, $3, $4, $5, NOW())
           ON CONFLICT (id) DO UPDATE 
           SET status = EXCLUDED.status,
               connected = EXCLUDED.connected,
               qr_image = EXCLUDED.qr_image,
               message = EXCLUDED.message,
               pairing_code = EXCLUDED.pairing_code,
               updated_at = NOW()`,
          [data.status, data.connected, data.qrImage ?? null, data.message, data.pairingCode]
        );
      } else {
        await client.query(
          `INSERT INTO whatsapp_sessions (id, status, connected, qr_image, message, updated_at)
           VALUES ('default', $1, $2, $3, $4, NOW())
           ON CONFLICT (id) DO UPDATE 
           SET status = EXCLUDED.status,
               connected = EXCLUDED.connected,
               qr_image = EXCLUDED.qr_image,
               message = EXCLUDED.message,
               updated_at = NOW()`,
          [data.status, data.connected, data.qrImage ?? null, data.message]
        );
      }
      releaseDbClient(client);
    }
  } catch (_) {}
}

function clearLocalAuthFiles() {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      return;
    }
    for (const f of fs.readdirSync(SESSION_DIR)) {
      try {
        fs.rmSync(path.join(SESSION_DIR, f), { recursive: true, force: true });
      } catch (_) {}
    }
  } catch (_) {}
}

/** Hard reset socket + auth so a fresh QR can appear. */
export async function resetWhatsAppSession() {
  clearReconnectTimer();
  ignoreNextClose = true;
  reconnectAttempts = 0;
  try {
    if (sock) {
      try {
        sock.end?.(undefined);
      } catch (_) {}
    }
  } catch (_) {}
  sock = null;
  isConnected = false;
  isInitializing = false;
  clearLocalAuthFiles();
  try {
    const client = await getDbClient();
    if (client) {
      await client.query(
        `UPDATE whatsapp_sessions
         SET status = 'DISCONNECTED',
             connected = false,
             qr_image = NULL,
             session_data = NULL,
             pairing_code = NULL,
             message = 'Session cleared — generating new QR…',
             updated_at = NOW()
         WHERE id = 'default'`
      );
      releaseDbClient(client);
    }
  } catch (_) {}
  await updateSessionStatus({
    status: 'INITIALIZING',
    connected: false,
    qrImage: null,
    pairingCode: null,
    message: 'Generating new QR… keep this tab open.',
  });
}

async function backupSessionToDb() {
  let client: any = null;
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

    client = await getDbClient();
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
    }
  } catch (_) {
    /* ignore */
  } finally {
    releaseDbClient(client);
  }
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
  // Already have a live socket (connected or waiting for QR scan)
  if (sock) return sock;
  if (isInitializing) return null;
  isInitializing = true;

  try {
    await restoreSessionFromDb();
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Blessing Power Guide', 'Chrome', '1.0.0'],
      // Free: skip heavy history sync / presence (same process as Next)
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    // Unlock so status polls can use this sock while QR arrives
    isInitializing = false;
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      scheduleSessionBackup();
    });

    sock.ev.on('messages.upsert', async (upsert: any) => {
      try {
        if (upsert?.type !== 'notify' && upsert?.type !== 'append') return;
        const messages = upsert?.messages || [];
        for (const msg of messages) {
          if (!msg?.message || msg.key?.fromMe) continue;
          const jid = String(msg.key?.remoteJid || '');
          if (!jid.endsWith('@s.whatsapp.net')) continue;
          const fromPhone = jid.replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedDisplayText ||
            msg.message?.listResponseMessage?.title ||
            '';
          if (!text || !fromPhone) continue;
          const { handleInboundYesNo } = await import('@/lib/orderConfirm');
          const result = await handleInboundYesNo(fromPhone, String(text));
          if (result.handled) {
            console.log(`[whatsapp] YES/NO handled from +${fromPhone}:`, result.answer);
          }
        }
      } catch (e: any) {
        console.warn('[whatsapp] inbound handler:', e?.message || e);
      }
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
            pairingCode: null,
            message: 'Scan QR Code with WhatsApp phone to link',
          });
          console.log('[whatsapp] QR ready — scan from Admin → WhatsApp');
        } catch (e: any) {
          console.warn('[whatsapp] QR encode failed:', e?.message || e);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        isConnected = false;
        isInitializing = false;
        sock = null;

        // Intentional reset for fresh QR — do not overwrite with "Reconnecting"
        if (ignoreNextClose) {
          ignoreNextClose = false;
          clearReconnectTimer();
          return;
        }

        if (isLoggedOut) {
          clearLocalAuthFiles();
          clearReconnectTimer();
          reconnectAttempts = 0;
          try {
            const client = await getDbClient();
            if (client) {
              await client.query(
                `UPDATE whatsapp_sessions
                 SET session_data = NULL, pairing_code = NULL, qr_image = NULL, updated_at = NOW()
                 WHERE id = 'default'`
              );
              releaseDbClient(client);
            }
          } catch (_) {}
          await updateSessionStatus({
            status: 'INITIALIZING',
            connected: false,
            qrImage: null,
            pairingCode: null,
            message: 'Logged out — generating a fresh QR code. Please wait…',
          });
          if (isBackgroundLeader()) {
            reconnectTimer = setTimeout(() => initWhatsAppInProcess(), 2_000);
          }
        } else {
          reconnectAttempts += 1;
          // After 2 failed reconnects, wipe and force QR (stops endless "Reconnecting…")
          if (reconnectAttempts >= 2) {
            console.warn('[whatsapp] reconnect failed twice — wiping session for fresh QR');
            clearLocalAuthFiles();
            try {
              const client = await getDbClient();
              if (client) {
                await client.query(
                  `UPDATE whatsapp_sessions
                   SET session_data = NULL, pairing_code = NULL, qr_image = NULL, updated_at = NOW()
                   WHERE id = 'default'`
                );
                releaseDbClient(client);
              }
            } catch (_) {}
            reconnectAttempts = 0;
            await updateSessionStatus({
              status: 'INITIALIZING',
              connected: false,
              qrImage: null,
              pairingCode: null,
              message: 'Generating fresh QR… keep this tab open.',
            });
            if (isBackgroundLeader()) {
              reconnectTimer = setTimeout(() => initWhatsAppInProcess(), 2_000);
            }
          } else {
            await updateSessionStatus({
              status: 'DISCONNECTED',
              connected: false,
              qrImage: null,
              message: 'Reconnecting to WhatsApp...',
            });
            if (isBackgroundLeader()) {
              reconnectTimer = setTimeout(() => initWhatsAppInProcess(), 5_000);
            }
          }
        }
      } else if (connection === 'open') {
        isConnected = true;
        isInitializing = false;
        reconnectAttempts = 0;
        clearReconnectTimer();
        scheduleSessionBackup();
        const linkedPhone = sock?.user?.id?.split(':')[0] || sock?.user?.id?.split('@')[0] || null;
        await updateSessionStatus({
          status: 'CONNECTED',
          connected: true,
          qrImage: null,
          pairingCode: null,
          linkedPhone,
          message: linkedPhone
            ? `Admin WhatsApp linked (+${linkedPhone}). Order updates & coupon alerts will send from this number.`
            : 'WhatsApp Bot Connected and Active!',
        });
        console.log('✅ In-Process Baileys WhatsApp Bot Connected and Active!', linkedPhone || '');
      }
    });

    return sock;
  } catch (err: any) {
    isInitializing = false;
    sock = null;
    console.error('Error starting in-process WhatsApp socket:', err.message);
    return null;
  }
}

/** Kick Baileys and wait briefly for a QR (admin WhatsApp tab). */
export async function ensureWhatsAppQr(opts?: { forceFresh?: boolean }): Promise<{
  qrImage: string | null;
  connected: boolean;
  status: string;
  message: string;
}> {
  const { tryAcquireBackgroundLeader } = await import('@/lib/backgroundLeader');
  await tryAcquireBackgroundLeader();

  if (!isBackgroundLeader()) {
    return {
      qrImage: null,
      connected: false,
      status: 'WAITING_LEADER',
      message: 'Waiting for WhatsApp engine on the primary server…',
    };
  }

  if (isConnected && sock) {
    return {
      qrImage: null,
      connected: true,
      status: 'CONNECTED',
      message: 'Already linked',
    };
  }

  // Stuck "Reconnecting" / dead socket → always wipe and force QR
  let stuckReconnect = false;
  try {
    const statusPath = path.join(PUBLIC_DIR, 'whatsapp_status.json');
    if (fs.existsSync(statusPath)) {
      const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const msg = String(st?.message || '').toLowerCase();
      stuckReconnect =
        msg.includes('reconnect') ||
        (Boolean(st?.status) && st.status !== 'QR_READY' && st.status !== 'CONNECTED' && !st?.qrImage);
    }
  } catch (_) {
    /* ignore */
  }

  if (opts?.forceFresh || stuckReconnect || (sock && !isConnected)) {
    await resetWhatsAppSession();
  }

  await initWhatsAppInProcess();

  const maxWait = opts?.forceFresh || stuckReconnect ? 20 : 8;
  for (let i = 0; i < maxWait; i++) {
    if (isConnected) {
      return { qrImage: null, connected: true, status: 'CONNECTED', message: 'Linked' };
    }
    try {
      const statusPath = path.join(PUBLIC_DIR, 'whatsapp_status.json');
      if (fs.existsSync(statusPath)) {
        const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (st?.qrImage) {
          return {
            qrImage: st.qrImage,
            connected: false,
            status: st.status || 'QR_READY',
            message: st.message || 'Scan QR Code with WhatsApp phone to link',
          };
        }
      }
    } catch (_) {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Last resort: wipe once more and try again briefly
  if (!opts?.forceFresh) {
    await resetWhatsAppSession();
    await initWhatsAppInProcess();
    for (let i = 0; i < 12; i++) {
      try {
        const statusPath = path.join(PUBLIC_DIR, 'whatsapp_status.json');
        if (fs.existsSync(statusPath)) {
          const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
          if (st?.qrImage) {
            return {
              qrImage: st.qrImage,
              connected: false,
              status: 'QR_READY',
              message: st.message || 'Scan QR Code with WhatsApp phone to link',
            };
          }
        }
      } catch (_) {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return {
    qrImage: null,
    connected: false,
    status: 'INITIALIZING',
    message: 'Still generating QR… tap Show new QR again in a few seconds.',
  };
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
  if (!isBackgroundLeader()) return;

  // Lazy reconnect: only spin Baileys when there is pending work (not on every boot)
  if (!isConnected) {
    let pending = 0;
    let client: any = null;
    try {
      client = await getDbClient();
      const res = await client.query(
        `SELECT COUNT(*)::int AS n FROM whatsapp_outbox WHERE sent_at IS NULL`
      );
      pending = Number(res.rows[0]?.n || 0);
    } catch {
      pending = 0;
    } finally {
      releaseDbClient(client);
    }
    if (pending > 0) {
      void initWhatsAppInProcess();
    }
    return;
  }

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
  clearReconnectTimer();
  ignoreNextClose = true;
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
