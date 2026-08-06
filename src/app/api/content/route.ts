import { NextResponse } from 'next/server';
import { tryGetDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

async function ensureFaqsTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS faqs (
      id VARCHAR(255) PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      display_order INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'faq';
  const adminAll = searchParams.get('admin') === '1';

  const client = await tryGetDbClient();
  if (!client) {
    // Soft fail for storefront — empty FAQs / settings
    if (type === 'settings') return NextResponse.json({});
    return NextResponse.json([]);
  }

  try {
    if (type === 'settings') {
      const res = await client.query(`SELECT * FROM settings WHERE id = 'main' LIMIT 1`);
      return NextResponse.json(res.rows[0] || {});
    }

    await ensureFaqsTable(client);

    if (adminAll) {
      const auth = await verifyAdminRequest(request);
      if (!auth.isAdmin) return forbiddenResponse(auth.error);
      const res = await client.query(
        `SELECT id, question, answer, display_order, status, created_at
         FROM faqs ORDER BY display_order ASC, created_at ASC`
      );
      return NextResponse.json(res.rows);
    }

    const res = await client.query(
      `SELECT id, question, answer, display_order
       FROM faqs
       WHERE status = 'active'
       ORDER BY display_order ASC, created_at ASC`
    );
    return NextResponse.json(res.rows);
  } catch (err: any) {
    console.error('[content GET]', err?.message || err);
    if (type === 'settings') return NextResponse.json({});
    return NextResponse.json([]);
  } finally {
    releaseDbClient(client);
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const body = await request.json().catch(() => ({}));
  const question = String(body.question || '').trim();
  const answer = String(body.answer || '').trim();
  const displayOrder = Number(body.display_order || 0);

  if (!question || !answer) {
    return NextResponse.json({ error: 'Question and answer are required.' }, { status: 400 });
  }

  const client = await tryGetDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable. Try again.' }, { status: 503 });
  }
  try {
    await ensureFaqsTable(client);
    const id = `faq-${Date.now()}`;
    const res = await client.query(
      `INSERT INTO faqs (id, question, answer, display_order, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      [id, question, answer, displayOrder]
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const body = await request.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'FAQ id required' }, { status: 400 });

  const client = await tryGetDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable. Try again.' }, { status: 503 });
  }
  try {
    await ensureFaqsTable(client);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (body.question !== undefined) {
      fields.push(`question = $${idx++}`);
      values.push(String(body.question).trim());
    }
    if (body.answer !== undefined) {
      fields.push(`answer = $${idx++}`);
      values.push(String(body.answer).trim());
    }
    if (body.display_order !== undefined) {
      fields.push(`display_order = $${idx++}`);
      values.push(Number(body.display_order));
    }
    if (body.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    values.push(id);
    const res = await client.query(
      `UPDATE faqs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return NextResponse.json(res.rows[0] || { success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const client = await tryGetDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable. Try again.' }, { status: 503 });
  }
  try {
    await client.query(`DELETE FROM faqs WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
