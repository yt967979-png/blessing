import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

/** Active (non-cancelled) orders only — cancelled sales do not count toward revenue. */
const ACTIVE = `COALESCE(order_status, '') NOT ILIKE '%cancel%'`;

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '30';
  const days = Math.min(Math.max(Number(range) || 30, 1), 365);

  try {
    // Execute all 8 analytics queries concurrently in parallel using Promise.all on warm pool for sub-5ms response
    const [
      summaryRes,
      dailyRes,
      paymentMethodRes,
      statusRes,
      payStatusRes,
      topProductsRes,
      hourlyRes,
      momRes,
    ] = await Promise.all([
      // 1. Overall summary
      queryDb(`
        SELECT
          COUNT(*) FILTER (WHERE ${ACTIVE})::int                                        AS total_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE ${ACTIVE}), 0)::numeric              AS total_revenue,
          COALESCE(AVG(total_amount) FILTER (WHERE ${ACTIVE}), 0)::numeric              AS avg_order_value,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND (payment_status ILIKE '%confirm%' OR payment_status ILIKE '%paid%'))::int AS paid_orders,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND payment_method ILIKE '%cod%')::int   AS cod_orders,
          COUNT(*) FILTER (WHERE ${ACTIVE} AND ordered_at >= NOW() - INTERVAL '1 day')::int   AS today_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE ${ACTIVE} AND ordered_at >= NOW() - INTERVAL '1 day'), 0)::numeric AS today_revenue
        FROM orders
      `),

      // 2. Daily revenue for last N days
      queryDb(`
        SELECT
          DATE(ordered_at AT TIME ZONE 'Asia/Kolkata') AS day,
          COUNT(*)::int                                AS orders,
          COALESCE(SUM(total_amount), 0)::numeric      AS revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_method NOT ILIKE '%cod%'), 0)::numeric AS online_revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_method ILIKE '%cod%'), 0)::numeric     AS cod_revenue
        FROM orders
        WHERE ordered_at >= NOW() - ($1 || ' days')::INTERVAL
          AND ${ACTIVE}
        GROUP BY day
        ORDER BY day ASC
      `, [days]),

      // 3. Payment method breakdown
      queryDb(`
        SELECT
          payment_method,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(total_amount), 0)::numeric AS revenue
        FROM orders
        WHERE ${ACTIVE}
        GROUP BY payment_method
        ORDER BY revenue DESC
      `),

      // 4. Order status breakdown
      queryDb(`
        SELECT
          order_status                            AS status,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(CASE WHEN ${ACTIVE} THEN total_amount ELSE 0 END), 0)::numeric AS revenue
        FROM orders
        GROUP BY order_status
        ORDER BY count DESC
      `),

      // 5. Payment status breakdown
      queryDb(`
        SELECT
          payment_status,
          COUNT(*)::int                           AS count,
          COALESCE(SUM(total_amount), 0)::numeric AS revenue
        FROM orders
        WHERE ${ACTIVE}
        GROUP BY payment_status
        ORDER BY count DESC
      `),

      // 6. Top selling products
      queryDb(`
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
      `),

      // 7. Recent 7-day hourly heatmap
      queryDb(`
        SELECT
          EXTRACT(HOUR FROM ordered_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
          COUNT(*)::int AS orders
        FROM orders
        WHERE ordered_at >= NOW() - INTERVAL '7 days'
          AND ${ACTIVE}
        GROUP BY hour
        ORDER BY hour ASC
      `),

      // 8. Month-over-month comparison
      queryDb(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS month,
          COUNT(*)::int                               AS orders,
          COALESCE(SUM(total_amount), 0)::numeric     AS revenue
        FROM orders
        WHERE ordered_at >= NOW() - INTERVAL '6 months'
          AND ${ACTIVE}
        GROUP BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata') ASC
      `),
    ]);

    const summary = summaryRes.rows[0] || {};

    return NextResponse.json({
      summary: {
        totalOrders:    Number(summary.total_orders   || 0),
        totalRevenue:   Number(summary.total_revenue  || 0),
        avgOrderValue:  Math.round(Number(summary.avg_order_value || 0)),
        paidOrders:     Number(summary.paid_orders    || 0),
        codOrders:      Number(summary.cod_orders     || 0),
        todayOrders:    Number(summary.today_orders   || 0),
        todayRevenue:   Number(summary.today_revenue  || 0),
      },
      daily: dailyRes.rows.map((r: any) => ({
        day:           r.day,
        orders:        Number(r.orders),
        revenue:       Number(r.revenue),
        onlineRevenue: Number(r.online_revenue),
        codRevenue:    Number(r.cod_revenue),
      })),
      paymentMethods: paymentMethodRes.rows.map((r: any) => ({
        method:  r.payment_method || 'Unknown',
        count:   Number(r.count),
        revenue: Number(r.revenue),
      })),
      orderStatuses: statusRes.rows.map((r: any) => ({
        status:  r.status || 'Unknown',
        count:   Number(r.count),
        revenue: Number(r.revenue),
      })),
      paymentStatuses: payStatusRes.rows.map((r: any) => ({
        status:  r.payment_status || 'Unknown',
        count:   Number(r.count),
        revenue: Number(r.revenue),
      })),
      topProducts: topProductsRes.rows.map((r: any) => ({
        title:        r.title,
        totalQty:     Number(r.total_qty),
        totalRevenue: Number(r.total_revenue),
        orderCount:   Number(r.order_count),
      })),
      hourly: hourlyRes.rows.map((r: any) => ({
        hour:   Number(r.hour),
        orders: Number(r.orders),
      })),
      monthlyTrend: momRes.rows.map((r: any) => ({
        month:   r.month,
        orders:  Number(r.orders),
        revenue: Number(r.revenue),
      })),
      range: days,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Analytics error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
