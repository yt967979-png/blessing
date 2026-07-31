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
        hint: err?.message?.includes('ENOTFOUND') || err?.message?.includes('railway.internal')
          ? 'postgres.railway.internal not found — use the PUBLIC proxy URL, not the private hostname'
          : err?.message?.includes('timeout')
            ? 'Connection timed out — confirm Postgres service is running and Public Networking is enabled in Railway'
            : undefined,
        instruction:
          'Railway → Web Service → Variables: set DATABASE_URL = ${{Postgres.DATABASE_PUBLIC_URL}} (host should be *.proxy.rlwy.net). Delete any extra Postgres service. Redeploy.',
        envKeysPresent: Object.keys(process.env).filter(
          (k) => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')
        ),
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

    return NextResponse.json({
      status: 'CONNECTED',
      database: 'PostgreSQL',
      connectionUrlFound: !!connectionString,
      preferredHostHint: (() => {
        try {
          const u = connectionString || '';
          return new URL(u.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
        } catch {
          return null;
        }
      })(),
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
