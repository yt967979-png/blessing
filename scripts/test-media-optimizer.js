const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

async function testOptimizer() {
  console.log('Testing Media Optimization Pipeline...\n');

  // 1. Create a raw uncompressed PNG image (2000x2000 px, high contrast gradient)
  const rawPng = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 }
    }
  }).png().toBuffer();

  const originalImageSize = rawPng.length;
  console.log(`Original Image Size (PNG 2000x2000): ${(originalImageSize / 1024).toFixed(1)} KB`);

  // Run sharp optimization (same settings as mediaOptimizer.ts)
  const optimizedImage = await sharp(rawPng)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const optimizedImageSize = optimizedImage.length;
  const imageSavings = Math.round(((originalImageSize - optimizedImageSize) / originalImageSize) * 100);
  console.log(`Optimized WebP Size: ${(optimizedImageSize / 1024).toFixed(1)} KB`);
  console.log(`Image Space Saved: ${imageSavings}% 🎉\n`);

  // 2. Create a test PDF with PDFDocument
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  page.drawText('Blessing Power Guide - Test Sample Chapter');
  const uncompressedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const originalPdfSize = uncompressedPdfBytes.length;

  const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const compressedPdfSize = compressedPdfBytes.length;
  console.log(`Original PDF Size: ${originalPdfSize} bytes`);
  console.log(`Optimized PDF Size (object streams): ${compressedPdfSize} bytes`);
  console.log(`PDF Savings: ${Math.round(((originalPdfSize - compressedPdfSize) / originalPdfSize) * 100)}% 🎉\n`);

  console.log('✅ Media Optimization Test Passed!');
}

testOptimizer().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
