import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits, normalizeRequiredAlternateMobile } from '@/lib/authValidation';

function mapAddress(row: any) {
  return {
    id: row.id,
    type: row.landmark || 'HOME',
    name: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone || '',
    address: row.address_line1,
    landmark: row.near_landmark || '',
    city: row.city,
    pincode: row.pincode,
    state: row.state || 'Tamil Nadu',
    isDefault: !!row.is_default,
  };
}

async function ensureAddressColumns(db: typeof queryDb) {
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS near_landmark VARCHAR(255)`);
}

async function resolveUserId(request: Request): Promise<string | null> {
  const session = await getAuthenticatedUser(request);
  return session?.userId || null;
}

// GET /api/addresses
export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Login required to load saved addresses.' }, { status: 401 });
  }

  try {
    await ensureAddressColumns(queryDb);
    const res = await queryDb(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return NextResponse.json(res.rows.map(mapAddress));
  } catch (err: any) {
    console.error('[addresses GET error]', err);
    return NextResponse.json({ error: 'Failed to load addresses' }, { status: 500 });
  }
}

// POST /api/addresses — create one address
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Login required to save addresses.' }, { status: 401 });
  }

  const rl = await applyRateLimitAsync(`addr-create:${userId}:${clientIp(request)}`, 15, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many address requests. Please wait a minute.' }, { status: 429 });
  }

  const name = String(body.name || '').trim().slice(0, 100);
  const phoneRaw = String(body.phone || '').trim();
  const address = String(body.address || '').trim().slice(0, 500);
  const nearLandmark = String(body.landmark || '').trim().slice(0, 200);
  const city = String(body.city || 'Chennai').trim().slice(0, 100);
  const pincode = String(body.pincode || '').replace(/\D/g, '').slice(0, 6);
  const type = String(body.type || 'HOME').trim().slice(0, 50);
  const isDefault = !!body.isDefault;
  const alt = normalizeRequiredAlternateMobile(
    String(body.alternatePhone || body.alternate_phone || ''),
    phoneRaw
  );

  if (!name || !address || pincode.length !== 6) {
    return NextResponse.json({ error: 'Name, address, and 6-digit pincode are required.' }, { status: 400 });
  }
  if (!isValidMobileNumber(phoneRaw)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit delivery mobile number.' }, { status: 400 });
  }
  if (!alt.ok) {
    return NextResponse.json({ error: alt.error }, { status: 400 });
  }

  const phone = normalizeMobileDigits(phoneRaw);

  try {
    await ensureAddressColumns(queryDb);
    const userCheck = await queryDb('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const countRes = await queryDb('SELECT COUNT(*)::int as count FROM addresses WHERE user_id = $1', [userId]);
    if (Number(countRes.rows[0]?.count || 0) >= 15) {
      return NextResponse.json(
        { error: 'Maximum 15 saved addresses reached. Please delete an older address to save a new one.' },
        { status: 400 }
      );
    }

    if (isDefault) {
      await queryDb(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const id = `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await queryDb(
      `INSERT INTO addresses (id, user_id, full_name, phone, alternate_phone, address_line1, near_landmark, city, pincode, landmark, state, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Tamil Nadu', $11)
       RETURNING *`,
      [id, userId, name, phone, alt.value, address, nearLandmark || null, city, pincode, type, isDefault]
    );

    return NextResponse.json(mapAddress(res.rows[0]), { status: 201 });
  } catch (err: any) {
    console.error('[addresses POST error]', err);
    return NextResponse.json({ error: 'Failed to save address' }, { status: 500 });
  }
}

// PATCH /api/addresses — update address
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = await resolveUserId(request);
  const id = body.id;
  if (!userId || !id) {
    return NextResponse.json({ error: 'userId and address id are required.' }, { status: 400 });
  }

  try {
    await ensureAddressColumns(queryDb);
    const existing = await queryDb(`SELECT * FROM addresses WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }
    const current = existing.rows[0];

    if (body.isDefault) {
      await queryDb(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(String(body.name).trim().slice(0, 100));
    }
    if (body.phone !== undefined) {
      const phoneRaw = String(body.phone).trim();
      if (!isValidMobileNumber(phoneRaw)) {
        return NextResponse.json({ error: 'Enter a valid 10-digit delivery mobile number.' }, { status: 400 });
      }
      fields.push(`phone = $${idx++}`);
      values.push(normalizeMobileDigits(phoneRaw));
    }

    const altTouched = body.alternatePhone !== undefined || body.alternate_phone !== undefined;
    const phoneTouched = body.phone !== undefined;
    if (altTouched || phoneTouched) {
      const primaryRaw = phoneTouched ? String(body.phone) : String(current.phone || '');
      const altRaw = altTouched
        ? String(body.alternatePhone ?? body.alternate_phone ?? '')
        : String(current.alternate_phone || '');
      const alt = normalizeRequiredAlternateMobile(altRaw, primaryRaw);
      if (!alt.ok) {
        return NextResponse.json({ error: alt.error }, { status: 400 });
      }
      if (altTouched) {
        fields.push(`alternate_phone = $${idx++}`);
        values.push(alt.value);
      }
    }
    if (body.address !== undefined) {
      fields.push(`address_line1 = $${idx++}`);
      values.push(String(body.address).trim().slice(0, 500));
    }
    if (body.city !== undefined) {
      fields.push(`city = $${idx++}`);
      values.push(String(body.city).trim().slice(0, 100));
    }
    if (body.pincode !== undefined) {
      fields.push(`pincode = $${idx++}`);
      values.push(String(body.pincode).replace(/\D/g, '').slice(0, 6));
    }
    if (body.type !== undefined) {
      fields.push(`landmark = $${idx++}`);
      values.push(String(body.type).trim());
    }
    if (body.landmark !== undefined) {
      fields.push(`near_landmark = $${idx++}`);
      values.push(String(body.landmark).trim().slice(0, 200) || null);
    }
    if (body.isDefault !== undefined) {
      fields.push(`is_default = $${idx++}`);
      values.push(!!body.isDefault);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    values.push(id, userId);
    const res = await queryDb(
      `UPDATE addresses SET ${fields.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      values
    );
    if (!res.rows[0]) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }
    return NextResponse.json(mapAddress(res.rows[0]));
  } catch (err: any) {
    console.error('[addresses PATCH error]', err);
    return NextResponse.json({ error: 'Failed to update address' }, { status: 500 });
  }
}

// DELETE /api/addresses
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const userId = await resolveUserId(request);
  if (!userId || !id) {
    return NextResponse.json({ error: 'userId and address id are required.' }, { status: 400 });
  }

  try {
    const res = await queryDb(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[addresses DELETE error]', err);
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 });
  }
}
