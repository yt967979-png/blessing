const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing' });

async function main() {
  try {
    // 1. Cleanse bpg-1790336858543 (10th Standard Tamil Book)
    await pool.query(
      `UPDATE books 
       SET category_id = 'cat-10th', combo_subjects = '[]'::jsonb 
       WHERE id = 'bpg-1790336858543'`
    );
    console.log('Cleaned up bpg-1790336858543 to cat-10th with empty combo_subjects');

    const res = await pool.query(
      `SELECT id, title, category_id, subject, combo_subjects, price, discount_price, stock FROM books ORDER BY id`
    );
    console.log('--- ALL BOOKS AFTER CLEANSE ---');
    console.table(res.rows);
    const fetchRes = await fetch('http://localhost:3000/api/products');
    const catalog = await fetchRes.json();
    console.log('--- API PRODUCTS ---');
    console.table(
      (catalog.products || catalog).map((p) => ({
        id: p.id,
        title: p.title,
        subject: p.subject,
        category: p.category,
        price: p.price,
        mrp: p.mrp,
        comboSubjects: p.comboSubjects,
      }))
    );
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();
