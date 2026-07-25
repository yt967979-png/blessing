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
  `).then(() => {
    console.log('🔒 Railway PostgreSQL Schema Active with 6 Tables!');
    pgClient.query('SELECT COUNT(*) FROM products', (err, res) => {
      if (!err && res && Number(res.rows[0].count) === 0) {
        defaultSeedProducts.forEach((p) => {
          pgClient.query(
            `INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [p.id, p.title, p.class, p.category, p.price, p.oldPrice, p.discount, p.rating, p.reviews, p.badge, p.stockQty, p.enabled, p.img, p.description]
          );
        });
        console.log('🌱 Pre-seeded Railway PostgreSQL Database with Official Catalog Books!');
      }
    });
  }).catch((e) => console.error('Pg Init Error:', e));
}

function initDbSchema() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'customer', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, title TEXT NOT NULL, class TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, oldPrice INTEGER NOT NULL, discount TEXT, rating REAL DEFAULT 5.0, reviews INTEGER DEFAULT 20, badge TEXT, stockQty INTEGER DEFAULT 10, enabled INTEGER DEFAULT 1, img TEXT, description TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (orderId TEXT PRIMARY KEY, customerName TEXT NOT NULL, customerPhone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, items TEXT NOT NULL, totalAmount INTEGER NOT NULL, paymentMethod TEXT NOT NULL, paymentStatus TEXT DEFAULT 'pending', razorpayPaymentId TEXT, courierStatus TEXT DEFAULT 'Order Placed & Confirmed', courierPartner TEXT DEFAULT 'Speed Post / Express', trackingNumber TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS addresses (id TEXT PRIMARY KEY, userId TEXT, type TEXT DEFAULT 'HOME', name TEXT, phone TEXT, address TEXT NOT NULL, city TEXT, pincode TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS wishlists (id TEXT PRIMARY KEY, userId TEXT NOT NULL, productId TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, productId TEXT NOT NULL, studentName TEXT NOT NULL, classStd TEXT, rating REAL DEFAULT 5.0, reviewText TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  });
}

// REST API ROUTES
app.get('/api/products', (req, res) => {
  if (isPostgres) {
    pgClient.query('SELECT * FROM products ORDER BY createdAt DESC', (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result.rows);
    });
  } else {
    db.all('SELECT * FROM products', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
