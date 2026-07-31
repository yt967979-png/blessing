import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/serverSecurity';

async function countTable(client: any, table: string): Promise<number | null> {
  try {
    const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return Number(res.rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

/** Admin-only DB diagnostics — never expose hosts/env/row counts publicly. */
export async function GET(request: Request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse();
    return forbiddenResponse();
  }

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.DATABASE_PRIVATE_URL;

  let client: any = null;

  try {
    client = await getDbClient();
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'DISCONNECTED',
        message: err?.message || 'Could not connect to PostgreSQL.',
        connectionUrlFound: !!connectionString,
      },
      { status: 200 }
    );
  }

  try {
    await client.query('SELECT 1');

    const books = await countTable(client, 'books');
    const categories = await countTable(client, 'categories');
    const users = await countTable(client, 'users');
    const orders = await countTable(client, 'orders');
    const reviews = await countTable(client, 'reviews');
    const addresses = await countTable(client, 'addresses');

    const missingTables = [
      ['books', books],
      ['categories', categories],
      ['users', users],
      ['orders', orders],
    ].filter(([, n]) => n === null);

    if (missingTables.length > 0) {
      return NextResponse.json(
        {
          status: 'SCHEMA_INCOMPLETE',
          message: `Missing or inaccessible tables: ${missingTables.map(([t]) => t).join(', ')}. Redeploy to run migrations.`,
          connectionUrlFound: !!connectionString,
          tableRowCounts: { books, categories, users, orders, reviews, addresses },
        },
        { status: 200 }
      );
    }

    let hostHint: string | null = null;
    try {
      const u = connectionString || '';
      hostHint = new URL(u.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
    } catch {
      hostHint = null;
    }

    return NextResponse.json({
      status: 'CONNECTED',
      database: 'PostgreSQL',
      connectionUrlFound: !!connectionString,
      preferredHostHint: hostHint,
      tableRowCounts: {
        books: books ?? 0,
        categories: categories ?? 0,
        users: users ?? 0,
        orders: orders ?? 0,
        reviews: reviews ?? 0,
        addresses: addresses ?? 0,
      },
      message: 'PostgreSQL connected.',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'ERROR',
        error: err?.message || 'Database query failed',
        connectionUrlFound: !!connectionString,
      },
      { status: 200 }
    );
  } finally {
    releaseDbClient(client);
  }
}
