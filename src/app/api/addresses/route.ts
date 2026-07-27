import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';

function mapAddress(row: any) {
  return {
    id: row.id,
    type: row.landmark || 'HOME',
    name: row.full_name,
    phone: row.phone,
    address: row.address_line1,
    city: row.city,
    pincode: row.pincode,
    state: row.state || 'Tamil Nadu',
    isDefault: !!row.is_default,
  };
}

async function resolveUserId(request: Request): Promise<string | null> {
  const session = await getAuthenticatedUser(request);
  return session?.userId || null;
}

// GET /api/addresses?userId=xxx
export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Login required to load saved addresses.' }, { status: 401 });
  }

  const client = await getDbClient();
  try {
    const res = await client.query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return NextResponse.json(res.rows.map(mapAddress));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}

// POST /api/addresses — create one address
export async function POST(request: Request) {
  const body = await request.json();
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Login required to save addresses.' }, { status: 401 });
  }

  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const address = String(body.address || '').trim();
  const city = String(body.city || 'Chennai').trim();
  const pincode = String(body.pincode || '').trim();
  const type = String(body.type || 'HOME').trim();
  const isDefault = !!body.isDefault;

  if (!name || !address || !pincode || pincode.length !== 6) {
    return NextResponse.json({ error: 'Name, address, and 6-digit pincode are required.' }, { status: 400 });
  }

  const client = await getDbClient();
  try {
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (isDefault) {
      await client.query(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const id = `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await client.query(
      `INSERT INTO addresses (id, user_id, full_name, phone, address_line1, city, pincode, landmark, state, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Tamil Nadu', $9)
       RETURNING *`,
      [id, userId, name, phone || '', address, city, pincode, type, isDefault]
    );

    return NextResponse.json(mapAddress(res.rows[0]), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}

// PATCH /api/addresses — update address
export async function PATCH(request: Request) {
  const body = await request.json();
  const userId = await resolveUserId(request);
  const id = body.id;
  if (!userId || !id) {
    return NextResponse.json({ error: 'userId and address id are required.' }, { status: 400 });
  }

  const client = await getDbClient();
  try {
    if (body.isDefault) {
      await client.query(`UPDATE addresses SET is_default = FALSE WHERE user_id = $1`, [userId]);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(String(body.name).trim()); }
    if (body.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(String(body.phone).trim()); }
    if (body.address !== undefined) { fields.push(`address_line1 = $${idx++}`); values.push(String(body.address).trim()); }
    if (body.city !== undefined) { fields.push(`city = $${idx++}`); values.push(String(body.city).trim()); }
    if (body.pincode !== undefined) { fields.push(`pincode = $${idx++}`); values.push(String(body.pincode).trim()); }
    if (body.type !== undefined) { fields.push(`landmark = $${idx++}`); values.push(String(body.type).trim()); }
    if (body.isDefault !== undefined) { fields.push(`is_default = $${idx++}`); values.push(!!body.isDefault); }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    values.push(id, userId);
    const res = await client.query(
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
  } finally {
    await client.end();
  }
}

// DELETE /api/addresses?id=xxx&userId=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const userId = await resolveUserId(request);
  if (!userId || !id) {
    return NextResponse.json({ error: 'userId and address id are required.' }, { status: 400 });
  }

  const client = await getDbClient();
  try {
    const res = await client.query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
