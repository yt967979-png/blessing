import { NextResponse } from 'next/server';
import os from 'os';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse('Admin session required.');
    return forbiddenResponse(admin.error || 'Admin privileges required.');
  }

  const start = Date.now();

  // 1. Process & OS Memory
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);

  // 2. PostgreSQL Connection Pool & Wait Events
  let dbStats = {
    activeConnections: 1,
    idleConnections: 0,
    waitingLocks: 0,
    pingMs: 0,
    status: 'ONLINE',
  };

  try {
    const dbStart = Date.now();
    const [connRes, lockRes] = await Promise.all([
      queryDb(`SELECT state, count(pid)::int as count FROM pg_stat_activity GROUP BY state`),
      queryDb(`SELECT count(pid)::int as count FROM pg_stat_activity WHERE wait_event_type = 'Lock'`),
    ]);
    dbStats.pingMs = Date.now() - dbStart;

    for (const row of connRes.rows || []) {
      if (row.state === 'active') dbStats.activeConnections = row.count;
      else if (row.state === 'idle') dbStats.idleConnections = row.count;
    }
    dbStats.waitingLocks = lockRes.rows?.[0]?.count || 0;
  } catch (err: any) {
    dbStats.status = 'DEGRADED: ' + (err.message || 'Error');
  }

  // 3. Redis In-Memory Engine
  let redisStats = {
    status: 'ONLINE',
    pingMs: 0,
    mode: 'In-Memory Pipeline',
  };

  try {
    const redis = getRedisClient();
    if (redis) {
      const rStart = Date.now();
      await redis.ping();
      redisStats.pingMs = Date.now() - rStart;
    } else {
      redisStats.mode = 'In-Memory Fallback (LRU)';
    }
  } catch {
    redisStats.status = 'FALLBACK_LRU';
    redisStats.mode = 'In-Memory Fallback (LRU)';
  }

  // 4. Server Node Dual-Worker Architecture
  const workerInfo = {
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    workers: [
      { name: 'blessing@3000', port: 3000, targetCore: 'vCPU 1', status: 'ACTIVE' },
      { name: 'blessing@3001', port: 3001, targetCore: 'vCPU 0', status: 'ACTIVE' },
    ],
    loadBalancing: 'Caddy Round-Robin Reverse Proxy',
  };

  const totalTimeMs = Date.now() - start;

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    apiLatencyMs: totalTimeMs,
    system: {
      cpuCount: os.cpus().length,
      platform: os.platform(),
      totalMemMb: Math.round(totalMem / (1024 * 1024)),
      usedMemMb: Math.round(usedMem / (1024 * 1024)),
      freeMemMb: Math.round(freeMem / (1024 * 1024)),
      memUsagePercent: memPercent,
      processRssMb: Math.round(mem.rss / (1024 * 1024)),
      processHeapMb: Math.round(mem.heapUsed / (1024 * 1024)),
    },
    database: dbStats,
    redis: redisStats,
    workers: workerInfo,
  });
}
