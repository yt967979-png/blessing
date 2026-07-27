import { Pool } from 'pg';

let isSchemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

// Global singleton PostgreSQL connection pool optimized for high-concurrency scaling
let pool: Pool | null = null;

function resolveConnectionString(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
  ].filter(Boolean) as string[];

  if (candidates.length > 0) return candidates[0];

  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD) {
    const host = process.env.PGHOST;
    const user = process.env.PGUSER;
    const pass = process.env.PGPASSWORD;
    const db = process.env.PGDATABASE || 'railway';
    const port = process.env.PGPORT || 5432;
    return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
  }

  throw new Error('DATABASE_URL is not configured. Add it to your Railway environment variables.');
}

function sslFor(connectionString: string) {
  return process.env.DATABASE_SSL === 'true' ||
    connectionString.includes('railway') ||
    connectionString.includes('render') ||
    connectionString.includes('rlwy.net') ||
    connectionString.includes('proxy.rlwy.net')
    ? { rejectUnauthorized: false as const }
    : false;
}

export function getDbPool(): Pool {
  if (pool) return pool;

  const connectionString = resolveConnectionString();

  pool = new Pool({
    connectionString,
    // Small pool — Railway Hobby has limited connections; LISTEN uses a dedicated Client
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 20000),
    allowExitOnIdle: true,
    ssl: sslFor(connectionString),
  });

  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  return pool;
}

/** Config for long-lived dedicated pg Clients (LISTEN / NOTIFY helpers). */
export function getDbConnectionConfig() {
  const connectionString = resolveConnectionString();
  return { connectionString, ssl: sslFor(connectionString) };
}

function wrapPoolClient(client: any) {
  if (client._hasEndAlias) return client;
  client._hasEndAlias = true;
  client._released = false;
  const safeRelease = () => {
    if (client._released) return;
    client._released = true;
    try {
      client.release();
    } catch (_) {
      /* already returned to pool */
    }
  };
  client.end = safeRelease;
  const originalRelease = client.release.bind(client);
  client.release = (err?: Error | boolean) => {
    if (client._released) return;
    client._released = true;
    try {
      originalRelease(err);
    } catch (_) {
      /* ignore */
    }
  };
  return client;
}

export async function getDbClient() {
  try {
    const activePool = getDbPool();
    const client: any = await activePool.connect();
    wrapPoolClient(client);

    if (!isSchemaInitialized) {
      if (!schemaInitPromise) {
        schemaInitPromise = (async () => {
          try {
            await runSchemaInit(client);
            isSchemaInitialized = true;
          } catch (e: any) {
            console.error('[db] schema init failed:', e?.message || e);
            schemaInitPromise = null;
          }
        })();
      }
      await schemaInitPromise;
    }

    return client;
  } catch (err: any) {
    console.error('[db] connect timeout/failed:', err?.message || err);
    return null;
  }
}

async function runSchemaInit(client: any) {
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
    } catch (e) {}

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          google_id VARCHAR(255),
          email_verified BOOLEAN DEFAULT FALSE,
          profile_image TEXT,
          role VARCHAR(50) DEFAULT 'customer',
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          image TEXT,
          parent_category VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS books (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          isbn VARCHAR(100),
          author VARCHAR(255) DEFAULT 'Blessing Editorial Board',
          publisher VARCHAR(255) DEFAULT 'Blessing Pathway Education',
          edition VARCHAR(50) DEFAULT '2026 Edition',
          language VARCHAR(50) DEFAULT 'Tamil / English',
          semester VARCHAR(50),
          department VARCHAR(50),
          subject VARCHAR(100),
          category_id VARCHAR(255) REFERENCES categories(id) ON DELETE SET NULL,
          description TEXT,
          price NUMERIC NOT NULL,
          discount_price NUMERIC,
          stock INT DEFAULT 50,
          pages INT DEFAULT 240,
          weight VARCHAR(50) DEFAULT '400g',
          cover_image TEXT,
          status VARCHAR(50) DEFAULT 'published',
          featured BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS book_images (
          id VARCHAR(255) PRIMARY KEY,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          display_order INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS addresses (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          full_name VARCHAR(255) NOT NULL,
          phone VARCHAR(255) NOT NULL,
          address_line1 TEXT NOT NULL,
          address_line2 TEXT,
          city VARCHAR(255) NOT NULL,
          district VARCHAR(255),
          state VARCHAR(255) DEFAULT 'Tamil Nadu',
          country VARCHAR(255) DEFAULT 'India',
          pincode VARCHAR(50) NOT NULL,
          landmark VARCHAR(255),
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cart (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cart_items (
          id VARCHAR(255) PRIMARY KEY,
          cart_id VARCHAR(255) REFERENCES cart(id) ON DELETE CASCADE,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          quantity INT DEFAULT 1,
          price NUMERIC NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wishlist (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(255) PRIMARY KEY,
          order_number VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255),
          address_id VARCHAR(255),
          subtotal NUMERIC NOT NULL,
          discount NUMERIC DEFAULT 0,
          shipping_charge NUMERIC DEFAULT 0,
          tax NUMERIC DEFAULT 0,
          total_amount NUMERIC NOT NULL,
          payment_method VARCHAR(50) DEFAULT 'Razorpay',
          payment_status VARCHAR(50) DEFAULT 'Pending',
          order_status VARCHAR(50) DEFAULT 'Confirmed',
          razorpay_order_id VARCHAR(255),
          razorpay_payment_id VARCHAR(255),
          razorpay_signature VARCHAR(255),
          shipment_id VARCHAR(255),
          awb_number VARCHAR(255),
          courier_name VARCHAR(255) DEFAULT 'ST Courier Express',
          tracking_url TEXT,
          estimated_delivery VARCHAR(100),
          shipping_address TEXT,
          ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          book_id VARCHAR(255),
          book_title VARCHAR(255) NOT NULL,
          book_price NUMERIC NOT NULL,
          quantity INT NOT NULL,
          subtotal NUMERIC NOT NULL
        );

        CREATE TABLE IF NOT EXISTS payments (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          payment_gateway VARCHAR(50) DEFAULT 'Razorpay',
          payment_id VARCHAR(255),
          transaction_id VARCHAR(255),
          amount NUMERIC NOT NULL,
          currency VARCHAR(10) DEFAULT 'INR',
          status VARCHAR(50) DEFAULT 'SUCCESS',
          paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(255) PRIMARY KEY,
          user_name VARCHAR(255),
          user_id VARCHAR(255),
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          rating NUMERIC DEFAULT 5.0,
          review TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_otps (
          id VARCHAR(255) PRIMARY KEY,
          phone VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          otp VARCHAR(10) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_timeline (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          status VARCHAR(255) NOT NULL,
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
          id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
          status VARCHAR(100) NOT NULL DEFAULT 'INITIALIZING',
          connected BOOLEAN DEFAULT FALSE,
          qr_image TEXT,
          pairing_code VARCHAR(50),
          message TEXT,
          session_data JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS courier_tracking (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          docket_number VARCHAR(255) NOT NULL,
          courier_name VARCHAR(100) DEFAULT 'ST Courier Express',
          current_status VARCHAR(255),
          origin_hub VARCHAR(255),
          destination_hub VARCHAR(255),
          estimated_delivery VARCHAR(255),
          scraped_events JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_logs (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255),
          phone VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          provider VARCHAR(100) DEFAULT 'BAILEYS_FREE_UNLIMITED',
          status VARCHAR(50) DEFAULT 'SENT',
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS coupons (
          id VARCHAR(255) PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          discount_type VARCHAR(20) DEFAULT 'percentage',
          discount_value NUMERIC NOT NULL,
          minimum_amount NUMERIC DEFAULT 0,
          expiry_date TIMESTAMP,
          usage_limit INT DEFAULT 100,
          status VARCHAR(50) DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS faqs (
          id VARCHAR(255) PRIMARY KEY,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          display_order INT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
          site_name VARCHAR(255) DEFAULT 'BLESSING POWER GUIDE',
          support_email VARCHAR(255) DEFAULT 'blessingpowerguide@gmail.com',
          support_phone VARCHAR(255) DEFAULT '+91 98404 18228',
          razorpay_key VARCHAR(255),
          shipping_charge NUMERIC DEFAULT 0,
          tax_percentage NUMERIC DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          reset_at TIMESTAMPTZ NOT NULL
        );

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
        ALTER TABLE books ADD COLUMN IF NOT EXISTS badge VARCHAR(100) DEFAULT '';
        ALTER TABLE books ADD COLUMN IF NOT EXISTS stock INT DEFAULT 50;
      `);
    } catch (e) {
      /* schema already exists or partial — safe to continue */
    }
}
