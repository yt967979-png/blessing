import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { isBackgroundLeader } from '@/lib/backgroundLeader';
import { resolveTunedNumber, shouldRunBackgroundTask } from '@/lib/runtimeProfile';

const SESSION_DIR = path.join(process.cwd(), 'whatsapp_session');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const waLogger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'silent' });

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
/** In-memory QR so Admin works even when Postgres is slow/down. */
let latestQrMemory: string | null = null;
let latestWaStatusMemory: {
  status: string;
  connected: boolean;
  message: string;
  pairingCode?: string | null;
} | null = null;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function getLatestQrMemory() {
  return latestQrMemory;
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
  if (data.qrImage) latestQrMemory = data.qrImage;
  if (data.qrImage === null) latestQrMemory = null;
  latestWaStatusMemory = {
    status: data.status,
    connected: data.connected,
    message: data.message,
    pairingCode: data.pairingCode ?? null,
  };

  // File first — never block QR on Postgres
  try {
    fs.writeFileSync(
      path.join(PUBLIC_DIR, 'whatsapp_status.json'),
      JSON.stringify({ ...data, timestamp: Date.now() }, null, 2)
    );
  } catch (e: any) {
    console.warn('[whatsapp] status file write failed:', e?.message || e);
  }

  // DB best-effort (do not await in hot path callers via void)
  try {
    const { tryGetDbClient } = await import('@/lib/db');
    const client = await Promise.race([
      tryGetDbClient(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (!client) return;
    try {
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
    } finally {
      releaseDbClient(client);
    }
  } catch (e: any) {
    console.warn('[whatsapp] status DB write skipped:', e?.message || e);
  }
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
  latestQrMemory = null;
  // Soft DB clear — never block QR wipe on Postgres timeouts
  try {
    const { tryGetDbClient } = await import('@/lib/db');
    const client = await Promise.race([
      tryGetDbClient(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (client) {
      try {
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
      } finally {
        releaseDbClient(client);
      }
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
  let client: any = null;
  try {
    client = await getDbClient();
    if (!client) return;
    const res = await client.query(`SELECT session_data FROM whatsapp_sessions WHERE id = 'default' LIMIT 1`);
    if (res.rows.length > 0 && res.rows[0].session_data) {
      const raw = res.rows[0].session_data;
      const sessionMap = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
      for (const [filename, content] of Object.entries(sessionMap)) {
        fs.writeFileSync(path.join(SESSION_DIR, filename), content as string);
      }
      console.log('✅ WhatsApp Auth Credentials successfully restored in-process!');
    }
  } catch (e: any) {
    console.warn('[whatsapp] restore session:', e?.message || e);
  } finally {
    releaseDbClient(client);
  }
}

export async function initWhatsAppInProcess(opts?: { requireLeader?: boolean }) {
  const requireLeader = opts?.requireLeader !== false;
  if (requireLeader && !isBackgroundLeader()) {
    console.warn('[whatsapp] init skipped — not background leader (set FORCE_BACKGROUND_LEADER=true if testing)');
    return null;
  }
  // Already have a live socket (connected or waiting for QR scan)
  if (sock) return sock;
  if (isInitializing) return null;
  isInitializing = true;

  try {
    // Don't block QR forever if Postgres is timing out
    await Promise.race([
      restoreSessionFromDb(),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
      console.log('[whatsapp] using WA version', version?.join('.'));
    } catch (e: any) {
      console.warn('[whatsapp] fetchLatestBaileysVersion failed, using default:', e?.message || e);
    }

    const socketOpts: any = {
      auth: state,
      logger: waLogger,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '22.04.4'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
    };
    if (version) socketOpts.version = version;

    sock = makeWASocket(socketOpts);

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
          // Only wipe on real logout / unlink — never during QR scan handshake
          clearLocalAuthFiles();
          clearReconnectTimer();
          reconnectAttempts = 0;
          latestQrMemory = null;
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
          // Normal close (incl. 515 restart after QR scan) — keep auth files, reconnect only.
          // Do NOT wipe session here or the scan will fail and QR keeps changing.
          reconnectAttempts += 1;
          const keepQr = latestQrMemory;
          await updateSessionStatus({
            status: keepQr ? 'QR_READY' : 'DISCONNECTED',
            connected: false,
            qrImage: keepQr,
            message: keepQr
              ? 'Scan QR Code with WhatsApp phone to link'
              : 'Reconnecting to WhatsApp…',
          });
          if (isBackgroundLeader()) {
            const delay = statusCode === DisconnectReason.restartRequired ? 1_500 : 4_000;
            reconnectTimer = setTimeout(() => initWhatsAppInProcess(), delay);
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
  // Soft-fail leader acquire when Postgres is down (single replica still runs WA)
  try {
    const { tryAcquireBackgroundLeader } = await import('@/lib/backgroundLeader');
    await Promise.race([
      tryAcquireBackgroundLeader(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (_) {
    /* ignore */
  }

  if (!isBackgroundLeader()) {
    console.warn('[whatsapp] ensureQr: not leader yet — trying init with requireLeader=false');
  }

  if (isConnected && sock) {
    return {
      qrImage: null,
      connected: true,
      status: 'CONNECTED',
      message: 'Already linked',
    };
  }

  // Stable QR: if we already have one and user did not ask for a new one, keep it.
  // Never wipe just because sock exists while waiting for scan — that breaks scanning.
  if (!opts?.forceFresh && latestQrMemory) {
    return {
      qrImage: latestQrMemory,
      connected: false,
      status: 'QR_READY',
      message: latestWaStatusMemory?.message || 'Scan QR Code with WhatsApp phone to link',
    };
  }
  if (!opts?.forceFresh) {
    try {
      const statusPath = path.join(PUBLIC_DIR, 'whatsapp_status.json');
      if (fs.existsSync(statusPath)) {
        const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (st?.qrImage && st.status === 'QR_READY') {
          latestQrMemory = st.qrImage;
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
  }

  // Only wipe when Admin explicitly asks for a new QR (Unlink / "Generate new one")
  if (opts?.forceFresh) {
    await resetWhatsAppSession();
  }

  // Socket already waiting for scan — do not recreate
  if (sock && !isConnected) {
    const maxWait = 8;
    for (let i = 0; i < maxWait; i++) {
      if (isConnected) {
        return { qrImage: null, connected: true, status: 'CONNECTED', message: 'Linked' };
      }
      if (latestQrMemory) {
        return {
          qrImage: latestQrMemory,
          connected: false,
          status: 'QR_READY',
          message: 'Scan QR Code with WhatsApp phone to link',
        };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return {
      qrImage: null,
      connected: false,
      status: 'INITIALIZING',
      message: 'Still generating QR… keep this tab open.',
    };
  }

  let active = await initWhatsAppInProcess({ requireLeader: true });
  if (!active) {
    active = await initWhatsAppInProcess({ requireLeader: false });
  }
  if (!active) {
    return {
      qrImage: null,
      connected: false,
      status: 'WAITING_LEADER',
      message:
        'WhatsApp engine not ready. Set FORCE_BACKGROUND_LEADER=true in env, restart server, then open this tab again.',
    };
  }

  const maxWait = opts?.forceFresh ? 20 : 10;
  for (let i = 0; i < maxWait; i++) {
    if (isConnected) {
      return { qrImage: null, connected: true, status: 'CONNECTED', message: 'Linked' };
    }
    if (latestQrMemory) {
      return {
        qrImage: latestQrMemory,
        connected: false,
        status: latestWaStatusMemory?.status || 'QR_READY',
        message: latestWaStatusMemory?.message || 'Scan QR Code with WhatsApp phone to link',
      };
    }
    try {
      const statusPath = path.join(PUBLIC_DIR, 'whatsapp_status.json');
      if (fs.existsSync(statusPath)) {
        const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (st?.qrImage) {
          latestQrMemory = st.qrImage;
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

  return {
    qrImage: null,
    connected: false,
    status: 'INITIALIZING',
    message: 'Still generating QR… tap “Generate new one” only if it stays blank.',
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
