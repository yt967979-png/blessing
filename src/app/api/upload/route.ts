import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'blessing_power_guides';

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'wpkjkqoh';
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    const apiKey = process.env.CLOUDINARY_API_KEY || '995353775734644';

    // If Cloudinary credentials exist in environment variables, upload to Cloudinary
    if (cloudName && (uploadPreset || apiKey)) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = `data:${file.type};base64,${buffer.toString('base64')}`;

      const cldFormData = new FormData();
      cldFormData.append('file', base64Data);
      cldFormData.append('api_key', apiKey);
      if (uploadPreset) cldFormData.append('upload_preset', uploadPreset);
      cldFormData.append('folder', folder);

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

    // Fallback to base64 DataURL if Cloudinary env vars are missing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;

    return NextResponse.json({
      url: dataUrl,
      provider: 'base64',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
