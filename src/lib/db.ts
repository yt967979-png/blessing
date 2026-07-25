import { Client } from 'pg';

export const defaultSeedCategories = [
  { id: 'cat-6th', name: '6th Standard Guides', slug: '6th-std', parent_category: null },
  { id: 'cat-7th', name: '7th Standard Guides', slug: '7th-std', parent_category: null },
  { id: 'cat-8th', name: '8th Standard Guides', slug: '8th-std', parent_category: null },
  { id: 'cat-9th', name: '9th Standard Guides', slug: '9th-std', parent_category: null },
  { id: 'cat-10th', name: '10th Standard Guides', slug: '10th-std', parent_category: null },
  { id: 'cat-11th', name: '11th Standard Guides', slug: '11th-std', parent_category: null },
  { id: 'cat-12th', name: '12th Standard Guides', slug: '12th-std', parent_category: null },
  { id: 'cat-combos', name: '5-Subject Super Combos', slug: 'combos', parent_category: null },
];

export const defaultSeedBooks = [
  {
    id: 'bpg-101',
    title: '10th Standard Mathematics Master Guide',
    slug: '10th-maths-master-guide',
    isbn: '978-81-984041-0-1',
    author: 'Blessing Expert Mathematics Panel',
    publisher: 'Blessing Pathway Education (OPC) Pvt Ltd',
    edition: '2026 Edition',
    language: 'English & Tamil',
    subject: 'Mathematics',
    category_id: 'cat-10th',
    description: 'Complete 10th Maths guide with chapter-wise solved model question papers for State Board.',
    price: 220,
    discount_price: 180,
    stock: 50,
    pages: 320,
    weight: '450g',
    cover_image: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80',
    status: 'published',
    featured: true,
  },
  {
    id: 'bpg-102',
    title: '10th Standard Science Guide (Physics, Chem, Bio)',
    slug: '10th-science-master-guide',
    isbn: '978-81-984041-0-2',
    author: 'Blessing Science Faculty Panel',
    publisher: 'Blessing Pathway Education (OPC) Pvt Ltd',
    edition: '2026 Edition',
    language: 'English & Tamil',
    subject: 'Science',
    category_id: 'cat-10th',
    description: 'Comprehensive 10th Science study guide covering diagrams, formulas and solved Q&A.',
    price: 240,
    discount_price: 190,
    stock: 45,
    pages: 280,
    weight: '420g',
    cover_image: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80',
    status: 'published',
    featured: true,
  },
  {
    id: 'bpg-103',
    title: '12th Standard Physics Master Guide (Model Q&A Papers)',
    slug: '12th-physics-master-guide',
    isbn: '978-81-984041-0-3',
    author: 'Blessing Senior Physics Panel',
    publisher: 'Blessing Pathway Education (OPC) Pvt Ltd',
    edition: '2026 Edition',
    language: 'English',
    subject: 'Physics',
    category_id: 'cat-12th',
    description: 'High-score 12th Physics master guide covering numerical problems and board exam papers.',
    price: 260,
    discount_price: 210,
    stock: 60,
    pages: 350,
    weight: '500g',
    cover_image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    status: 'published',
    featured: true,
  },
  {
    id: 'bpg-104',
    title: '10th Standard All-in-One 5 Subject Super Combo Pack',
    slug: '10th-5-subject-super-combo',
    isbn: '978-81-984041-0-4',
    author: 'Blessing Multi-Subject Board',
    publisher: 'Blessing Pathway Education (OPC) Pvt Ltd',
    edition: '2026 Edition',
    language: 'Tamil & English',
    subject: 'All 5 Subjects',
    category_id: 'cat-combos',
    description: 'Save ₹260 with the Complete 10th Standard 5-Book Bundle (Maths, Science, Social, Tamil, English).',
    price: 1050,
    discount_price: 790,
    stock: 30,
    pages: 1400,
    weight: '2100g',
    cover_image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80',
    status: 'published',
    featured: true,
  },
];

let isSchemaInitialized = false;

const RAILWAY_DB_FALLBACK = "postgresql://postgres:USdOHOzspyXMPFmDnfsjkxoSIGedYwgk@sakura.proxy.rlwy.net:32874/railway";

export async function getDbClient() {
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
    connectionString = RAILWAY_DB_FALLBACK;
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('railway') || connectionString.includes('render') || connectionString.includes('rlwy.net')
      ? { rejectUnauthorized: false }
      : false,
  });
  await client.connect();

  if (!isSchemaInitialized) {
    isSchemaInitialized = true;

  // Create pg_stat_statements extension for Railway Data UI panel
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
  } catch (e) {}

  // Create Full 17-Table Relational Database Schema
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

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
  `);

  // Pre-seed Categories if empty
  const catRes = await client.query('SELECT COUNT(*) FROM categories');
  if (Number(catRes.rows[0].count) === 0) {
    for (const c of defaultSeedCategories) {
      await client.query(
        `INSERT INTO categories (id, name, slug, parent_category) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [c.id, c.name, c.slug, c.parent_category]
      );
    }
  }

  // Pre-seed Books if empty
  const bookRes = await client.query('SELECT COUNT(*) FROM books');
  if (Number(bookRes.rows[0].count) === 0) {
    for (const b of defaultSeedBooks) {
      await client.query(
        `INSERT INTO books (id, title, slug, isbn, author, publisher, edition, language, subject, category_id, description, price, discount_price, stock, pages, weight, cover_image, status, featured)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING`,
        [b.id, b.title, b.slug, b.isbn, b.author, b.publisher, b.edition, b.language, b.subject, b.category_id, b.description, b.price, b.discount_price, b.stock, b.pages, b.weight, b.cover_image, b.status, b.featured]
      );
    }
  }
  }

  return client;
}
