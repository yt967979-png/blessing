import { Pool } from 'pg';

let isSchemaInitialized = false;

// Global singleton PostgreSQL connection pool optimized for high-concurrency scaling
let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (pool) return pool;

  let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL;

  if (!connectionString && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD) {
    const host = process.env.PGHOST;
    const user = process.env.PGUSER;
    const pass = process.env.PGPASSWORD;
    const db = process.env.PGDATABASE || 'railway';
    const port = process.env.PGPORT || 5432;
    connectionString = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
  }

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured. Add it to your Railway environment variables.');
  }

  pool = new Pool({
    connectionString,
    max: 20, // Reuse max 20 connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: connectionString.includes('railway') || connectionString.includes('render') || connectionString.includes('rlwy.net')
      ? { rejectUnauthorized: false }
      : false,
  });

  return pool;
}

export async function getDbClient() {
  const activePool = getDbPool();
  const client: any = await activePool.connect();

  // Attach release alias to end for backwards compatibility with pool clients
  if (!client._hasEndAlias) {
    client._hasEndAlias = true;
    client.end = () => client.release();
  }

  if (!isSchemaInitialized) {
    isSchemaInitialized = true;

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

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
      `);
    } catch (e) {}
  }

  return client;
}
