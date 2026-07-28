import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  unauthorizedResponse,
  verifyAdminRequest,
} from '@/lib/serverSecurity';

export async function POST(request: Request) {
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

    const maxBytes = isReviewUpload ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'Image too large.' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP or GIF images allowed.' }, { status: 400 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    const apiKey = process.env.CLOUDINARY_API_KEY;

    const uploadFolder = isReviewUpload ? 'blessing_reviews' : folder;

    if (cloudName && uploadPreset && apiKey) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = `data:${file.type};base64,${buffer.toString('base64')}`;

      const cldFormData = new FormData();
      cldFormData.append('file', base64Data);
      cldFormData.append('api_key', apiKey);
      cldFormData.append('upload_preset', uploadPreset || 'ml_default');
      cldFormData.append('folder', uploadFolder);

      const cldRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: cldFormData,
      });

      if (cldRes.ok) {
        const cldData = await cldRes.json();
        return NextResponse.json({
          url: cldData.secure_url,
          public_id: cldData.public_id,
          provider: 'cloudinary',
        });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    return NextResponse.json({
      url: dataUrl,
      provider: 'inline-base64',
      warning: 'Cloudinary not configured — using inline image (fine for reviews).',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
