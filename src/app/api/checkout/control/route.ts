import { NextResponse } from 'next/server';
import {
  getCheckoutControlStatus,
  setCheckoutControlStatus,
} from '@/lib/checkoutControl';
import {
  verifyAdminRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/serverSecurity';

export const runtime = 'nodejs';

/**
 * GET /api/checkout/control
 * Public status endpoint (cached with short TTL).
 * Cart, Checkout and Admin UI read this to know if checkout is paused or active.
 */
export async function GET() {
  try {
    const status = await getCheckoutControlStatus();
    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        paused: true,
        message: 'Online checkout is temporarily paused.',
        error: err?.message,
      },
      { status: 200 }
    );
  }
}

/**
 * POST /api/checkout/control
 * Admin-only toggle switch to activate or pause online checkout.
 */
export async function POST(request: Request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse(admin.error || 'Unauthorized');
    return forbiddenResponse('Admin privilege required to change checkout status');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { paused, message } = body;

    if (typeof paused !== 'boolean') {
      return NextResponse.json(
        { error: 'Field "paused" (boolean) is required.' },
        { status: 400 }
      );
    }

    const updated = await setCheckoutControlStatus({
      paused,
      message: typeof message === 'string' ? message : undefined,
      adminEmail: admin.user?.userId || 'Admin',
    });

    return NextResponse.json({
      ok: true,
      success: true,
      ...updated,
    });
  } catch (err: any) {
    console.error('[/api/checkout/control POST] failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update checkout status.' },
      { status: 500 }
    );
  }
}
