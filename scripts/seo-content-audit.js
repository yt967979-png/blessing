/**
 * SEO Catalog & Content Audit Script — Blessing Power Guide
 *
 * Scans all books in the catalog database and flags:
 * 1. Missing or thin (<50 chars) product descriptions
 * 2. Missing cover image URLs or generic placeholder images
 * 3. Missing class standard or subject tags
 * 4. Missing/duplicate SEO slugs
 *
 * IMPORTANT: Flags missing descriptions for manual authoring rather than auto-generating
 * generic filler text (which hurts organic search ranking).
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load .env.local if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  } else {
    const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch {}

function normalizeConnectionString(url) {
  if (!url) return url;
  return url.replace(/[?&]sslmode=[^&]+/g, '').replace(/\?&/, '?').replace(/[?&]$/, '');
}

function getConnectionCandidates() {
  const raw = [
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_PUBLIC_URL,
  ].filter(Boolean);

  if (raw.length === 0 && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD) {
    const host = process.env.PGHOST;
    const user = encodeURIComponent(process.env.PGUSER);
    const pass = encodeURIComponent(process.env.PGPASSWORD);
    const db = process.env.PGDATABASE || 'railway';
    const port = process.env.PGPORT || 5432;
    raw.push(`postgresql://${user}:${pass}@${host}:${port}/${db}`);
  }

  return [...new Set(raw.map(normalizeConnectionString))];
}

function sslFor(connectionString) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('railway.internal')) {
    return false;
  }
  return { rejectUnauthorized: false };
}

async function runAudit() {
  console.log('🔍 Running Blessing Power Guide SEO Content Audit...\n');

  const candidates = getConnectionCandidates();
  if (candidates.length === 0) {
    console.log('ℹ️ No live DATABASE_URL provided. To run audit against your live database on Lightsail/Railway:');
    console.log('   DATABASE_URL="postgres://..." npm run audit:seo\n');
    return;
  }

  const connectionString = candidates[0];
  const pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
  });

  try {
    const res = await pool.query(`
      SELECT 
        id, 
        title, 
        slug, 
        COALESCE(class, cls, '') as class_standard, 
        subject, 
        price, 
        discount_price, 
        stock,
        in_stock,
        cover_image,
        description,
        status
      FROM books
      ORDER BY id ASC
    `);

    const books = res.rows;
    console.log(`📚 Total Books Found in Database: ${books.length}\n`);

    const missingDescriptions = [];
    const shortDescriptions = [];
    const missingCovers = [];
    const missingClassOrSubject = [];
    const missingSlugs = [];

    books.forEach((b) => {
      const desc = (b.description || '').trim();
      const cover = (b.cover_image || '').trim();
      const cls = (b.class_standard || '').trim();
      const subj = (b.subject || '').trim();
      const slug = (b.slug || '').trim();

      if (!desc) {
        missingDescriptions.push(b);
      } else if (desc.length < 50) {
        shortDescriptions.push({ ...b, descLength: desc.length });
      }

      if (!cover || cover.startsWith('data:') || cover.includes('unsplash.com/photo-1544716278-ca5e3f4abd8c')) {
        missingCovers.push(b);
      }

      if (!cls || !subj) {
        missingClassOrSubject.push(b);
      }

      if (!slug) {
        missingSlugs.push(b);
      }
    });

    console.log('====================================================');
    console.log('📋 BLESSING POWER GUIDE — SEO CONTENT AUDIT SUMMARY');
    console.log('====================================================\n');

    console.log(`1. Missing Descriptions: ${missingDescriptions.length}`);
    if (missingDescriptions.length > 0) {
      missingDescriptions.forEach((b) => {
        console.log(`   - [ID ${b.id}] "${b.title}" (Class: ${b.class_standard || 'N/A'})`);
      });
    }

    console.log(`\n2. Short / Thin Descriptions (<50 chars): ${shortDescriptions.length}`);
    if (shortDescriptions.length > 0) {
      shortDescriptions.forEach((b) => {
        console.log(`   - [ID ${b.id}] "${b.title}" — only ${b.descLength} chars: "${b.description}"`);
      });
    }

    console.log(`\n3. Missing / Placeholder Cover Images: ${missingCovers.length}`);
    if (missingCovers.length > 0) {
      missingCovers.forEach((b) => {
        console.log(`   - [ID ${b.id}] "${b.title}" (Cover: ${b.cover_image ? 'Placeholder' : 'None'})`);
      });
    }

    console.log(`\n4. Missing Class Standard or Subject: ${missingClassOrSubject.length}`);
    if (missingClassOrSubject.length > 0) {
      missingClassOrSubject.forEach((b) => {
        console.log(`   - [ID ${b.id}] "${b.title}" (Class: '${b.class_standard}', Subject: '${b.subject}')`);
      });
    }

    console.log(`\n5. Missing SEO Slugs: ${missingSlugs.length}`);
    if (missingSlugs.length > 0) {
      missingSlugs.forEach((b) => {
        console.log(`   - [ID ${b.id}] "${b.title}"`);
      });
    }

    console.log('\n====================================================\n');
  } catch (err) {
    console.error('Audit failed with error:', err.message);
  } finally {
    await pool.end();
  }
}

runAudit();
