import { Client } from 'pg';
import { getDbConnectionConfig } from '@/lib/db';
import { resolveTunedNumber } from '@/lib/runtimeProfile';

/** Fixed advisory lock id — only one Railway replica should hold background jobs. */
const ADVISORY_LOCK_KEY = 874_321_001;

function electionIntervalMs(): number {
  return resolveTunedNumber('LEADER_ELECTION_INTERVAL_MS', 'leaderElectionIntervalMs');
}

function lockPingMs(): number {
  const env = process.env.LEADER_LOCK_PING_MS;
  if (env) return Number(env);
  return Math.round(electionIntervalMs() * 0.83);
}

let leaderClient: Client | null = null;
let lockPingTimer: NodeJS.Timeout | null = null;
let electionTimer: NodeJS.Timeout | null = null;
let isLeader = false;
let acquirePromise: Promise<boolean> | null = null;
let onLeaderCallback: (() => void | Promise<void>) | null = null;
let onFollowerCallback: (() => void | Promise<void>) | null = null;

function backgroundJobsDisabled(): boolean {
  return process.env.DISABLE_BACKGROUND_JOBS === 'true';
}

function forceLeader(): boolean {
  return process.env.FORCE_BACKGROUND_LEADER === 'true';
}

/** True when this process may run LISTEN broker, courier cron, and orphan-refund sweep. */
export function isBackgroundLeader(): boolean {
  if (backgroundJobsDisabled()) return false;
  if (forceLeader()) return true;
  if (isLeader) return true;

  // Single instance (Lightsail / 1 replica): always allow background jobs.
  const replicas = Number(process.env.APP_REPLICA_COUNT || process.env.RAILWAY_NUM_REPLICAS || '1');
  if (replicas <= 1) return true;

  return false;
}

function stopLockPing() {
  if (lockPingTimer) {
    clearInterval(lockPingTimer);
    lockPingTimer = null;
  }
}

function startLockPing(client: Client) {
  stopLockPing();
  lockPingTimer = setInterval(() => {
    void client.query('SELECT 1').catch((err) => {
      console.warn('[leader] lock ping failed:', err?.message || err);
      void handleLeadershipLost('lock ping failed');
    });
  }, lockPingMs());
}

async function handleLeadershipLost(reason: string) {
  if (!isLeader && !leaderClient) return;
  console.warn(`[leader] lost leadership (${reason}) — releasing`);
  stopLockPing();
  const client = leaderClient;
  leaderClient = null;
  isLeader = false;
  if (client) {
    try {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
    } catch (_) {
      /* ignore */
    }
    try {
      await client.end();
    } catch (_) {
      /* ignore */
    }
  }
  if (onFollowerCallback) {
    try {
      await onFollowerCallback();
    } catch (err: any) {
      console.warn('[leader] follower callback error:', err?.message || err);
    }
  }
}

async function tryAcquireLockOnce(): Promise<boolean> {
  if (backgroundJobsDisabled()) return false;
  if (forceLeader()) {
    if (!isLeader) {
      isLeader = true;
      console.log('[leader] forced primary (FORCE_BACKGROUND_LEADER=true)');
      if (onLeaderCallback) await onLeaderCallback();
    }
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
        return false;
      }

      leaderClient = client;
      isLeader = true;
      startLockPing(client);

      client.on('error', (err) => {
        void handleLeadershipLost(err.message || 'connection error');
      });
      client.on('end', () => {
        void handleLeadershipLost('connection ended');
      });

      const replica = process.env.RAILWAY_REPLICA_ID || 'local';
      console.log(`[leader] acquired background jobs (replica ${replica})`);

      if (onLeaderCallback) {
        try {
          await onLeaderCallback();
        } catch (err: any) {
          console.warn('[leader] leader callback error:', err?.message || err);
        }
      }
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

/**
 * Automatic leader election — no manual env needed when scaling 1–5 replicas.
 * One replica runs courier cron + LISTEN broker; others stay idle for those jobs.
 * If the leader restarts, another replica takes over within ~30s.
 */
export function startAutomaticLeaderElection(
  onLeader: () => void | Promise<void>,
  onFollower?: () => void | Promise<void>
) {
  if (backgroundJobsDisabled()) {
    console.log('[leader] background jobs disabled (DISABLE_BACKGROUND_JOBS=true)');
    return;
  }

  onLeaderCallback = onLeader;
  onFollowerCallback = onFollower || null;

  void tryAcquireLockOnce();

  if (electionTimer) clearInterval(electionTimer);
  electionTimer = setInterval(() => {
    if (!isLeader) void tryAcquireLockOnce();
  }, electionIntervalMs());

  console.log(`[leader] automatic election enabled (retry every ${Math.round(electionIntervalMs() / 1000)}s)`);
}

/** @deprecated Prefer startAutomaticLeaderElection */
export async function tryAcquireBackgroundLeader(): Promise<boolean> {
  return tryAcquireLockOnce();
}

export async function releaseBackgroundLeader() {
  await handleLeadershipLost('manual release');
  if (electionTimer) {
    clearInterval(electionTimer);
    electionTimer = null;
  }
}
