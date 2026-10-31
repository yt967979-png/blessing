import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to edit order details');
  }

  const client = await getDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { orderId } = body;

    if (!orderId) {
      releaseDbClient(client);
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const res = await client.query(
      `SELECT id, order_number, user_id, shipping_address, order_status FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
      [orderId]
    );

    if (!res.rows?.length) {
      releaseDbClient(client);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderRow = res.rows[0];
    let currentAddr: any = {};
    if (orderRow.shipping_address) {
      if (typeof orderRow.shipping_address === 'object') {
        currentAddr = orderRow.shipping_address;
      } else {
        try {
          currentAddr = JSON.parse(orderRow.shipping_address);
        } catch {
          currentAddr = { address: orderRow.shipping_address };
        }
      }
    }

    const studentName = String(
      body.studentName || body.customerName || currentAddr.studentName || currentAddr.name || ''
    ).trim();
    const parentName = String(body.parentName !== undefined ? body.parentName : (currentAddr.parentName || '')).trim();
    const phone = String(body.phone || body.customerPhone || currentAddr.phone || '').replace(/\D/g, '').slice(-10);
    const alternatePhone = String(
      body.alternatePhone !== undefined
        ? body.alternatePhone
        : (body.customerAltPhone || currentAddr.alternatePhone || currentAddr.alternate_phone || '')
    ).replace(/\D/g, '').slice(-10);
    const email = String(body.email !== undefined ? body.email : (currentAddr.email || currentAddr.primary_email || '')).trim();
    const doorNo = String(body.doorNo !== undefined ? body.doorNo : (currentAddr.doorNo || currentAddr.door_no || '')).trim();
    const floorNo = String(body.floorNo !== undefined ? body.floorNo : (currentAddr.floorNo || currentAddr.floor_no || '')).trim();
    const streetName = String(body.streetName !== undefined ? body.streetName : (currentAddr.streetName || currentAddr.street_name || '')).trim();
    const areaLocality = String(body.areaLocality !== undefined ? body.areaLocality : (currentAddr.areaLocality || currentAddr.area_locality || '')).trim();
    const city = String(body.city || body.townCity || currentAddr.city || currentAddr.townCity || currentAddr.town || '').trim();
    const district = String(body.district || currentAddr.district || city || 'Tamil Nadu').trim();
    const state = String(body.state || currentAddr.state || 'Tamil Nadu').trim();
    const pincode = String(body.pincode || currentAddr.pincode || '').replace(/\D/g, '').slice(0, 6);
    const landmark = String(body.landmark !== undefined ? body.landmark : (currentAddr.landmark || currentAddr.near_landmark || '')).trim();

    // Construct full address line
    const addressParts = [
      doorNo,
      floorNo,
      streetName,
      areaLocality,
      landmark ? `Near ${landmark}` : '',
      city,
      district && district !== city ? district : '',
      `${state} - ${pincode}`,
    ].filter(Boolean);

    const fullAddress = body.address && String(body.address).trim().length > 5
      ? String(body.address).trim()
      : (addressParts.length > 2 ? addressParts.join(', ') : currentAddr.address || '');

    const updatedAddrObj = {
      ...currentAddr,
      name: studentName,
      studentName,
      parentName,
      phone,
      alternatePhone,
      email,
      doorNo,
      floorNo,
      streetName,
      areaLocality,
      townCity: city,
      city,
      district,
      state,
      pincode,
      landmark,
      near_landmark: landmark,
      address: fullAddress,
      admin_edited_at: new Date().toISOString(),
    };

    await client.query(
      `UPDATE orders SET shipping_address = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedAddrObj), orderRow.id]
    );

    // Timeline event
    const eventId = `tl-edit-${Date.now()}`;
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, created_at)
       VALUES ($1, $2, 'Address Updated', $3, 'Admin Office', NOW())`,
      [eventId, orderRow.id, `Admin corrected shipping details for ${studentName} (${phone})`]
    ).catch(() => {});

    releaseDbClient(client);

    // Notify listeners
    try {
      const { broadcastOrderChange, notifyOrderChanged } = await import('@/app/api/orders/stream/route');
      const event = {
        type: 'ORDER_UPDATED',
        orderId: orderRow.order_number || orderRow.id,
        status: orderRow.order_status,
        timestamp: Date.now(),
      };
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      orderId: orderRow.order_number || orderRow.id,
      shippingAddress: updatedAddrObj,
    });
  } catch (err: any) {
    if (client) releaseDbClient(client);
    return NextResponse.json({ error: err.message || 'Failed to update address' }, { status: 500 });
  }
}

