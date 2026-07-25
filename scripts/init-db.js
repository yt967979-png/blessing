const { Client } = require('pg');

try {
  require('dotenv').config();
} catch (e) {}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log('⚠️ DATABASE_URL not set in environment. Skipping Railway PostgreSQL migration.');
  process.exit(0);
}

console.log('⚡ Connecting to Railway PostgreSQL Database...');

const client = new Client({
  connectionString,
  ssl: connectionString.includes('railway') || connectionString.includes('render')
    ? { rejectUnauthorized: false }
    : false,
});

async function migrate() {
  try {
    await client.connect();
    console.log('🔒 Executing 17-Table Schema Migration in Railway PostgreSQL...');

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
        courier_name VARCHAR(255) DEFAULT 'Speed Post / Express',
        tracking_url TEXT,
        estimated_delivery VARCHAR(100),
        invoice_number VARCHAR(255),
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
    `);

    console.log('✅ All 17 Database Tables Successfully Created in Railway PostgreSQL!');

    // Seed Categories
    await client.query(`
      INSERT INTO categories (id, name, slug) VALUES
      ('cat-6th', '6th Standard Guides', '6th-std'),
      ('cat-7th', '7th Standard Guides', '7th-std'),
      ('cat-8th', '8th Standard Guides', '8th-std'),
      ('cat-9th', '9th Standard Guides', '9th-std'),
      ('cat-10th', '10th Standard Guides', '10th-std'),
      ('cat-11th', '11th Standard Guides', '11th-std'),
      ('cat-12th', '12th Standard Guides', '12th-std'),
      ('cat-combos', '5-Subject Super Combos', 'combos')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed Official Books
    await client.query(`
      INSERT INTO books (id, title, slug, isbn, subject, category_id, price, discount_price, stock, cover_image, description) VALUES
      ('bpg-101', '10th Standard Mathematics Master Guide', '10th-maths-master-guide', '978-81-984041-0-1', 'Mathematics', 'cat-10th', 220, 180, 50, 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80', 'Complete 10th Maths guide with chapter-wise solved model question papers for State Board.'),
      ('bpg-102', '10th Standard Science Guide (Physics, Chem, Bio)', '10th-science-master-guide', '978-81-984041-0-2', 'Science', 'cat-10th', 240, 190, 45, 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80', 'Comprehensive 10th Science study guide covering diagrams, formulas and solved Q&A.'),
      ('bpg-103', '12th Standard Physics Master Guide (Model Q&A Papers)', '12th-physics-master-guide', '978-81-984041-0-3', 'Physics', 'cat-12th', 260, 210, 60, 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80', 'High-score 12th Physics master guide covering numerical problems and board exam papers.'),
      ('bpg-104', '10th Standard All-in-One 5 Subject Super Combo Pack', '10th-5-subject-super-combo', '978-81-984041-0-4', 'All 5 Subjects', 'cat-combos', 1050, 790, 30, 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80', 'Save ₹260 with the Complete 10th Standard 5-Book Bundle (Maths, Science, Social, Tamil, English).')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('🌱 Seeded Official Books and Categories into Railway PostgreSQL Database!');
    await client.end();
  } catch (err) {
    console.error('❌ PostgreSQL Migration Error:', err.message);
    if (client) await client.end();
  }
}

migrate();
