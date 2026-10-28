import os from 'os';
import { queryDb } from '@/lib/db';
import { getRedisClient } from '@/lib/redis';
import { getLiveMonitorMetrics } from '@/lib/visitorTracking';
import { getErrorDiagnostics } from '@/lib/errorMonitor';
import { CofounderObservedMetrics } from './types';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Gathers a complete 360° operational snapshot of Blessing Power Guide
 * from actual production PostgreSQL, Redis, and OS metrics (burning 0 AI tokens).
 */
export async function gatherCoFounderMetrics(): Promise<CofounderObservedMetrics> {
  const now = new Date();
  const uptimeSeconds = Math.floor(process.uptime());

  // 1. Technical (OS & Memory)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPercent = Math.round((usedMem / totalMem) * 100);

  let dbHealthy = false;
  let redisHealthy = false;

  // 2. Database Health & Business Orders Telemetry
  let todayOrders = 0;
  let todayRevenue = 0;
  let yesterdayOrders = 0;
  let yesterdayRevenue = 0;
  let paidOrders = 0;
  let cancelledOrders = 0;
  let unfulfilledOrders = 0;
  let ordersAwaitingAwb = 0;
  let inTransitCount = 0;
  let deliveredCount = 0;
  let topBookToday = '10th All-in-One Combo';

  let lowStockCount = 0;
  let outOfStockCount = 0;
  let lowStockItems: Array<{ id: string; title: string; stock: number; standard?: string }> = [];
  let abandonedCarts24h = 0;
  let openSupportTickets = 0;
  let avgCsatRating = 5.0;

  try {
    const dbPing = await queryDb('SELECT 1 as ok');
    dbHealthy = dbPing.rows?.[0]?.ok === 1;

    // A. Business: Today's and Yesterday's Sales
    const salesRes = await queryDb(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND COALESCE(order_status, '') NOT ILIKE '%cancel%') AS today_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at >= CURRENT_DATE AND COALESCE(order_status, '') NOT ILIKE '%cancel%'), 0) AS today_revenue,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE AND COALESCE(order_status, '') NOT ILIKE '%cancel%') AS yest_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE AND COALESCE(order_status, '') NOT ILIKE '%cancel%'), 0) AS yest_revenue,
        COUNT(*) FILTER (WHERE payment_status ILIKE '%paid%' OR payment_status ILIKE '%captured%') AS paid_orders,
        COUNT(*) FILTER (WHERE order_status ILIKE '%cancel%') AS cancelled_orders,
        COUNT(*) FILTER (WHERE (courier_status IS NULL OR courier_status = '' OR courier_status ILIKE '%pending%' OR courier_status ILIKE '%processing%') AND COALESCE(order_status, '') NOT ILIKE '%cancel%') AS unfulfilled_orders,
        COUNT(*) FILTER (WHERE (awb_number IS NULL OR awb_number = '' OR awb_number ILIKE 'SHP-%') AND created_at < NOW() - INTERVAL '24 hours' AND COALESCE(order_status, '') NOT ILIKE '%cancel%') AS awaiting_awb,
        COUNT(*) FILTER (WHERE courier_status ILIKE '%transit%' OR courier_status ILIKE '%dispatch%') AS in_transit,
        COUNT(*) FILTER (WHERE courier_status ILIKE '%deliver%') AS delivered
      FROM orders
    `);

    if (salesRes.rows[0]) {
      const r = salesRes.rows[0];
      todayOrders = Number(r.today_orders || 0);
      todayRevenue = Number(r.today_revenue || 0);
      yesterdayOrders = Number(r.yest_orders || 0);
      yesterdayRevenue = Number(r.yest_revenue || 0);
      paidOrders = Number(r.paid_orders || 0);
      cancelledOrders = Number(r.cancelled_orders || 0);
      unfulfilledOrders = Number(r.unfulfilled_orders || 0);
      ordersAwaitingAwb = Number(r.awaiting_awb || 0);
      inTransitCount = Number(r.in_transit || 0);
      deliveredCount = Number(r.delivered || 0);
    }

    // B. Top Selling Guide Book
    const topBookRes = await queryDb(`
      SELECT oi.book_title as title, SUM(oi.quantity) as qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days' AND COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
      GROUP BY oi.book_title
      ORDER BY qty DESC
      LIMIT 1
    `);
    if (topBookRes.rows[0]?.title) {
      topBookToday = topBookRes.rows[0].title;
    }

    // C. Inventory Safety Thresholds
    const stockRes = await queryDb(`
      SELECT id, title, stock, category_id
      FROM books
      WHERE stock <= 15
      ORDER BY stock ASC
      LIMIT 6
    `);
    lowStockItems = stockRes.rows.map((b) => ({
      id: String(b.id),
      title: String(b.title),
      stock: Number(b.stock || 0),
      standard: String(b.category_id || '10th').replace(/^cat-/, '') || '10th',
    }));
    lowStockCount = lowStockItems.filter((b) => b.stock > 0 && b.stock <= 15).length;
    outOfStockCount = lowStockItems.filter((b) => b.stock <= 0).length;

    // D. Abandoned Carts (Last 24h)
    const cartRes = await queryDb(`
      SELECT COUNT(*) as count
      FROM abandoned_carts
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);
    abandonedCarts24h = Number(cartRes.rows[0]?.count || 0);

    // E. Customer Support Queue & CSAT
    const supportRes = await queryDb(`
      SELECT COUNT(*) FILTER (WHERE status = 'WAITING_ADMIN' OR status = 'ACTIVE') as open_tickets
      FROM support_conversations
    `);
    const ratingRes = await queryDb(`
      SELECT COALESCE(AVG(rating), 5.0) as avg_rating FROM support_feedback
    `).catch(() => ({ rows: [{ avg_rating: 5.0 }] }));

    if (supportRes.rows[0]) {
      openSupportTickets = Number(supportRes.rows[0].open_tickets || 0);
    }
    if (ratingRes.rows[0]) {
      avgCsatRating = Number(Number(ratingRes.rows[0].avg_rating || 5.0).toFixed(1));
    }
  } catch (err) {
    console.warn('[CoFounder Observer] DB telemetry warning:', err);
  }

  // 3. Redis Health & Live Visitor Count
  let activeVisitorsNow = 1;
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      redisHealthy = true;
    }
    const liveMetrics = await getLiveMonitorMetrics();
    activeVisitorsNow = liveMetrics?.activeAll || 1;
  } catch (_) {
    redisHealthy = false;
  }

  // 4. Error Diagnostics
  let recentErrorsCount = 0;
  try {
    const errDiag = await getErrorDiagnostics();
    recentErrorsCount = errDiag?.fiveXx || errDiag?.totalErrors || 0;
  } catch (_) {}

  const avgOrderValue = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;

  return {
    timestamp: now.toISOString(),
    business: {
      todayOrders,
      todayRevenue,
      yesterdayOrders,
      yesterdayRevenue,
      paidOrders,
      cancelledOrders,
      avgOrderValue,
      topBookToday,
      unfulfilledOrders,
    },
    technical: {
      uptimeSeconds,
      uptimeFormatted: formatUptime(uptimeSeconds),
      memoryUsedMb: Math.round(usedMem / (1024 * 1024)),
      memoryTotalMb: Math.round(totalMem / (1024 * 1024)),
      memoryPercent,
      cpuCount: os.cpus()?.length || 2,
      recentErrorsCount,
      dbHealthy,
      redisHealthy,
    },
    customer: {
      activeVisitorsNow,
      abandonedCarts24h,
      openSupportTickets,
      avgCsatRating,
    },
    logistics: {
      ordersAwaitingAwb,
      inTransitCount,
      deliveredCount,
    },
    inventory: {
      lowStockCount,
      outOfStockCount,
      lowStockItems,
    },
  };
}
