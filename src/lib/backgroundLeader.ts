import { Client } from 'pg';
import { getDbConnectionConfig } from '@/lib/db';

/** Fixed advisory lock id — only one Railway replica should hold background jobs. */
const ADVISORY_LOCK_KEY = 874_321_001;

let leaderClient: Client | null = null;
let isLeader = false;
let acquirePromise: Promise<boolean> | null = null;

function backgroundJobsDisabled(): boolean {
  return process.env.DISABLE_BACKGROUND_JOBS === 'true';
}

function forceLeader(): boolean {
  return process.env.FORCE_BACKGROUND_LEADER === 'true';
}

/** True when this process may run WhatsApp socket, LISTEN broker, and courier cron. */
export function isBackgroundLeader(): boolean {
  if (backgroundJobsDisabled()) return false;
  if (forceLeader()) return true;
  return isLeader;
}

/**
 * Try to become the sole background-job leader using a session advisory lock.
 * The dedicated connection must stay open for the lifetime of the process.
 */
export async function tryAcquireBackgroundLeader(): Promise<boolean> {
  if (backgroundJobsDisabled()) {
    console.log('[leader] background jobs disabled (DISABLE_BACKGROUND_JOBS=true)');
    return false;
  }
  if (forceLeader()) {
    isLeader = true;
    console.log('[leader] forced primary (FORCE_BACKGROUND_LEADER=true)');
    return true;
  }
  if (isLeader) return true;
  if (acquirePromise) return acquirePromise;

  acquirePromise = (async () => {
    try {
      const cfg = getDbConnectionConfig();
      const client = new Client(cfg);
      await client.connect();
      const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS pg_try_advisory_lock',
        [ADVISORY_LOCK_KEY]
      );
      if (!rows[0]?.pg_try_advisory_lock) {
        await client.end().catch(() => {});
        console.log('[leader] another replica holds background jobs — HTTP only on this instance');
        return false;
      }
      leaderClient = client;
      isLeader = true;
      client.on('error', (err) => {
        console.warn('[leader] lock connection error:', err.message);
        isLeader = false;
        leaderClient = null;
      });
      client.on('end', () => {
        isLeader = false;
        leaderClient = null;
      });
      const replica = process.env.RAILWAY_REPLICA_ID || 'local';
      console.log(`[leader] acquired background jobs (replica ${replica})`);
      return true;
    } catch (err: any) {
      console.warn('[leader] could not acquire lock:', err?.message || err);
      return false;
    } finally {
      acquirePromise = null;
    }
  })();

  return acquirePromise;
}

export async function releaseBackgroundLeader() {
  if (!leaderClient) return;
  try {
    await leaderClient.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
  } catch (_) {
    /* ignore */
  }
  try {
    await leaderClient.end();
  } catch (_) {
    /* ignore */
  }
  leaderClient = null;
  isLeader = false;
}
