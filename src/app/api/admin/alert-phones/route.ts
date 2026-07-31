import { NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { getStoredAdminAlertPhones, setAdminAlertPhones } from '@/lib/orderConfirm';

/** Admin alert phones — editable list only (not env merge). */
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const phones = await getStoredAdminAlertPhones();
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
        : 'Cleared — alerts fall back to ADMIN_PHONE env only.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Save failed' }, { status: 500 });
  }
}
