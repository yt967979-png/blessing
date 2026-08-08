const { Client } = require('pg');

try {
  require('dotenv').config();
} catch (e) { }

/** Prefer public *.rlwy.net over broken postgres.railway.internal (matches src/lib/db.ts). */
function getConnectionCandidates() {
  const raw = [
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_PUBLIC_URL,
  ].filter(Boolean);

  if (raw.length === 0 && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD) {
    const host = process.env.PGHOST;
    // URL-encode user/pass so special chars (@, #, /, :) in passwords don't break the URL.
    // db.ts does the same at line 30-35 — keep in sync.
    const user = encodeURIComponent(process.env.PGUSER);
    const pass = encodeURIComponent(process.env.PGPASSWORD);
    const db = process.env.PGDATABASE || 'railway';
    const port = process.env.PGPORT || 5432;
    raw.push(`postgresql://${user}:${pass}@${host}:${port}/${db}`);
  }

  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  return [...new Set(raw.map(normalizeConnectionString))].sort((a, b) => {
    const score = (u) => {
      if (isRailway && u.includes('railway.internal')) return 0;
      if (u.includes('railway.internal')) return 1;
      if (u.includes('rlwy.net') || u.includes('proxy.rlwy.net')) return 3;
      return 2;
    };
    return score(a) - score(b);
  });
}

const candidates = getConnectionCandidates();
const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

if (candidates.length === 0) {
  console.warn('⚠️ DATABASE_URL missing during build phase — schema initialization will run automatically on live app startup.');
  process.exit(0);
}

const dbUrlOnlyInternal =
  (process.env.DATABASE_URL || '').includes('railway.internal') &&
  !candidates.some((u) => u.includes('rlwy.net') || u.includes('proxy.rlwy.net'));

if (dbUrlOnlyInternal) {
  console.warn('⚠️ DATABASE_URL uses postgres.railway.internal; schema initialization will complete on app startup.');
}

function sslFor(connectionString) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  if (connectionString.includes('railway.internal')) return false;
  // Cloud PG (Neon/Railway proxy/Render/Supabase) — TLS via explicit ssl option.
  // sslmode is stripped from the URL so node-pg does not warn/double-negotiate.
  if (
    connectionString.includes('rlwy.net') ||
    connectionString.includes('proxy.rlwy.net') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('render.com') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('supabase.com') ||
    connectionString.includes('aivencloud.com')
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}

function normalizeConnectionString(url) {
  let u = url.trim();
  u = u.replace(/([?&])sslmode=[^&]*/gi, '$1');
  u = u.replace(/([?&])uselibpqcompat=[^&]*/gi, '$1');
  u = u.replace(/\?&/g, '?').replace(/[?&]$/g, '');
  return u;
}

async function connectWithFallback(label) {
  let lastErr = null;
  for (const connStr of candidates) {
    const host = (() => {
      try {
        return new URL(connStr.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
      } catch {
        return '(unknown)';
      }
    })();
    console.log(`⚡ Connecting to PostgreSQL [${label}] via ${host}…`);
    const client = new Client({
      connectionString: normalizeConnectionString(connStr),
      ssl: sslFor(connStr),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
    });
    try {
      await client.connect();
      return { client, connStr };
    } catch (err) {
      lastErr = err;
      console.error(`❌ [${host}] ${err.message}`);
      try {
        await client.end();
      } catch (_) { }
      if (err.message?.includes('ENOTFOUND') && connStr.includes('railway.internal')) {
        console.warn('   → private hostname failed, trying next URL…');
        continue;
      }
    }
  }
  throw lastErr || new Error('Could not connect to PostgreSQL');
}

async function migrateDatabase(connStr, dbName) {
  const client = new Client({
    connectionString: normalizeConnectionString(connStr),
    ssl: sslFor(connStr),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
  });

  try {
    await client.connect();
    console.log(`🔒 Executing 17-Table Schema Migration in [${dbName}]...`);

    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
    } catch (e) { }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        google_id VARCHAR(255),
        profile_image TEXT,
        role VARCHAR(50) DEFAULT 'customer',
        status VARCHAR(50) DEFAULT 'active',
        profile_completed BOOLEAN DEFAULT TRUE,
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
        invoice_number VARCHAR(255),
        shipping_address TEXT,
        packed_at TIMESTAMP,
        shipped_at TIMESTAMP,
        delivered_at TIMESTAMP,
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

      CREATE TABLE IF NOT EXISTS order_timeline (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
        status VARCHAR(255) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
        rating NUMERIC DEFAULT 5.0,
        review TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contact_messages (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
        site_name VARCHAR(255) DEFAULT 'BLESSING POWER GUIDE',
        support_email VARCHAR(255) DEFAULT 'blessingpowerguide@gmail.com',
        support_phone VARCHAR(255) DEFAULT '+91 98404 18228',
        razorpay_key VARCHAR(255),
        shipping_charge NUMERIC DEFAULT 0,
        tax_percentage NUMERIC DEFAULT 0,
        admin_alert_phones TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS faqs (
        id VARCHAR(255) PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_holds (
        id VARCHAR(255) PRIMARY KEY,
        hold_group_id VARCHAR(255) NOT NULL,
        razorpay_order_id VARCHAR(255),
        book_id VARCHAR(255) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        user_id VARCHAR(255),
        qty INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'held',
        expires_at TIMESTAMP NOT NULL,
        released_at TIMESTAMP,
        release_reason VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_holds_group ON stock_holds (hold_group_id);
      CREATE INDEX IF NOT EXISTS idx_stock_holds_rzp_order ON stock_holds (razorpay_order_id);
      CREATE INDEX IF NOT EXISTS idx_stock_holds_sweep ON stock_holds (status, expires_at);

      CREATE TABLE IF NOT EXISTS refunds (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
        razorpay_refund_id VARCHAR(255),
        razorpay_payment_id VARCHAR(255),
        amount NUMERIC NOT NULL,
        status VARCHAR(50) DEFAULT 'PROCESSED',
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds (order_id);

      CREATE TABLE IF NOT EXISTS webhook_events (
        id VARCHAR(255) PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events (event_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        actor_id VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(100),
        target_id VARCHAR(255),
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

      CREATE TABLE IF NOT EXISTS email_otps (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
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

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMP;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
      ALTER TABLE books ADD COLUMN IF NOT EXISTS badge VARCHAR(100) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT TRUE;
      ALTER TABLE users DROP COLUMN IF EXISTS email_verified;

      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title VARCHAR(255);
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS minimum_quantity INT DEFAULT 0;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS offer_type VARCHAR(30) DEFAULT 'discount';
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS condition_mode VARCHAR(20) DEFAULT 'any';
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS show_in_hero BOOLEAN DEFAULT true;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INT DEFAULT 1;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_classes TEXT;
      ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_categories TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(255);

      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id VARCHAR(255) PRIMARY KEY,
        coupon_id VARCHAR(255) REFERENCES coupons(id) ON DELETE SET NULL,
        user_id VARCHAR(255),
        order_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_user
        ON coupon_redemptions (coupon_id, user_id);

      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (order_status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (ordered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_awb ON orders (awb_number);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

      -- Super Admin is set from env only (no hardcoded emails in source)
    `);

    const superEmail = String(process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '')
      .toLowerCase()
      .trim();
    if (superEmail) {
      await client.query(
        `UPDATE users SET role = 'super_admin' WHERE LOWER(email) = $1`,
        [superEmail]
      );
    }

    console.log(`✅ [${dbName}] Schema migration complete!`);
    await client.end();
  } catch (err) {
    console.error(`❌ [${dbName}] Migration Warning:`, err.message);
    if (client) await client.end();
  }
}

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const WEAK_ADMIN_PASSWORDS = new Set([
  '123456',
  'password',
  'admin',
  'changeme',
  'changeme@bpg2026',
  'yogesh234456',
  'blessing',
  'admin123',
  'password123',
]);

function isStrongAdminPassword(password) {
  const pw = String(password || '');
  if (pw.length < 12) return false;
  if (WEAK_ADMIN_PASSWORDS.has(pw.toLowerCase())) return false;
  return /[A-Za-z]/.test(pw) && (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw));
}

function isProductionSeedRuntime() {
  if (process.env.NODE_ENV !== 'production') return false;
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.LIGHTSAIL ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.PUBLIC_BASE_URL ||
      process.env.DATABASE_URL
  );
}

const DEFAULT_FAQS = [
  {
    id: 'faq-1',
    question: 'Which syllabus do Blessing Power Guides follow?',
    answer: 'Our guides follow the latest Tamil Nadu State Board (Samacheer Kalvi) syllabus, CBSE board curriculum, and Matriculation standards updated for the 2026 academic year.',
    display_order: 1,
  },
  {
    id: 'faq-2',
    question: 'How long does delivery take across Tamil Nadu and India?',
    answer: 'Orders are dispatched within 24 hours. Delivery takes 2-3 working days within Tamil Nadu and 3-5 days for rest of India.',
    display_order: 2,
  },
  {
    id: 'faq-3',
    question: 'Do you offer Cash on Delivery (COD)?',
    answer: 'We accept secure online payments via Razorpay (UPI, Google Pay, PhonePe, Cards, Net Banking). Cash on Delivery is not available.',
    display_order: 3,
  },
  {
    id: 'faq-4',
    question: 'What is included in the 5-Subject Combo Pack?',
    answer: 'The 10th Standard Combo Pack includes 5 complete books: Mathematics, Science, Social Science, English, and Tamil with model question papers and step-by-step solutions.',
    display_order: 4,
  },
  {
    id: 'faq-5',
    question: 'Can I preview sample chapters before buying?',
    answer: 'Yes, you can click on the Free Sample PDF button to download free sample chapters of any standard and subject.',
    display_order: 5,
  },
];



async function seedCouponsAndFaqs(connStr, dbName) {
  const client = new Client({
    connectionString: normalizeConnectionString(connStr),
    ssl: sslFor(connStr),
  });

  try {
    await client.connect();

    // Coupons are product-disabled — do not seed offer codes.
    console.log(`ℹ️  [${dbName}] Coupon seed skipped (system disabled)`);

    for (const faq of DEFAULT_FAQS) {
      await client.query(
        `INSERT INTO faqs (id, question, answer, display_order, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (id) DO UPDATE SET answer = EXCLUDED.answer, question = EXCLUDED.question`,
        [faq.id, faq.question, faq.answer, faq.display_order]
      );
    }
    console.log(`✅ [${dbName}] FAQs seeded`);

    await client.end();
  } catch (err) {
    console.error(`❌ Seed error [${dbName}]:`, err.message);
    if (client) await client.end();
  }
}

async function seedCategories(connStr, dbName) {
  const client = new Client({
    connectionString: normalizeConnectionString(connStr),
    ssl: sslFor(connStr),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 15000),
  });
  const categories = [
    ['cat-combos', 'Combo Packs', 'combos'],
    ['cat-6th', '6th Standard Guides', '6th'],
    ['cat-7th', '7th Standard Guides', '7th'],
    ['cat-8th', '8th Standard Guides', '8th'],
    ['cat-9th', '9th Standard Guides', '9th'],
    ['cat-10th', '10th Standard Guides', '10th'],
    ['cat-11th', '11th Standard Guides', '11th'],
    ['cat-12th', '12th Standard Guides', '12th'],
  ];
  try {
    await client.connect();
    for (const [id, name, slug] of categories) {
      await client.query(
        `INSERT INTO categories (id, name, slug, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (id) DO NOTHING`,
        [id, name, slug]
      );
    }
    console.log(`✅ [${dbName}] Categories seeded`);
    await client.end();
  } catch (err) {
    console.error(`❌ Categories seed error [${dbName}]:`, err.message);
    if (client) await client.end();
  }
}

async function main() {
  let connectionString;
  try {
    const connected = await connectWithFallback('migration');
    connectionString = connected.connStr;
    await connected.client.end();

    const targetDbName = connectionString.split('/').pop().split('?')[0] || 'target_db';
    await migrateDatabase(connectionString, targetDbName);

    if (connectionString.endsWith('/railway') || connectionString.includes('/railway?')) {
      const postgresConnStr = connectionString.replace('/railway', '/postgres');
      await migrateDatabase(postgresConnStr, 'postgres');
    }

    console.log('✅ Database schema initialization complete.');
  } catch (err) {
    console.warn('⚠️ Build phase DB migration notice:', err.message);
    console.warn('   Schema initialization will automatically run on runtime startup.');
  }
}

main().catch((err) => {
  console.warn('⚠️ Build phase DB initialization notice:', err.message);
});
