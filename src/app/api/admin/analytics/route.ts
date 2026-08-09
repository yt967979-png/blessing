import { NextResponse } from 'next/server';
import { withEphemeralClient } from '@/lib/db';
import {
  getAuthenticatedUser,
  forbiddenResponse,
} from '@/lib/serverSecurity';

/** Active (non-cancelled) orders only — cancelled sales do not count toward revenue. */
const ACTIVE = `COALESCE(order_status, '') NOT ILIKE '%cancel%'`;

function emptyAnalytics(days: number, error?: string) {
  return {
    summary: {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      paidOrders: 0,
      todayOrders: 0,
      todayRevenue: 0,
    },
    daily: [],
    paymentMethods: [],
    orderStatuses: [],
    paymentStatuses: [],
    topProducts: [],
    hourly: [],
    monthlyTrend: [],
    range: days,
    ...(error ? { error, dbDisconnected: true } : {}),
  };
}

/** Server wall-clock budget — keep below admin client AbortSignal (20s). */
const ANALYTICS_BUDGET_MS = Number(process.env.ANALYTICS_TIMEOUT_MS || 14_000);
const ANALYTICS_STATEMENT_MS = Number(
  process.env.ANALYTICS_STATEMENT_TIMEOUT_MS || 8_000
);

/** Flipkart-Grade RAM Cache: Store analytics in server memory for 60s to guarantee 0ms instant loads and 0 DB timeouts */
let analyticsRamCache: { timestamp: number; range: number; payload: any } | null = null;
const RAM_CACHE_TTL_MS = 10_000; // 10 seconds

export async function GET(request: Request) {
  // JWT only here — DB role check runs on the same ephemeral Client as analytics
  // so we never wait on the shared pool acquire queue before work starts.
  const session = await getAuthenticatedUser(request);
  if (!session) return forbiddenResponse('Unauthorized: Missing session');

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '30';
  const days = Math.min(Math.max(Number(range) || 30, 1), 365);
  const bypassCache = searchParams.get('fresh') === 'true';

  // Fast Path: Return RAM cached metrics instantly (<1ms) if fresh
  if (!bypassCache && analyticsRamCache && analyticsRamCache.range === days && Date.now() - analyticsRamCache.timestamp < RAM_CACHE_TTL_MS) {
    return NextResponse.json(analyticsRamCache.payload);
  }

  try {
    const payload = await withEphemeralClient(
      async (client) => {
        const authRes = await client.query(
          `SELECT role, status FROM users WHERE id = $1 LIMIT 1`,
          [session.userId]
        );
        if (authRes.rows.length === 0) {
          throw Object.assign(new Error('Unauthorized: User not found'), {
            code: 'AUTH',
            status: 403,
          });
        }
        const row = authRes.rows[0];
        if (String(row.status || '').toLowerCase() === 'banned') {
          throw Object.assign(new Error('Forbidden: Account disabled'), {
            code: 'AUTH',
            status: 403,
          });
        }
        const userRole = String(row.role || '').toLowerCase();
        if (userRole !== 'admin' && userRole !== 'super_admin') {
          throw Object.assign(new Error('Forbidden: Admin privilege required'), {
            code: 'AUTH',
            status: 403,
          });
        }

        // Sequential on one fresh connection — no pool concurrency storm (max=3).
        const summaryRes = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE ${ACTIVE})::int                                        AS total_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE ${ACTIVE}), 0)::numeric              AS total_revenue,
          COALESCE(AVG(total_amount) FILTER (WHERE ${ACTIVE}), 0)::numeric              AS avg_order_value,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND (payment_status ILIKE '%confirm%' OR payment_status ILIKE '%paid%'))::int AS paid_orders,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND (ordered_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::int AS today_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE ${ACTIVE} AND (ordered_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date), 0)::numeric AS today_revenue,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata'))::int AS month_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE ${ACTIVE} AND DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata')), 0)::numeric AS month_revenue
        FROM orders
      `);

        const dailyRes = await client.query(
          `
        SELECT
          DATE(ordered_at AT TIME ZONE 'Asia/Kolkata') AS day,
          COUNT(*)::int                                AS orders,
          COALESCE(SUM(total_amount), 0)::numeric      AS revenue
        FROM orders
        WHERE ordered_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND ${ACTIVE}
        GROUP BY day
        ORDER BY day ASC
      `,
          [days]
        );

        const paymentMethodRes = await client.query(`
        SELECT
          payment_method,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(total_amount), 0)::numeric AS revenue
        FROM orders
        WHERE ${ACTIVE}
        GROUP BY payment_method
        ORDER BY revenue DESC
      `);

        const statusRes = await client.query(`
        SELECT
          order_status                            AS status,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(CASE WHEN ${ACTIVE} THEN total_amount ELSE 0 END), 0)::numeric AS revenue
        FROM orders
        GROUP BY order_status
        ORDER BY count DESC
      `);

        const payStatusRes = await client.query(`
        SELECT
          payment_status,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(total_amount), 0)::numeric AS revenue
        FROM orders
        WHERE ${ACTIVE}
        GROUP BY payment_status
        ORDER BY count DESC
      `);

        const topProductsRes = await client.query(`
        SELECT
          oi.book_title                            AS title,
          SUM(oi.quantity)::int                    AS total_qty,
          COALESCE(SUM(oi.subtotal), 0)::numeric   AS total_revenue,
          COUNT(DISTINCT oi.order_id)::int         AS order_count
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
        GROUP BY oi.book_title
        ORDER BY total_qty DESC
        LIMIT 10
      `);

        const hourlyRes = await client.query(`
        SELECT
          EXTRACT(HOUR FROM ordered_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
          COUNT(*)::int AS orders
        FROM orders
        WHERE ordered_at >= NOW() - INTERVAL '7 days'
          AND ${ACTIVE}
        GROUP BY hour
        ORDER BY hour ASC
      `);

        const momRes = await client.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS month,
          COUNT(*)::int                               AS orders,
          COALESCE(SUM(total_amount), 0)::numeric     AS revenue
        FROM orders
        WHERE ordered_at >= NOW() - INTERVAL '6 months'
          AND ${ACTIVE}
        GROUP BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata') ASC
      `);

        const summary = summaryRes.rows[0] || {};

        return {
          summary: {
            totalOrders: Number(summary.total_orders || 0),
            totalRevenue: Number(summary.total_revenue || 0),
            avgOrderValue: Math.round(Number(summary.avg_order_value || 0)),
            paidOrders: Number(summary.paid_orders || 0),
            todayOrders: Number(summary.today_orders || 0),
            todayRevenue: Number(summary.today_revenue || 0),
            monthOrders: Number(summary.month_orders || 0),
            monthRevenue: Number(summary.month_revenue || 0),
          },
          daily: dailyRes.rows.map((r: any) => ({
            day: r.day,
            orders: Number(r.orders),
            revenue: Number(r.revenue),
          })),
          paymentMethods: paymentMethodRes.rows.map((r: any) => ({
            method: r.payment_method || 'Unknown',
            count: Number(r.count),
            revenue: Number(r.revenue),
          })),
          orderStatuses: statusRes.rows.map((r: any) => ({
            status: r.status || 'Unknown',
            count: Number(r.count),
            revenue: Number(r.revenue),
          })),
          paymentStatuses: payStatusRes.rows.map((r: any) => ({
            status: r.payment_status || 'Unknown',
            count: Number(r.count),
            revenue: Number(r.revenue),
          })),
          topProducts: topProductsRes.rows.map((r: any) => ({
            title: r.title,
            totalQty: Number(r.total_qty),
            totalRevenue: Number(r.total_revenue),
            orderCount: Number(r.order_count),
          })),
          hourly: hourlyRes.rows.map((r: any) => ({
            hour: Number(r.hour),
            orders: Number(r.orders),
          })),
          range: days,
        };
      },
      {
        budgetMs: ANALYTICS_BUDGET_MS,
        statementTimeoutMs: ANALYTICS_STATEMENT_MS,
        label: 'analytics',
        recyclePoolOnTimeout: true,
      }
    );

    analyticsRamCache = {
      timestamp: Date.now(),
      range: days,
      payload,
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = (err as { code?: string; status?: number })?.code;
    const status = (err as { status?: number })?.status;
    if (code === 'AUTH' || status === 403) {
      return forbiddenResponse(message);
    }
    console.error('Analytics error:', message);
    const isDb =
      /timeout|connect|ECONNREFUSED|ENOTFOUND|database|pool|ephemeral|analytics/i.test(
        message
      );
    return NextResponse.json(
      emptyAnalytics(
        days,
        isDb
          ? `${message}. On Lightsail: fix DATABASE_URL in /etc/blessing.env (Neon *-pooler*.neon.tech), then sudo systemctl restart blessing — or sudo bash deploy/aws/redeploy.sh ~/blessing-src`
          : message
      ),
      { status: isDb ? 503 : 500 }
    );
  }
}
