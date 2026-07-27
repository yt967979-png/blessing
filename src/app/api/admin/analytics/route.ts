import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '30';

  const client = await getDbClient();
  try {
    const days = Math.min(Math.max(Number(range) || 30, 1), 365);

    // 1. Overall summary
    const summaryRes = await client.query(`
      SELECT
        COUNT(*)::int                                        AS total_orders,
        COALESCE(SUM(total_amount), 0)::numeric              AS total_revenue,
        COALESCE(AVG(total_amount), 0)::numeric              AS avg_order_value,
        COUNT(*) FILTER (WHERE payment_status ILIKE '%confirm%' OR payment_status ILIKE '%paid%')::int AS paid_orders,
        COUNT(*) FILTER (WHERE payment_method ILIKE '%cod%')::int   AS cod_orders,
        COUNT(*) FILTER (WHERE ordered_at >= NOW() - INTERVAL '1 day')::int   AS today_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE ordered_at >= NOW() - INTERVAL '1 day'), 0)::numeric AS today_revenue
      FROM orders
    `);

    // 2. Daily revenue for last N days
    const dailyRes = await client.query(`
      SELECT
        DATE(ordered_at AT TIME ZONE 'Asia/Kolkata') AS day,
        COUNT(*)::int                                AS orders,
        COALESCE(SUM(total_amount), 0)::numeric      AS revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_method NOT ILIKE '%cod%'), 0)::numeric AS online_revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_method ILIKE '%cod%'), 0)::numeric     AS cod_revenue
      FROM orders
      WHERE ordered_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY day
      ORDER BY day ASC
    `, [days]);

    // 3. Payment method breakdown
    const paymentMethodRes = await client.query(`
      SELECT
        payment_method,
        COUNT(*)::int                           AS count,
        COALESCE(SUM(total_amount), 0)::numeric AS revenue
      FROM orders
      GROUP BY payment_method
      ORDER BY revenue DESC
    `);

    // 4. Order status breakdown
    const statusRes = await client.query(`
      SELECT
        order_status                            AS status,
        COUNT(*)::int                           AS count,
        COALESCE(SUM(total_amount), 0)::numeric AS revenue
      FROM orders
      GROUP BY order_status
      ORDER BY count DESC
    `);

    // 5. Payment status breakdown
    const payStatusRes = await client.query(`
      SELECT
        payment_status,
        COUNT(*)::int                           AS count,
        COALESCE(SUM(total_amount), 0)::numeric AS revenue
      FROM orders
      GROUP BY payment_status
      ORDER BY count DESC
    `);

    // 6. Top selling products
    const topProductsRes = await client.query(`
      SELECT
        oi.book_title                            AS title,
        SUM(oi.quantity)::int                    AS total_qty,
        COALESCE(SUM(oi.subtotal), 0)::numeric   AS total_revenue,
        COUNT(DISTINCT oi.order_id)::int         AS order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      GROUP BY oi.book_title
      ORDER BY total_qty DESC
      LIMIT 10
    `);

    // 7. Recent 7-day hourly heatmap (hour of day vs orders)
    const hourlyRes = await client.query(`
      SELECT
        EXTRACT(HOUR FROM ordered_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
        COUNT(*)::int AS orders
      FROM orders
      WHERE ordered_at >= NOW() - INTERVAL '7 days'
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // 8. Month-over-month comparison
    const momRes = await client.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS month,
        COUNT(*)::int                               AS orders,
        COALESCE(SUM(total_amount), 0)::numeric     AS revenue
      FROM orders
      WHERE ordered_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata')
      ORDER BY DATE_TRUNC('month', ordered_at AT TIME ZONE 'Asia/Kolkata') ASC
    `);

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
  } finally {
    if (client) await client.end();
  }
}
