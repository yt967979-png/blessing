import { NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { getAdminAlertPhones, setAdminAlertPhones } from '@/lib/orderConfirm';

/** Admin alert phones — get WhatsApp when customer confirms YES. */
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const phones = await getAdminAlertPhones();
  return NextResponse.json({ phones, raw: phones.join(', ') });
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const body = await request.json();
    const phones = await setAdminAlertPhones(String(body.phones || body.raw || ''));
    return NextResponse.json({
      success: true,
      phones,
      message: phones.length
        ? `Alert phones saved: ${phones.map((p) => `+91${p}`).join(', ')}`
        : 'Cleared — will use ADMIN_PHONE / support phone only.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Save failed' }, { status: 500 });
  }
}
