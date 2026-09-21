const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Generating proper multi-resolution favicons and true PNGs for Google Search & Web...');
  const masterSrc = path.join(__dirname, '..', 'public', 'logo.png');

  const masterBuf = fs.readFileSync(masterSrc);

  // 1. Generate 512x512 true PNG
  const png512 = await sharp(masterBuf).resize(512, 512).png({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'logo.png'), png512);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'bpg-og-emblem.png'), png512);
  console.log('✅ Generated public/logo.png & public/bpg-og-emblem.png (512x512 true PNG)');

  // 2. Generate 192x192 true PNG
  const png192 = await sharp(masterBuf).resize(192, 192).png({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.png'), png192);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon-192.png'), png192);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon-512.png'), png512);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'app', 'icon.png'), png192);
  console.log('✅ Generated public/icon.png, icon-192.png, icon-512.png, and src/app/icon.png (true PNG)');

  // 3. Generate 180x180 Apple Touch Icon true PNG
  const png180 = await sharp(masterBuf).resize(180, 180).png({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'), png180);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'app', 'apple-icon.png'), png180);
  console.log('✅ Generated apple-touch-icon.png and apple-icon.png (180x180 true PNG)');

  // 4. Generate 48x48 Google preferred icon
  const png48 = await sharp(masterBuf).resize(48, 48).png().toBuffer();
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon-48x48.png'), png48);
  console.log('✅ Generated public/favicon-48x48.png (48x48 true PNG)');

  // 5. Generate Multi-frame Windows ICO (16x16, 32x32, 48x48) in RGBA format
  const sizes = [16, 32, 48];
  const pngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(masterBuf).resize(s, s).ensureAlpha().png().toBuffer();
    pngBuffers.push({ size: s, buf });
  }

  const numImages = pngBuffers.length;
  const headerSize = 6 + 16 * numImages;
  let currentOffset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(numImages, 4); // count

  const dirEntries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size, 0); // width
    entry.writeUInt8(item.size, 1); // height
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buf.length, 8); // size
    entry.writeUInt32LE(currentOffset, 12); // offset
    dirEntries.push(entry);
    currentOffset += item.buf.length;
  }

  const finalIco = Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buf)]);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'), finalIco);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'app', 'favicon.ico'), finalIco);
  console.log('✅ Generated public/favicon.ico and src/app/favicon.ico (Multi-frame ICO, 16/32/48)');

  // Verify magic bytes
  const icoBuf = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'));
  const pngBuf = fs.readFileSync(path.join(__dirname, '..', 'public', 'icon.png'));
  console.log('\n--- VERIFICATION ---');
  console.log('favicon.ico magic bytes:', icoBuf.slice(0, 4), '-> Valid ICO:', icoBuf[2] === 1 && icoBuf[3] === 0);
  console.log('icon.png magic bytes:   ', pngBuf.slice(0, 4), '-> Valid PNG:', pngBuf[1] === 0x50 && pngBuf[2] === 0x4e);
}

main().catch(console.error);
