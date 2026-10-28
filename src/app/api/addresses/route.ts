import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits, normalizeRequiredAlternateMobile } from '@/lib/authValidation';
import { formatFullAddressLine } from '@/lib/addresses';

function mapAddress(row: any) {
  const studentName = row.student_name || row.full_name || '';
  const streetName = row.street_name || row.address_line1 || '';
  const townCity = row.town_city || row.town || row.city || '';
  const district = row.district || row.city || 'Chennai';

  return {
    id: row.id,
    type: row.landmark || 'HOME',
    studentName,
    name: studentName,
    parentName: row.parent_name || '',
    phone: row.phone || '',
    alternatePhone: row.alternate_phone || '',
    whatsappNumber: row.whatsapp_number || '',
    email: row.primary_email || '',
    alternateEmail: row.alternate_email || '',
    doorNo: row.door_no || '',
    floorNo: row.floor_no || '',
    buildingName: row.building_name || '',
    streetName,
    address: row.address_line1 || streetName,
    areaLocality: row.area_locality || '',
    townCity,
    town: townCity,
    taluk: row.taluk || '',
    district,
    city: district,
    state: row.state || 'Tamil Nadu',
    pincode: row.pincode || '',
    landmark: row.near_landmark || '',
    deliveryInstructions: row.delivery_instructions || '',
    isDefault: !!row.is_default,
  };
}

async function ensureAddressColumns(db: typeof queryDb) {
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS student_name VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS primary_email VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS alternate_email VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS door_no VARCHAR(50)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS floor_no VARCHAR(100)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS building_name VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS street_name VARCHAR(200)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS area_locality VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS town_city VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS town VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS taluk VARCHAR(150)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS district VARCHAR(100)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS near_landmark VARCHAR(255)`);
  await db(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS delivery_instructions TEXT`);
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
    return NextResponse.json(res.rows.map(mapAddress), {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[addresses GET error]', err);
    return NextResponse.json({ error: 'Failed to load addresses' }, { status: 500 });
  }
}

// POST /api/addresses — create one address (14 Mandatory + 5 Optional Fields)
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

  // 14 Mandatory Fields
  const studentName = String(body.studentName || body.name || '').trim().slice(0, 100);
  const parentName = String(body.parentName || '').trim().slice(0, 100);
  const phoneRaw = String(body.phone || '').trim();
  const alternatePhoneRaw = String(body.alternatePhone || body.alternate_phone || '').trim();
  const email = String(body.email || body.primaryEmail || body.primary_email || '').trim().slice(0, 150);
  const doorNo = String(body.doorNo || body.door_no || '').trim().slice(0, 50);
  const floorNo = String(body.floorNo || body.floor_no || '').trim().slice(0, 100);
  const streetName = String(body.streetName || body.address || '').trim().slice(0, 200);
  const areaLocality = String(body.areaLocality || body.area_locality || '').trim().slice(0, 150);
  const townCity = String(body.townCity || body.town || body.city || '').trim().slice(0, 150);
  const district = String(body.district || body.city || 'Chennai').trim().slice(0, 100);
  const state = String(body.state || 'Tamil Nadu').trim().slice(0, 100);
  const pincode = String(body.pincode || '').replace(/\D/g, '').slice(0, 6);
  const landmark = String(body.landmark || body.near_landmark || '').trim().slice(0, 200);

  // 5 Optional Fields
  const whatsappNumber = String(body.whatsappNumber || body.whatsapp_number || '').replace(/\D/g, '').slice(0, 15);
  const alternateEmail = String(body.alternateEmail || body.alternate_email || '').trim().slice(0, 150);
  const buildingName = String(body.buildingName || body.building_name || '').trim().slice(0, 150);
  const taluk = String(body.taluk || '').trim().slice(0, 150);
  const deliveryInstructions = String(body.deliveryInstructions || body.delivery_instructions || '').trim().slice(0, 500);

  const type = String(body.type || 'HOME').trim().slice(0, 50);
  const isDefault = !!body.isDefault;

  // Validation
  if (!studentName) {
    return NextResponse.json({ error: 'Student Full Name is required *' }, { status: 400 });
  }
  if (!parentName) {
    return NextResponse.json({ error: 'Parent / Guardian Name is required *' }, { status: 400 });
  }
  if (!isValidMobileNumber(phoneRaw)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit primary mobile number *' }, { status: 400 });
  }
  const alt = normalizeRequiredAlternateMobile(alternatePhoneRaw, phoneRaw);
  if (!alt.ok) {
    return NextResponse.json({ error: alt.error }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid Primary Email ID *' }, { status: 400 });
  }
  if (!doorNo) {
    return NextResponse.json({ error: 'Door / House / Flat Number is required *' }, { status: 400 });
  }
  if (!floorNo) {
    return NextResponse.json({ error: 'Floor Number / Floor Details is required (or Independent House) *' }, { status: 400 });
  }
  if (!streetName) {
    return NextResponse.json({ error: 'Street / Road Name is required *' }, { status: 400 });
  }
  if (!areaLocality) {
    return NextResponse.json({ error: 'Area / Locality is required *' }, { status: 400 });
  }
  if (!townCity) {
    return NextResponse.json({ error: 'Village / Town / City is required *' }, { status: 400 });
  }
  if (!district) {
    return NextResponse.json({ error: 'District is required *' }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ error: 'State is required *' }, { status: 400 });
  }
  if (pincode.length !== 6) {
    return NextResponse.json({ error: 'Valid 6-digit PIN Code is required *' }, { status: 400 });
  }
  if (!landmark) {
    return NextResponse.json({ error: 'Nearby Landmark is required *' }, { status: 400 });
  }

  const phone = normalizeMobileDigits(phoneRaw);
  const fullAddress = formatFullAddressLine({
    doorNo,
    floorNo,
    buildingName,
    streetName,
    areaLocality,
    townCity,
    taluk,
    landmark,
  });

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
      `INSERT INTO addresses (
        id, user_id, full_name, student_name, parent_name,
        phone, alternate_phone, whatsapp_number,
        primary_email, alternate_email,
        door_no, floor_no, building_name,
        street_name, address_line1,
        area_locality, town_city, town,
        taluk, district, city, state, pincode,
        near_landmark, landmark, delivery_instructions, is_default
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10,
        $11, $12, $13,
        $14, $15,
        $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, $27
      ) RETURNING *`,
      [
        id, userId, studentName, studentName, parentName,
        phone, alt.value, whatsappNumber || null,
        email, alternateEmail || null,
        doorNo, floorNo, buildingName || null,
        streetName, fullAddress,
        areaLocality, townCity, townCity,
        taluk || null, district, district, state, pincode,
        landmark, type, deliveryInstructions || null, isDefault
      ]
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

    // Student name
    if (body.studentName !== undefined || body.name !== undefined) {
      const sName = String(body.studentName || body.name || '').trim().slice(0, 100);
      fields.push(`student_name = $${idx++}`);
      values.push(sName);
      fields.push(`full_name = $${idx++}`);
      values.push(sName);
    }

    // Parent name
    if (body.parentName !== undefined) {
      fields.push(`parent_name = $${idx++}`);
      values.push(String(body.parentName || '').trim().slice(0, 100));
    }

    // Primary phone
    if (body.phone !== undefined) {
      const phoneRaw = String(body.phone).trim();
      if (!isValidMobileNumber(phoneRaw)) {
        return NextResponse.json({ error: 'Enter a valid 10-digit delivery mobile number *' }, { status: 400 });
      }
      fields.push(`phone = $${idx++}`);
      values.push(normalizeMobileDigits(phoneRaw));
    }

    // Alternate phone
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

    // WhatsApp number
    if (body.whatsappNumber !== undefined || body.whatsapp_number !== undefined) {
      const wa = String(body.whatsappNumber ?? body.whatsapp_number ?? '').replace(/\D/g, '').slice(0, 15);
      fields.push(`whatsapp_number = $${idx++}`);
      values.push(wa || null);
    }

    // Primary email
    if (body.email !== undefined || body.primaryEmail !== undefined) {
      const em = String(body.email || body.primaryEmail || '').trim().slice(0, 150);
      fields.push(`primary_email = $${idx++}`);
      values.push(em);
    }

    // Alternate email
    if (body.alternateEmail !== undefined || body.alternate_email !== undefined) {
      const aEm = String(body.alternateEmail ?? body.alternate_email ?? '').trim().slice(0, 150);
      fields.push(`alternate_email = $${idx++}`);
      values.push(aEm || null);
    }

    // Door No
    const newDoor = body.doorNo !== undefined ? String(body.doorNo).trim().slice(0, 50) : current.door_no;
    if (body.doorNo !== undefined) {
      fields.push(`door_no = $${idx++}`);
      values.push(newDoor || null);
    }

    // Floor No
    const newFloor = body.floorNo !== undefined ? String(body.floorNo).trim().slice(0, 100) : current.floor_no;
    if (body.floorNo !== undefined) {
      fields.push(`floor_no = $${idx++}`);
      values.push(newFloor || null);
    }

    // Building Name
    if (body.buildingName !== undefined || body.building_name !== undefined) {
      const bldg = String(body.buildingName ?? body.building_name ?? '').trim().slice(0, 150);
      fields.push(`building_name = $${idx++}`);
      values.push(bldg || null);
    }

    // Street / Address
    const newStreet = body.streetName !== undefined ? String(body.streetName).trim().slice(0, 200) : (current.street_name || current.address_line1);
    if (body.streetName !== undefined) {
      fields.push(`street_name = $${idx++}`);
      values.push(newStreet || null);
    }

    // Area / Locality
    const newArea = body.areaLocality !== undefined ? String(body.areaLocality).trim().slice(0, 150) : current.area_locality;
    if (body.areaLocality !== undefined) {
      fields.push(`area_locality = $${idx++}`);
      values.push(newArea || null);
    }

    // Town / City
    const newTownCity = body.townCity !== undefined ? String(body.townCity).trim().slice(0, 150) : (current.town_city || current.town || current.city);
    if (body.townCity !== undefined || body.town !== undefined) {
      fields.push(`town_city = $${idx++}`);
      values.push(newTownCity || null);
      fields.push(`town = $${idx++}`);
      values.push(newTownCity || null);
    }

    // Taluk
    if (body.taluk !== undefined) {
      fields.push(`taluk = $${idx++}`);
      values.push(String(body.taluk || '').trim().slice(0, 150) || null);
    }

    // District / City
    const newDistrict = body.district !== undefined ? String(body.district).trim().slice(0, 100) : (current.district || current.city);
    if (body.district !== undefined || body.city !== undefined) {
      fields.push(`district = $${idx++}`);
      values.push(newDistrict);
      fields.push(`city = $${idx++}`);
      values.push(newDistrict);
    }

    // State
    if (body.state !== undefined) {
      fields.push(`state = $${idx++}`);
      values.push(String(body.state || 'Tamil Nadu').trim().slice(0, 100));
    }

    // Pincode
    if (body.pincode !== undefined) {
      fields.push(`pincode = $${idx++}`);
      values.push(String(body.pincode).replace(/\D/g, '').slice(0, 6));
    }

    // Landmark
    if (body.landmark !== undefined || body.near_landmark !== undefined) {
      const lmk = String(body.landmark ?? body.near_landmark ?? '').trim().slice(0, 200);
      fields.push(`near_landmark = $${idx++}`);
      values.push(lmk || null);
    }

    // Delivery Instructions
    if (body.deliveryInstructions !== undefined || body.delivery_instructions !== undefined) {
      const instr = String(body.deliveryInstructions ?? body.delivery_instructions ?? '').trim().slice(0, 500);
      fields.push(`delivery_instructions = $${idx++}`);
      values.push(instr || null);
    }

    // Address Type
    if (body.type !== undefined) {
      fields.push(`landmark = $${idx++}`);
      values.push(String(body.type).trim());
    }

    // IsDefault
    if (body.isDefault !== undefined) {
      fields.push(`is_default = $${idx++}`);
      values.push(!!body.isDefault);
    }

    // Update full composite address line for courier labels
    const formattedAddress = formatFullAddressLine({
      doorNo: newDoor,
      floorNo: newFloor,
      buildingName: body.buildingName ?? current.building_name,
      streetName: newStreet,
      areaLocality: newArea,
      townCity: newTownCity,
      taluk: body.taluk ?? current.taluk,
      landmark: body.landmark ?? current.near_landmark,
    });
    fields.push(`address_line1 = $${idx++}`);
    values.push(formattedAddress);

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
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id, is_default`,
      [id, userId]
    );
    if (!res.rows[0]) {
      return NextResponse.json({ error: 'Address not found.' }, { status: 404 });
    }

    if (res.rows[0].is_default) {
      const remaining = await queryDb(
        `SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (remaining.rows[0]) {
        await queryDb(`UPDATE addresses SET is_default = TRUE WHERE id = $1`, [remaining.rows[0].id]);
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('[addresses DELETE error]', err);
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 });
  }
}
