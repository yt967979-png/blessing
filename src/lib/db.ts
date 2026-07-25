import { Client } from 'pg';

export const defaultSeedProducts = [
  {
    id: 'bpg-101',
    title: '10th Standard Mathematics Master Guide',
    cls: '10th',
    category: 'guide',
    price: 180,
    mrp: 220,
    discount: 18,
    rating: 4.9,
    reviews: 142,
    badge: 'BESTSELLER',
    badgeColor: 'bg-blue-600',
    image: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80',
    description: 'Complete 10th Maths guide with chapter-wise solved model question papers for State Board.',
    inStock: true,
  },
  {
    id: 'bpg-102',
    title: '10th Standard Science Guide (Physics, Chem, Bio)',
    cls: '10th',
    category: 'guide',
    price: 190,
    mrp: 240,
    discount: 21,
    rating: 4.8,
    reviews: 98,
    badge: 'TOP RATED',
    badgeColor: 'bg-blue-600',
    image: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80',
    description: 'Comprehensive 10th Science study guide covering diagrams, formulas and solved Q&A.',
    inStock: true,
  },
  {
    id: 'bpg-103',
    title: '12th Standard Physics Master Guide (Model Q&A Papers)',
    cls: '12th',
    category: 'guide',
    price: 210,
    mrp: 260,
    discount: 19,
    rating: 5.0,
    reviews: 215,
    badge: 'HIGH MARKS',
    badgeColor: 'bg-blue-600',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    description: 'High-score 12th Physics master guide covering numerical problems and board exam papers.',
    inStock: true,
  },
  {
    id: 'bpg-104',
    title: '10th Standard All-in-One 5 Subject Super Combo Pack',
    cls: '10th',
    category: 'combo',
    price: 790,
    mrp: 1050,
    discount: 25,
    rating: 4.9,
    reviews: 320,
    badge: 'SUPER COMBO',
    badgeColor: 'bg-blue-600',
    image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80',
    description: 'Save ₹260 with the Complete 10th Standard 5-Book Bundle (Maths, Science, Social, Tamil, English).',
    inStock: true,
  },
];

export async function getDbClient() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    const client = new Client({
      connectionString,
      ssl: connectionString.includes('railway') || connectionString.includes('render')
        ? { rejectUnauthorized: false }
        : false,
    });
    await client.connect();

    // Ensure all 6 PostgreSQL database tables exist in Railway DB
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        class VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        price NUMERIC NOT NULL,
        oldPrice NUMERIC,
        discount NUMERIC,
        rating NUMERIC DEFAULT 5.0,
        reviews INT DEFAULT 10,
        badge VARCHAR(50),
        stockQty INT DEFAULT 20,
        enabled INT DEFAULT 1,
        img TEXT,
        description TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        orderId VARCHAR(255) PRIMARY KEY,
        customerName VARCHAR(255) NOT NULL,
        customerPhone VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(255),
        totalAmount NUMERIC NOT NULL,
        items TEXT NOT NULL,
        paymentMethod VARCHAR(50) DEFAULT 'Razorpay',
        paymentStatus VARCHAR(50) DEFAULT 'PAID',
        courierStatus VARCHAR(255) DEFAULT 'Order Placed & Confirmed',
        trackingNumber VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS addresses (
        id VARCHAR(255) PRIMARY KEY,
        userId VARCHAR(255),
        type VARCHAR(50) DEFAULT 'HOME',
        name VARCHAR(255),
        phone VARCHAR(255),
        address TEXT NOT NULL,
        city VARCHAR(255),
        pincode VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wishlists (
        id VARCHAR(255) PRIMARY KEY,
        userId VARCHAR(255) NOT NULL,
        productId VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id VARCHAR(255) PRIMARY KEY,
        productId VARCHAR(255) NOT NULL,
        studentName VARCHAR(255) NOT NULL,
        classStd VARCHAR(50),
        rating NUMERIC DEFAULT 5.0,
        reviewText TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Auto seed default products if table is empty
    const countRes = await client.query('SELECT COUNT(*) FROM products');
    if (Number(countRes.rows[0].count) === 0) {
      for (const p of defaultSeedProducts) {
        await client.query(
          `INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [p.id, p.title, p.cls, p.category, p.price, p.mrp, p.discount.toString(), p.rating, p.reviews, p.badge, 50, 1, p.image, p.description]
        );
      }
    }

    return client;
  }

  return null;
}
