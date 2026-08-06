import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

function mapAddress(row: any) {
  return {
    id: row.id,
    type: row.landmark || 'HOME',
    name: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone || '',
    address: row.address_line1,
    city: row.city,
    pincode: row.pincode,
    state: row.state || 'Tamil Nadu',
    isDefault: !!row.is_default,
  };
}

async function ensureAddressColumns(db: typeof queryDb) {
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20)`);
}

async function resolveUserId(request: Request): Promise<string | null> {
  const session = await getAuthenticatedUser(request);
  return session?.userId || null;
}

function normalizeOptionalAlt(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: true, value: '' };
  if (!isValidMobileNumber(trimmed)) {
    return { ok: false, error: 'Enter a valid 10-digit alternate mobile number.' };
  }
  return { ok: true, value: normalizeMobileDigits(trimmed) };
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/addresses — create one address
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Login required to save addresses.' }, { status: 401 });
  }

  const name = String(body.name || '').trim();
  const phoneRaw = String(body.phone || '').trim();
  const address = String(body.address || '').trim();
  const city = String(body.city || 'Chennai').trim();
  const pincode = String(body.pincode || '').replace(/\D/g, '').slice(0, 6);
  const type = String(body.type || 'HOME').trim();
  const isDefault = !!body.isDefault;
  const alt = normalizeOptionalAlt(String(body.alternatePhone || body.alternate_phone || ''));

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
  if (alt.value && alt.value === phone) {
    return NextResponse.json(
      { error: 'Alternate number must be different from the primary phone.' },
      { status: 400 }
    );
  }

  try {
    await ensureAddressColumns(queryDb);
    const userCheck = await queryDb('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (isDefault) {
      await queryDb(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const id = `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await queryDb(
      `INSERT INTO addresses (id, user_id, full_name, phone, alternate_phone, address_line1, city, pincode, landmark, state, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Tamil Nadu', $10)
       RETURNING *`,
      [id, userId, name, phone, alt.value || null, address, city, pincode, type, isDefault]
    );

    return NextResponse.json(mapAddress(res.rows[0]), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    if (body.isDefault) {
      await queryDb(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(String(body.name).trim());
    }
    if (body.phone !== undefined) {
      const phoneRaw = String(body.phone).trim();
      if (!isValidMobileNumber(phoneRaw)) {
        return NextResponse.json({ error: 'Enter a valid 10-digit delivery mobile number.' }, { status: 400 });
      }
      fields.push(`phone = $${idx++}`);
      values.push(normalizeMobileDigits(phoneRaw));
    }
    if (body.alternatePhone !== undefined || body.alternate_phone !== undefined) {
      const alt = normalizeOptionalAlt(String(body.alternatePhone ?? body.alternate_phone ?? ''));
      if (!alt.ok) {
        return NextResponse.json({ error: alt.error }, { status: 400 });
      }
      fields.push(`alternate_phone = $${idx++}`);
      values.push(alt.value || null);
    }
    if (body.address !== undefined) {
      fields.push(`address_line1 = $${idx++}`);
      values.push(String(body.address).trim());
    }
    if (body.city !== undefined) {
      fields.push(`city = $${idx++}`);
      values.push(String(body.city).trim());
    }
    if (body.pincode !== undefined) {
      fields.push(`pincode = $${idx++}`);
      values.push(String(body.pincode).replace(/\D/g, '').slice(0, 6));
    }
    if (body.type !== undefined) {
      fields.push(`landmark = $${idx++}`);
      values.push(String(body.type).trim());
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

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }

    return NextResponse.json(mapAddress(res.rows[0]));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
