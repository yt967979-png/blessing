import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { getAdminAuditLogs } from '@/lib/adminAudit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const action = searchParams.get('action') || undefined;
    const targetType = searchParams.get('targetType') || undefined;

    const data = await getAdminAuditLogs({ limit, offset, action, targetType });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('GET /api/admin/audit-logs error:', err);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
