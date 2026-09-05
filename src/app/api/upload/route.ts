import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  applyRateLimitAsync,
  clientIp,
  getAuthenticatedUser,
  unauthorizedResponse,
  verifyAdminRequest,
} from '@/lib/serverSecurity';

function sniffFileKind(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (buf.length >= 6 && buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  return null;
}

export async function POST(request: Request) {
  const rl = await applyRateLimitAsync(`upload:${clientIp(request)}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many uploads. Please wait a minute.' }, { status: 429 });
  }

  const session = await getAuthenticatedUser(request);
  const admin = session ? await verifyAdminRequest(request) : null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'blessing_power_guides';

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    const isReviewUpload = folder === 'reviews' || folder.startsWith('reviews/');
    if (isReviewUpload) {
      if (!session) return unauthorizedResponse('Login required to upload review photos.');
    } else if (!session || !admin?.isAdmin) {
      return unauthorizedResponse('Admin login required to upload catalog images.');
    }

    const lowerName = file.name.toLowerCase();
    if (file.type === 'image/svg+xml' || lowerName.endsWith('.svg') || lowerName.endsWith('.svgz')) {
      return NextResponse.json({ error: 'SVG files are not allowed.' }, { status: 400 });
    }

    const claimedPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const maxBytes = claimedPdf ? 25 * 1024 * 1024 : isReviewUpload ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: claimedPdf ? 'PDF too large (max 25MB).' : 'Image too large (max 10MB).' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const kind = sniffFileKind(buffer);
    if (!kind) {
      return NextResponse.json({ error: 'File type not allowed. Use JPEG, PNG, WebP, or PDF.' }, { status: 400 });
    }
    if (isReviewUpload && (kind === 'pdf' || kind === 'gif')) {
      return NextResponse.json({ error: 'Review photos must be JPEG, PNG, or WebP.' }, { status: 400 });
    }
    if (kind === 'pdf' && isReviewUpload) {
      return NextResponse.json({ error: 'PDF is not allowed for reviews.' }, { status: 400 });
    }
    if (kind === 'pdf' && !admin?.isAdmin) {
      return NextResponse.json({ error: 'Admin login required to upload PDFs.' }, { status: 401 });
    }

    try {
      const uploadSubDir = isReviewUpload ? 'reviews' : kind === 'pdf' ? 'samples' : 'catalog';
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', uploadSubDir);
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const ext = kind === 'jpeg' ? 'jpg' : kind;
      const prefix = kind === 'pdf' ? 'sample-' : 'img-';
      const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filepath = path.join(uploadDir, filename);
      await fs.promises.writeFile(filepath, buffer);

      return NextResponse.json({
        url: `/uploads/${uploadSubDir}/${filename}`,
        provider: 'vps-disk',
      });
    } catch (diskErr: any) {
      console.error('[upload] VPS disk write failed:', diskErr);
      return NextResponse.json({ error: 'Failed to save file to VPS storage' }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
