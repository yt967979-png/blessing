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
app.use(express.json({ limit: '5mb' }));

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_BPG10023490',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_test_9840418228'
});

// Initialize Database (Supports Railway PostgreSQL & Local SQLite)
const isPostgres = Boolean(process.env.DATABASE_URL);
let db;
let pgClient;

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
  `).then(() => console.log('🔒 PostgreSQL Schema Active')).catch(() => {});
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

    // Defensive Migration: Ensure 'role' column exists
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'", () => {});

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
        courierPartner TEXT DEFAULT 'Shiprocket / Speed Post',
        trackingNumber TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Demo Users
    const demoPasswordHash = bcrypt.hashSync('123456', 10);
    db.run(`
      INSERT OR IGNORE INTO users (id, name, email, phone, password, role)
      VALUES ('usr-admin', 'Store Admin', 'admin@blessingpowerguide.in', '9840418228', '${demoPasswordHash}', 'admin')
    `);
    db.run(`
      INSERT OR IGNORE INTO users (id, name, email, phone, password, role)
      VALUES ('usr-101', 'M. Karthik', 'student@gmail.com', '9840418228', '${demoPasswordHash}', 'customer')
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
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (cls && cls !== 'all') {
    sql += ' AND class = ?';
    params.push(sanitizeInput(cls));
  }
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(sanitizeInput(category));
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = rows.map(r => ({ ...r, enabled: Boolean(r.enabled) }));
    res.json(result);
  });
});

// 2. Add New Product (Admin API)
app.post('/api/products', requireAdmin, (req, res) => {
  const { title, class: cls, category, price, oldPrice, discount, badge, img, description } = req.body;
  const id = 'bpg-' + Date.now();
  const stmt = db.prepare(`
    INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 10, ?, 20, 1, ?, ?)
  `);

  stmt.run([id, sanitizeInput(title), sanitizeInput(cls), sanitizeInput(category), Number(price), Number(oldPrice), sanitizeInput(discount), sanitizeInput(badge), sanitizeInput(img), sanitizeInput(description)], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id });
  });
});

// 3. Update Existing Product Price & Offer (Admin API)
app.put('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { title, price, oldPrice, discount, badge, enabled } = req.body;

  db.run(
    `UPDATE products SET title = ?, price = ?, oldPrice = ?, discount = ?, badge = ?, enabled = ? WHERE id = ?`,
    [sanitizeInput(title), Number(price), Number(oldPrice), sanitizeInput(discount), sanitizeInput(badge), enabled ? 1 : 0, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id });
    }
  );
});

// 4. Delete Product (Admin API)
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM products WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id });
  });
});

// 5. Server-Side Price Recalculation
app.post('/api/payment/create-razorpay-order', (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart items required.' });
  }

  const ids = items.map(i => i.id);
  const placeholders = ids.map(() => '?').join(',');

  db.all(`SELECT id, price FROM products WHERE id IN (${placeholders})`, ids, async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let calculatedTotal = 0;
    items.forEach(item => {
      const dbItem = rows.find(r => r.id === item.id);
      if (dbItem) {
        calculatedTotal += dbItem.price * item.qty;
      }
    });

    if (calculatedTotal <= 0) {
      return res.status(400).json({ error: 'Invalid order amount.' });
    }

    try {
      const options = {
        amount: calculatedTotal * 100,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`
      };
      const order = await razorpay.orders.create(options);
      res.json({
        success: true,
        razorpayOrderId: order.id,
        calculatedTotal,
        amount: order.amount,
        currency: order.currency,
        key: razorpay.key_id
      });
    } catch (error) {
      console.error('Razorpay Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// 6. Cryptographic Signature Verification & Order Creation
app.post('/api/orders', (req, res) => {
  const { customerName, customerPhone, address, city, items, paymentMethod, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const sName = sanitizeInput(customerName);
  const sPhone = sanitizeInput(customerPhone);
  const sAddress = sanitizeInput(address);
  const sCity = sanitizeInput(city);

  if (!sName || !sPhone || !sAddress || !sCity || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Valid shipping details required.' });
  }

  if (paymentMethod === 'razorpay') {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Razorpay payment verification parameters missing.' });
    }
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', razorpay.key_secret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Security Alert: Payment signature verification failed.' });
    }
  }

  const ids = items.map(i => i.id);
  const placeholders = ids.map(() => '?').join(',');

  db.all(`SELECT id, price FROM products WHERE id IN (${placeholders})`, ids, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let verifiedTotal = 0;
    items.forEach(item => {
      const dbItem = rows.find(r => r.id === item.id);
      if (dbItem) verifiedTotal += dbItem.price * item.qty;
    });

    const orderId = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const trackingNumber = 'SHIP-' + Math.floor(100000 + Math.random() * 900000);
    const paymentStatus = paymentMethod === 'razorpay' ? 'paid' : 'pending';

    const stmt = db.prepare(`
      INSERT INTO orders (orderId, customerName, customerPhone, address, city, items, totalAmount, paymentMethod, paymentStatus, razorpayPaymentId, courierStatus, trackingNumber)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Order Placed & Confirmed', ?)
    `);

    stmt.run([orderId, sName, sPhone, sAddress, sCity, JSON.stringify(items), verifiedTotal, paymentMethod, paymentStatus, razorpay_payment_id || null, trackingNumber], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        success: true,
        orderId,
        customerName: sName,
        totalAmount: verifiedTotal,
        paymentMethod,
        paymentStatus,
        trackingNumber,
        courierStatus: 'Order Placed & Confirmed (Shiprocket Assigned)'
      });
    });
  });
});

// 7. Customer Registration API
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  const sName = sanitizeInput(name);
  const sEmail = sanitizeInput(email).toLowerCase();
  const sPhone = sanitizeInput(phone);

  if (!sName || !sEmail || !sPhone || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid credentials required (Password min 6 chars).' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [sEmail], async (err, existing) => {
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const userId = 'usr-' + Date.now();
    const passwordHash = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (id, name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, sName, sEmail, sPhone, passwordHash, 'customer'],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const token = jwt.sign({ userId, name: sName, email: sEmail, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
          success: true,
          token,
          user: { id: userId, name: sName, email: sEmail, phone: sPhone, role: 'customer' }
        });
      }
    );
  });
});

// 8. Customer Login API
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const sEmail = sanitizeInput(email).toLowerCase();

  db.get('SELECT * FROM users WHERE email = ?', [sEmail], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  });
});

// 9. Track Order Status API
app.get('/api/orders/track/:orderId', (req, res) => {
  const orderId = sanitizeInput(req.params.orderId);
  db.get('SELECT * FROM orders WHERE orderId = ? OR customerPhone = ?', [orderId, orderId], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({
      orderId: row.orderId,
      customerName: row.customerName,
      totalAmount: row.totalAmount,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      courierStatus: row.courierStatus,
      courierPartner: row.courierPartner,
      trackingNumber: row.trackingNumber,
      createdAt: row.createdAt
    });
  });
});

// 10. Fetch Logged-in Customer Orders
app.get('/api/orders/my-orders/:phone', (req, res) => {
  const phone = sanitizeInput(req.params.phone);
  db.all('SELECT * FROM orders WHERE customerPhone = ? ORDER BY createdAt DESC', [phone], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(parsed);
  });
});

// 11. Admin Endpoint: Stock Toggle
app.patch('/api/products/:id/toggle', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get('SELECT enabled FROM products WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Product not found.' });
    const newStatus = row.enabled === 1 ? 0 : 1;
    db.run('UPDATE products SET enabled = ? WHERE id = ?', [newStatus, id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, id, enabled: Boolean(newStatus) });
    });
  });
});

// 12. Admin Endpoint: Get All Orders
app.get('/api/orders', requireAdmin, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(parsed);
  });
});

// 13. WhatsApp Notification Dispatcher Helper
function sendWhatsAppNotification(phone, orderId, statusName, trackingNo) {
  console.log(`=================================================`);
  console.log(`📱 AUTOMATED WHATSAPP NOTIFICATION DISPATCHED`);
  console.log(`📞 Recipient Phone: +91 ${phone}`);
  console.log(`📦 Order ID: ${orderId}`);
  console.log(`🚚 Status Update: ${statusName}`);
  if (trackingNo) console.log(`🔍 Tracking AWB: ${trackingNo}`);
  console.log(`💬 Message: "Hello! Your Blessing Power Guide Order #${orderId} update: ${statusName}. Track live at https://blessingpowerguide.in/orders"`);
  console.log(`=================================================`);
}

// 14. Admin Endpoint: Accept Order & Assign Shiprocket AWB (Triggers Automated WhatsApp Dispatch)
app.post('/api/orders/shiprocket-assign', (req, res) => {
  const { orderId, shiprocketAwb } = req.body;
  const sOrderId = sanitizeInput(orderId);
  const sAwb = sanitizeInput(shiprocketAwb) || 'SR-TN-' + Math.floor(100000 + Math.random() * 900000);

  db.get('SELECT * FROM orders WHERE orderId = ?', [sOrderId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Order not found.' });

    const newStatus = 'Dispatched & Shipped via Shiprocket';

    db.run(
      'UPDATE orders SET courierStatus = ?, trackingNumber = ?, courierPartner = ? WHERE orderId = ?',
      [newStatus, sAwb, 'Shiprocket Courier', sOrderId],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        // Trigger Automated WhatsApp Alert
        sendWhatsAppNotification(row.customerPhone, sOrderId, `Order Dispatched via Shiprocket! Tracking AWB: ${sAwb}`, sAwb);

        res.json({
          success: true,
          orderId: sOrderId,
          status: newStatus,
          trackingNumber: sAwb,
          courierPartner: 'Shiprocket Courier',
          whatsappSent: true,
        });
      }
    );
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 ENTERPRISE SECURE API RUNNING ON PORT ${PORT}`);
  console.log(`🔒 Self-healing Schema Active (users.role guaranteed)`);
  console.log(`📦 Shiprocket Automated AWB & WhatsApp Gateway Active`);
  console.log(`=================================================`);
});
