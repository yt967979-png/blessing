const { Client } = require('pg');

try {
  require('dotenv').config();
} catch (e) {}

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
    const user = process.env.PGUSER;
    const pass = process.env.PGPASSWORD;
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
      } catch (_) {}
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
    } catch (e) {}

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
        status VARCHAR(50) NOT NULL,
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
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
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
        razorpay_key VARCHAR(255) DEFAULT 'rzp_test_BPG10023490',
        shiprocket_token TEXT,
        shipping_charge NUMERIC DEFAULT 0,
        tax_percentage NUMERIC DEFAULT 0
      );

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
      ALTER TABLE books ADD COLUMN IF NOT EXISTS stock INT DEFAULT 50;
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

      CREATE TABLE IF NOT EXISTS faqs (
        id VARCHAR(255) PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

const ADMIN_USERS = [
  {
    id: 'admin-bpg-001',
    name: process.env.ADMIN_NAME || 'Admin',
    email: process.env.ADMIN_EMAIL || 'admin@blessingpowerguide.com',
    phone: process.env.ADMIN_PHONE || '9840418228',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe@BPG2026',
    role: 'admin',
  },
];

const DEFAULT_COUPONS = [
  { id: 'cpn-first10', code: 'FIRST10', discount_type: 'percentage', discount_value: 10, minimum_amount: 0 },
  { id: 'cpn-blessing10', code: 'BLESSING10', discount_type: 'percentage', discount_value: 10, minimum_amount: 0 },
  { id: 'cpn-power20', code: 'POWER20', discount_type: 'percentage', discount_value: 20, minimum_amount: 500 },
  { id: 'cpn-student20', code: 'STUDENT20', discount_type: 'percentage', discount_value: 20, minimum_amount: 0 },
];

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
    answer: 'Yes! We support Cash on Delivery (COD) as well as secure online payments via Razorpay (UPI, Google Pay, PhonePe, Cards, Net Banking).',
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

async function seedAdmin(connStr, dbName) {
  const client = new Client({
    connectionString: normalizeConnectionString(connStr),
    ssl: sslFor(connStr),
  });

  try {
    await client.connect();

    try {
      await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS email_verified`);
    } catch (_) {}

    for (const admin of ADMIN_USERS) {
      const phone = String(admin.phone).replace(/\D/g, '').slice(-10);
      const email = String(admin.email).toLowerCase().trim();
      const passwordHash = hashPassword(admin.password);

      // Priority: match by email → fixed admin id → phone (never overwrite email if taken)
      const byEmail = await client.query(
        `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      const byId = await client.query(
        `SELECT id, email FROM users WHERE id = $1 LIMIT 1`,
        [admin.id]
      );
      const byPhone = await client.query(
        `SELECT id, email FROM users
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1
         LIMIT 1`,
        [phone]
      );

      let userId = admin.id;
      let targetRow = byEmail.rows[0] || byId.rows[0] || byPhone.rows[0] || null;

      if (!targetRow) {
        await client.query(
          `INSERT INTO users (id, name, email, phone, password_hash, role, status)
           VALUES ($1, $2, $3, $4, $5, 'admin', 'active')`,
          [userId, admin.name, email, phone, passwordHash]
        );
        console.log(`✅ [ADMIN CREATED] ${email} / phone ${phone}`);
      } else {
        userId = targetRow.id;
        const canSetEmail = !targetRow.email || String(targetRow.email).toLowerCase() === email;

        if (canSetEmail) {
          await client.query(
            `UPDATE users
             SET name = $1, email = $2, phone = $3, password_hash = $4,
                 role = 'admin', status = 'active', updated_at = NOW()
             WHERE id = $5`,
            [admin.name, email, phone, passwordHash, userId]
          );
        } else {
          // Email belongs to another account — only promote role + password, keep existing email
          await client.query(
            `UPDATE users
             SET name = $1, phone = $2, password_hash = $3,
                 role = 'admin', status = 'active', updated_at = NOW()
             WHERE id = $4`,
            [admin.name, phone, passwordHash, userId]
          );
          console.log(`⚠️  [ADMIN] Kept existing email "${targetRow.email}" (admin@ email already taken elsewhere)`);
        }
        console.log(`✅ [ADMIN UPDATED] id=${userId} → role: admin`);
      }

      await client.query(
        `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [`cart-${userId}`, userId]
      );

      console.log(`   Login phone: ${phone}`);
      console.log(`   Login email: ${email}`);
      console.log(`   Password: ${admin.password}`);
    }

    await client.end();
  } catch (err) {
    console.error(`❌ Admin seed error [${dbName}]:`, err.message);
    if (client) await client.end();
  }
}

async function seedCouponsAndFaqs(connStr, dbName) {
  const client = new Client({
    connectionString: normalizeConnectionString(connStr),
    ssl: sslFor(connStr),
  });

  try {
    await client.connect();

    for (const coupon of DEFAULT_COUPONS) {
      await client.query(
        `INSERT INTO coupons (id, code, discount_type, discount_value, minimum_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (code) DO NOTHING`,
        [coupon.id, coupon.code, coupon.discount_type, coupon.discount_value, coupon.minimum_amount]
      );
    }
    console.log(`✅ [${dbName}] Coupons seeded`);

    for (const faq of DEFAULT_FAQS) {
      await client.query(
        `INSERT INTO faqs (id, question, answer, display_order, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (id) DO NOTHING`,
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

    await seedCategories(connectionString, targetDbName);
    await seedAdmin(connectionString, targetDbName);
    await seedCouponsAndFaqs(connectionString, targetDbName);
    console.log('✅ Database initialization complete.');
  } catch (err) {
    console.warn('⚠️ Build phase DB migration notice:', err.message);
    console.warn('   Schema initialization will automatically run on runtime startup.');
  }
}

main().catch((err) => {
  console.warn('⚠️ Build phase DB initialization notice:', err.message);
});
