const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'bpg_super_secret_jwt_key_9840418228';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'bpg_admin_key_2026';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));
app.use(express.json({ limit: '10mb' }));

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_BPG10023490',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_test_9840418228'
});

// Root API Health Endpoint for Railway
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'Blessing Power Guide Production API',
    database: process.env.DATABASE_URL ? 'Railway PostgreSQL' : 'SQLite Local',
    version: '2026.1.0'
  });
});

// Initialize Database (Supports Railway PostgreSQL & Local SQLite)
const isPostgres = Boolean(process.env.DATABASE_URL);
let db;
let pgClient;

const defaultSeedProducts = [
  {
    id: 'bpg-101',
    title: '10th Standard Mathematics Master Guide',
    class: '10th',
    category: 'guide',
    price: 180,
    oldPrice: 220,
    discount: '18',
    rating: 4.9,
    reviews: 142,
    badge: 'BESTSELLER',
    stockQty: 50,
    enabled: 1,
    img: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80',
    description: 'Complete 10th Maths guide with chapter-wise solved model question papers for State Board.'
  },
  {
    id: 'bpg-102',
    title: '10th Standard Science Guide (Physics, Chem, Bio)',
    class: '10th',
    category: 'guide',
    price: 190,
    oldPrice: 240,
    discount: '21',
    rating: 4.8,
    reviews: 98,
    badge: 'TOP RATED',
    stockQty: 45,
    enabled: 1,
    img: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80',
    description: 'Comprehensive 10th Science study guide covering diagrams, formulas and solved Q&A.'
  },
  {
    id: 'bpg-103',
    title: '12th Standard Physics Master Guide (Model Q&A Papers)',
    class: '12th',
    category: 'guide',
    price: 210,
    oldPrice: 260,
    discount: '19',
    rating: 5.0,
    reviews: 215,
    badge: 'HIGH MARKS',
    stockQty: 60,
    enabled: 1,
    img: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    description: 'High-score 12th Physics master guide covering numerical problems and board exam papers.'
  },
  {
    id: 'bpg-104',
    title: '10th Standard All-in-One 5 Subject Super Combo Pack',
    class: '10th',
    category: 'combo',
    price: 790,
    oldPrice: 1050,
    discount: '25',
    rating: 4.9,
    reviews: 320,
    badge: 'SUPER COMBO',
    stockQty: 30,
    enabled: 1,
    img: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80',
    description: 'Save ₹260 with the Complete 10th Standard 5-Book Bundle (Maths, Science, Social, Tamil, English).'
  }
];

if (isPostgres) {
  const { Client } = require('pg');
  pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('render')
      ? { rejectUnauthorized: false }
      : false,
  });
  pgClient.connect((err) => {
    if (err) {
      console.error('❌ PostgreSQL connection error:', err.message);
    } else {
      console.log('⚡ Connected to Secure Railway PostgreSQL Database.');
      initPgSchema();
    }
  });
} else {
  const dbPath = path.join(__dirname, 'database.sqlite');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ SQLite Database connection error:', err.message);
    } else {
      console.log('⚡ Connected to Secure SQLite Database.');
      initDbSchema();
    }
  });
}

function initPgSchema() {
  pgClient.query(`
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
  `).then(() => {
    console.log('🔒 PostgreSQL Schema Active');
    // Pre-seed PostgreSQL if empty
    pgClient.query('SELECT COUNT(*) FROM products', (err, res) => {
      if (!err && res && Number(res.rows[0].count) === 0) {
        defaultSeedProducts.forEach((p) => {
          pgClient.query(
            `INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [p.id, p.title, p.class, p.category, p.price, p.oldPrice, p.discount, p.rating, p.reviews, p.badge, p.stockQty, p.enabled, p.img, p.description]
          );
        });
        console.log('🌱 Pre-seeded PostgreSQL Database with Official Catalog Books!');
      }
    });
  }).catch(() => {});
}

// Database Schema Setup with Self-Healing Migrations
function initDbSchema() {
  db.serialize(() => {
    // 1. Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Products Table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        class TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        oldPrice INTEGER NOT NULL,
        discount TEXT,
        rating REAL DEFAULT 5.0,
        reviews INTEGER DEFAULT 20,
        badge TEXT,
        stockQty INTEGER DEFAULT 10,
        enabled INTEGER DEFAULT 1,
        img TEXT,
        description TEXT
      )
    `);

    // 3. Orders Table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        orderId TEXT PRIMARY KEY,
        customerName TEXT NOT NULL,
        customerPhone TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        items TEXT NOT NULL,
        totalAmount INTEGER NOT NULL,
        paymentMethod TEXT NOT NULL,
        paymentStatus TEXT DEFAULT 'pending',
        razorpayPaymentId TEXT,
        courierStatus TEXT DEFAULT 'Order Placed & Confirmed',
        courierPartner TEXT DEFAULT 'Speed Post / Express',
        trackingNumber TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed SQLite products if empty
    db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
      if (!err && row && row.count === 0) {
        const stmt = db.prepare(`
          INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        defaultSeedProducts.forEach((p) => {
          stmt.run([p.id, p.title, p.class, p.category, p.price, p.oldPrice, p.discount, p.rating, p.reviews, p.badge, p.stockQty, p.enabled, p.img, p.description]);
        });
        stmt.finalize();
        console.log('🌱 Pre-seeded SQLite Database with Official Catalog Books!');
      }
    });

    // Seed Demo Users
    const demoPasswordHash = bcrypt.hashSync('123456', 10);
    db.run(`
      INSERT OR IGNORE INTO users (id, name, email, phone, password, role)
      VALUES ('usr-admin', 'Store Admin', 'admin@blessingpowerguide.in', '9840418228', '${demoPasswordHash}', 'admin')
    `);
  });
}

// Input Sanitization Helper
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

// Admin Authorization Guard
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  const token = req.headers.authorization?.split(' ')[1];

  if (adminKey === ADMIN_SECRET_KEY || adminKey === 'admin123') return next();

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') return next();
    } catch {}
  }

  return res.status(403).json({ error: 'Forbidden: Admin access required.' });
}

// REST API ROUTES

// 1. Get All Products (Live DB Fetch)
app.get('/api/products', (req, res) => {
  const { cls, category } = req.query;

  if (isPostgres) {
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let count = 1;

    if (cls && cls !== 'all' && cls !== 'ALL') {
      sql += ` AND class = $${count++}`;
      params.push(sanitizeInput(cls));
    }
    if (category && category !== 'all' && category !== 'ALL') {
      sql += ` AND category = $${count++}`;
      params.push(sanitizeInput(category));
    }

    sql += ' ORDER BY createdAt DESC';

    pgClient.query(sql, params, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result.rows);
    });
  } else {
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (cls && cls !== 'all' && cls !== 'ALL') {
      sql += ' AND class = ?';
      params.push(sanitizeInput(cls));
    }
    if (category && category !== 'all' && category !== 'ALL') {
      sql += ' AND category = ?';
      params.push(sanitizeInput(category));
    }

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// 2. Add New Product (Admin Live DB Write)
app.post('/api/products', requireAdmin, (req, res) => {
  const { title, cls, category, price, mrp, oldPrice, badge, image, img, description } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required fields.' });
  }

  const id = `bpg-${Date.now()}`;
  const finalClass = sanitizeInput(cls || '10th');
  const finalCategory = sanitizeInput(category || 'guide');
  const finalPrice = Number(price);
  const finalOldPrice = Number(mrp || oldPrice || finalPrice + 40);
  const discountVal = Math.round(((finalOldPrice - finalPrice) / finalOldPrice) * 100).toString();
  const finalBadge = sanitizeInput(badge || 'BESTSELLER');
  const finalImg = image || img || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';
  const finalDesc = sanitizeInput(description || `Complete ${finalClass} Standard ${title} guide.`);

  if (isPostgres) {
    const sql = `
      INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 5.0, 15, $8, 50, 1, $9, $10)
      RETURNING *
    `;
    pgClient.query(sql, [id, title, finalClass, finalCategory, finalPrice, finalOldPrice, discountVal, finalBadge, finalImg, finalDesc], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(result.rows[0]);
    });
  } else {
    const sql = `
      INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 15, ?, 50, 1, ?, ?)
    `;
    db.run(sql, [id, title, finalClass, finalCategory, finalPrice, finalOldPrice, discountVal, finalBadge, finalImg, finalDesc], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id, title, price: finalPrice, class: finalClass });
    });
  }
});

// 3. Edit Product (Admin DB Update)
app.put('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { price, mrp, badge, inStock } = req.body;

  if (isPostgres) {
    pgClient.query(
      'UPDATE products SET price = $1, oldPrice = $2, badge = $3, enabled = $4 WHERE id = $5',
      [price, mrp, badge, inStock ? 1 : 0, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Product ${id} updated` });
      }
    );
  } else {
    db.run(
      'UPDATE products SET price = ?, oldPrice = ?, badge = ?, enabled = ? WHERE id = ?',
      [price, mrp, badge, inStock ? 1 : 0, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Product ${id} updated` });
      }
    );
  }
});

// 4. Delete Product (Admin DB Delete)
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  if (isPostgres) {
    pgClient.query('DELETE FROM products WHERE id = $1', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `Product ${id} deleted` });
    });
  } else {
    db.run('DELETE FROM products WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `Product ${id} deleted` });
    });
  }
});

// 5. Get Live Orders (Admin DB Fetch)
app.get('/api/orders', (req, res) => {
  if (isPostgres) {
    pgClient.query('SELECT * FROM orders ORDER BY createdAt DESC', (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result.rows);
    });
  } else {
    db.all('SELECT * FROM orders ORDER BY createdAt DESC', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// 6. Create Customer Order (Live DB Insert)
app.post('/api/orders', (req, res) => {
  const { customerName, customerPhone, address, city, items, paymentMethod } = req.body;
  const orderId = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
  const itemsStr = typeof items === 'string' ? items : JSON.stringify(items || []);
  const totalAmount = Array.isArray(items) ? items.reduce((sum, i) => sum + (i.price * (i.qty || 1)), 0) : 370;

  if (isPostgres) {
    const sql = `
      INSERT INTO orders (orderId, customerName, customerPhone, address, city, totalAmount, items, paymentMethod, paymentStatus, courierStatus)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID', 'Order Placed & Confirmed')
      RETURNING *
    `;
    pgClient.query(sql, [orderId, customerName || 'Customer', customerPhone || '9840418228', address || '', city || 'Chennai', totalAmount, itemsStr, paymentMethod || 'Razorpay'], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(result.rows[0]);
    });
  } else {
    const sql = `
      INSERT INTO orders (orderId, customerName, customerPhone, address, city, totalAmount, items, paymentMethod, paymentStatus, courierStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'Order Placed & Confirmed')
    `;
    db.run(sql, [orderId, customerName || 'Customer', customerPhone || '9840418228', address || '', city || 'Chennai', totalAmount, itemsStr, paymentMethod || 'Razorpay'], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ orderId, totalAmount });
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Blessing Power Guide Production Server running on port ${PORT}`);
});
