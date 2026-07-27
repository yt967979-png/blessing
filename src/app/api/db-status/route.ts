import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';

async function countTable(client: any, table: string): Promise<number | null> {
  try {
    const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return Number(res.rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

export async function GET() {
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
        instruction:
          'Railway → Web Service → Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}} then redeploy.',
        envKeysPresent: Object.keys(process.env).filter(
          (k) => k.includes('DB') || k.includes('POSTGRES') || k.includes('PG')
        ),
        connectionUrlFound: !!connectionString,
      },
      { status: 503 }
    );
  }

  try {
    await client.query('SELECT 1');

    const [books, categories, users, orders, reviews, addresses] = await Promise.all([
      countTable(client, 'books'),
      countTable(client, 'categories'),
      countTable(client, 'users'),
      countTable(client, 'orders'),
      countTable(client, 'reviews'),
      countTable(client, 'addresses'),
    ]);

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
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'CONNECTED',
      database: 'PostgreSQL',
      connectionUrlFound: !!connectionString,
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
      { status: 500 }
    );
  } finally {
    releaseDbClient(client);
  }
}
