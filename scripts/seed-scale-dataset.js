/**
 * Realistic Large-Scale Dataset Seeder for Blessing Power Guide
 * Matches exact schema of PostgreSQL tables: categories, books, users, orders, order_items
 */

const { Pool } = require('pg');

const connectionString = process.env.STAGING_DB_URL || process.argv[2] || 'postgresql://blessing:blessing2025@localhost:5432/blessing_staging';
const pool = new Pool({ connectionString, max: 10 });

const CLASSES = ['6th Standard', '7th Standard', '8th Standard', '9th Standard', '10th Standard', '11th Standard', '12th Standard'];
const MEDIUMS = ['Tamil Medium', 'English Medium'];
const SUBJECTS = [
  'Tamil', 'English', 'Mathematics', 'Science', 'Social Science',
  'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Accountancy', 'Economics', 'Commerce'
];

const TN_CITIES = [
  { city: 'Chennai', pincode: '600001' },
  { city: 'Coimbatore', pincode: '641001' },
  { city: 'Madurai', pincode: '625001' },
  { city: 'Tiruchirappalli', pincode: '620001' },
  { city: 'Salem', pincode: '636001' },
  { city: 'Tirunelveli', pincode: '627001' },
  { city: 'Erode', pincode: '638001' },
  { city: 'Vellore', pincode: '632001' },
  { city: 'Thanjavur', pincode: '613001' },
  { city: 'Dindigul', pincode: '624001' },
];

const FIRST_NAMES = ['Senthil', 'Karthik', 'Priya', 'Anitha', 'Saravanan', 'Meenakshi', 'Vijay', 'Deepa', 'Balaji', 'Kavitha', 'Murugan', 'Saritha', 'Ramesh', 'Revathi', 'Ganesh', 'Lakshmi', 'Venkatesh', 'Bhavani', 'Manikandan', 'Radha'];
const LAST_NAMES = ['Kumar', 'Natarajan', 'Raja', 'Sundaram', 'Chandran', 'Subramanian', 'Swamy', 'Iyer', 'Pillai', 'Pandian', 'Ganesan', 'Nadar', 'Sekar', 'Mani', 'Vasan', 'Anand', 'Palani', 'Prasad', 'Naidu', 'Thevar'];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

async function seed() {
  console.log('================================================================');
  console.log('🌱 SEEDING REALISTIC LARGE-SCALE DATASET INTO STAGING DB');
  console.log(`Target: ${connectionString.replace(/:[^:@/]+@/, ':***@')}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    // 1. Categories
    console.log('1. Ensuring categories exist...');
    const catMap = new Map();
    for (const cls of CLASSES) {
      const catId = `cat-${slugify(cls)}`;
      await client.query(
        `INSERT INTO categories (id, name, slug, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (id) DO NOTHING;`,
        [catId, cls, slugify(cls)]
      );
      catMap.set(cls, catId);
    }
    console.log('   ✅ Categories verified.');

    // 2. 500+ Books
    console.log('\n2. Generating 500+ realistic educational guide books...');
    const bookIds = [];
    let bookIndex = 1;

    const SERIES_TYPES = [
      { prefix: 'FULL GUIDE', desc: 'Complete line-by-line textbook solutions, grammar, and unit tests', priceAdd: 0 },
      { prefix: 'PTA & CENTUM QUESTION BANK', desc: 'PTA model papers, Govt question papers, and Centum scoring strategy', priceAdd: 30 },
      { prefix: 'ONE-MARK & OBJECTIVE MASTER', desc: 'Comprehensive one-mark questions, objective drills, and quick revision', priceAdd: -40 },
      { prefix: 'SOLVED BOARD EXAM PAPERS', desc: 'Past 10-year official public exam question papers with full answer keys', priceAdd: 20 },
    ];

    for (const cls of CLASSES) {
      for (const subj of SUBJECTS) {
        for (const medium of MEDIUMS) {
          for (const series of SERIES_TYPES) {
            if (bookIndex > 550) break;
            const board = (subj === 'Physics' || subj === 'Chemistry' || subj === 'Mathematics') && bookIndex % 4 === 0 ? 'CBSE' : 'Tamil Nadu State Board';
            const title = `${cls.toUpperCase()} ${subj.toUpperCase()} ${series.prefix} (${medium.toUpperCase()}) — 2026 EDITION`;
            const slug = `${slugify(cls)}-${slugify(subj)}-${slugify(series.prefix)}-${slugify(medium)}-${bookIndex}`;
            const bookId = `bpg-book-${String(bookIndex).padStart(4, '0')}`;
            const price = 250 + series.priceAdd + (bookIndex % 15) * 10;
            const discountPrice = price - 35;
            const stock = 20 + (bookIndex % 80);
            const catId = catMap.get(cls) || 'cat-10th-standard';

            await client.query(
              `INSERT INTO books (
                id, title, slug, isbn, author, publisher, edition, language,
                department, subject, category_id, description, price, discount_price,
                stock, pages, weight, cover_image, status, featured
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20
              ) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price;`,
              [
                bookId,
                title,
                slug,
                `978-81-${9486000 + bookIndex}-${bookIndex % 10}`,
                'Blessing Editorial Board',
                'Blessing Pathway Education (OPC) Private Limited',
                '2026 Exam Edition',
                medium,
                cls,
                subj,
                catId,
                `Official Blessing Power Guide for ${cls} ${subj} (${board}, ${medium}) - ${series.prefix}. ${series.desc}.`,
                price,
                discountPrice,
                stock,
                200 + (bookIndex % 120),
                '420g',
                '/bpg-og-emblem.png',
                'published',
                bookIndex % 10 === 0
              ]
            );

            bookIds.push({ id: bookId, title, price: discountPrice });
            bookIndex++;
          }
        }
      }
    }
    console.log(`   ✅ Inserted ${bookIds.length} realistic books.`);

    // 3. 2,000 Users
    console.log('\n3. Generating 2,000 realistic Tamil Nadu users...');
    const userIds = [];
    const dummyPasswordHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';

    for (let i = 1; i <= 2000; i++) {
      const fn = FIRST_NAMES[i % FIRST_NAMES.length];
      const ln = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const name = `${fn} ${ln}`;
      const phone = `9${String(100000000 + i).slice(1)}`;
      const email = `customer_${i}@blessingpowerguide.in`;
      const userId = `usr_scale_${String(i).padStart(5, '0')}`;

      await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'customer', 'active', NOW() - ($6 || ' days')::interval)
         ON CONFLICT (id) DO NOTHING;`,
        [userId, name, email, phone, dummyPasswordHash, (i % 180)]
      );

      userIds.push({ id: userId, name, phone });
    }
    console.log(`   ✅ Inserted ${userIds.length} users.`);

    // 4. 2,500 Orders & Items
    console.log('\n4. Generating 2,500 realistic orders with order items & tracking...');
    const statuses = ['Confirmed', 'PACKED', 'DISPATCHED', 'DELIVERED'];
    const payMethods = ['Razorpay UPI', 'Razorpay Netbanking', 'Razorpay Card', 'Cash on Delivery'];

    for (let i = 1; i <= 2500; i++) {
      const orderId = `ord_scale_${String(i).padStart(6, '0')}`;
      const orderNumber = `BPG-SCL-${String(i).padStart(6, '0')}`;
      const user = userIds[i % userIds.length];
      const cityObj = TN_CITIES[i % TN_CITIES.length];
      const status = statuses[i % statuses.length];
      const payMethod = payMethods[i % payMethods.length];

      // Select 1 to 4 books for order
      const itemCount = 1 + (i % 4);
      const items = [];
      let subtotal = 0;

      for (let j = 0; j < itemCount; j++) {
        const book = bookIds[(i * 3 + j) % bookIds.length];
        const qty = 1 + (j % 2);
        items.push({
          id: book.id,
          title: book.title,
          price: book.price,
          qty,
          subtotal: book.price * qty,
        });
        subtotal += book.price * qty;
      }

      const shippingCharge = subtotal >= 1000 ? 0 : 50;
      const totalAmount = subtotal + shippingCharge;

      const shippingAddress = JSON.stringify({
        name: user.name,
        phone: user.phone,
        address: `No. ${(i % 120) + 1}, West Cross Street, ${cityObj.city}`,
        city: cityObj.city,
        state: 'Tamil Nadu',
        pincode: cityObj.pincode,
      });

      const daysAgo = i % 180;
      await client.query(
        `INSERT INTO orders (
          id, order_number, user_id, subtotal, discount, shipping_charge, tax,
          total_amount, payment_method, payment_status, order_status,
          shipping_address, ordered_at, courier_name, courier_status
        ) VALUES (
          $1, $2, $3, $4, 0, $5, 0,
          $6, $7, 'PAID', $8,
          $9, NOW() - ($10 || ' days')::interval, 'ST Courier Express', $11
        ) ON CONFLICT (id) DO NOTHING;`,
        [
          orderId,
          orderNumber,
          user.id,
          subtotal,
          shippingCharge,
          totalAmount,
          payMethod,
          status,
          shippingAddress,
          daysAgo,
          status === 'DELIVERED' ? 'Delivered' : 'In Transit'
        ]
      );

      // Insert order items
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        await client.query(
          `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING;`,
          [`item_${orderId}_${j}`, orderId, item.id, item.title, item.price, item.qty, item.subtotal]
        );
      }
    }
    console.log('   ✅ Inserted 2,500 realistic orders and all order_items.');

    // 5. Final Row Count Validation
    console.log('\n================================================================');
    console.log('📊 DATASET SEEDING SUMMARY');
    console.log('================================================================');
    const bCount = (await client.query('SELECT COUNT(*) FROM books;')).rows[0].count;
    const uCount = (await client.query('SELECT COUNT(*) FROM users;')).rows[0].count;
    const oCount = (await client.query('SELECT COUNT(*) FROM orders;')).rows[0].count;
    const oiCount = (await client.query('SELECT COUNT(*) FROM order_items;')).rows[0].count;
    const cCount = (await client.query('SELECT COUNT(*) FROM categories;')).rows[0].count;

    console.log(`  - Total Books in Staging DB:       ${bCount}`);
    console.log(`  - Total Users in Staging DB:       ${uCount}`);
    console.log(`  - Total Orders in Staging DB:      ${oCount}`);
    console.log(`  - Total Order Items in Staging DB: ${oiCount}`);
    console.log(`  - Total Categories in Staging DB:  ${cCount}`);
    console.log('================================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
