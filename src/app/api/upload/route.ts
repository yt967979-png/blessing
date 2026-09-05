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

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const maxBytes = isPdf ? 25 * 1024 * 1024 : (isReviewUpload ? 5 * 1024 * 1024 : 10 * 1024 * 1024);
    if (file.size > maxBytes) {
      return NextResponse.json({ error: isPdf ? 'PDF too large (max 25MB).' : 'Image too large (max 10MB).' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf'];
    if (!allowed.includes(file.type) && !isPdf) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, GIF or PDF documents allowed.' }, { status: 400 });
    }

    // Save directly to VPS disk storage (/public/uploads)
    try {
      const uploadSubDir = isReviewUpload ? 'reviews' : (isPdf ? 'samples' : 'catalog');
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', uploadSubDir);
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const rawExt = isPdf ? 'pdf' : (file.name.split('.').pop() || file.type.split('/')[1] || 'jpg');
      const cleanExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || (isPdf ? 'pdf' : 'jpg');
      const prefix = isPdf ? 'sample-' : 'img-';
      const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${cleanExt}`;
      const filepath = path.join(uploadDir, filename);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
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
