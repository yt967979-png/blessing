import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { getDbClient } from '@/lib/db';

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

export async function initWhatsAppInProcess() {
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

        if (!isLoggedOut) {
          setTimeout(initWhatsAppInProcess, 5000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        isInitializing = false;
        await backupSessionToDb();
        await updateSessionStatus({
          status: 'CONNECTED',
          connected: true,
          qrImage: null,
          message: 'WhatsApp Bot Connected and Active!',
        });
        console.log('✅ In-Process Baileys WhatsApp Bot Connected and Active!');
      }
    });

    return sock;
  } catch (err: any) {
    isInitializing = false;
    console.error('Error starting in-process WhatsApp socket:', err.message);
    return null;
  }
}

export async function sendWhatsAppMessageInProcess(to: string, message: string) {
  try {
    const activeSock = await initWhatsAppInProcess();
    if (!activeSock) {
      throw new Error('WhatsApp service not initialized');
    }

    const cleanPhone = to.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const jid = `${phoneWithCountry}@s.whatsapp.net`;

    await activeSock.sendMessage(jid, { text: message });
    console.log(`✅ [IN-PROCESS BAILEYS SENT] Message sent to +${phoneWithCountry}`);
    return { success: true, recipient: phoneWithCountry };
  } catch (err: any) {
    console.error('Failed to send WhatsApp message in-process:', err.message);
    throw err;
  }
}
