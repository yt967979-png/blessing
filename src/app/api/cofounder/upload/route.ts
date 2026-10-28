import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { processUploadedFile } from '@/lib/cofounder/documentIntelligence';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await verifyAdminRequest(req);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const caption = String(formData.get('caption') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await processUploadedFile({
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      caption,
      source: 'admin_dashboard',
    });

    return NextResponse.json({
      success: true,
      document: result,
      replyText: result.message,
    });
  } catch (err: any) {
    console.error('[CoFounder Upload API Error]:', err);
    return NextResponse.json({ error: 'Failed to process file upload' }, { status: 500 });
  }
}
