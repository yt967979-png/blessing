import { NextRequest, NextResponse } from 'next/server';
import { clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { recordVisitorPing } from '@/lib/visitorTracking';

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    let vid = request.cookies.get('bpg_vid')?.value;
    const isNewVid = !vid;

    if (!vid) {
      vid = `v_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    }

    const body = await request.json().catch(() => ({}));
    const path = typeof body.path === 'string' ? body.path : '/';

    const session = await getAuthenticatedUser(request).catch(() => null);
    const isAdmin = Boolean(session && (session.role === 'admin' || (session as any).isAdmin));

    // Fire and forget in background
    void recordVisitorPing({
      visitorId: vid,
      path,
      isAdmin,
    });

    const response = NextResponse.json({ ok: true });
    if (isNewVid) {
      response.cookies.set('bpg_vid', vid, {
        path: '/',
        maxAge: 30 * 86400,
        sameSite: 'lax',
        httpOnly: true,
      });
    }

    return response;
  } catch {
    return NextResponse.json({ ok: true });
  }
}
