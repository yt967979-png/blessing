const fs = require('fs');
const path = require('path');

function createSamplePdfBuffer() {
  const content = `BT
/F1 24 Tf
50 720 Td
(BLESSING POWER GUIDE) Tj
0 -32 Td
/F1 16 Tf
(10th Standard Tamil Guide - Sample Pages) Tj
0 -28 Td
/F1 12 Tf
(Official Tamil Nadu Samacheer Kalvi Curriculum) Tj
0 -20 Td
(Published by Blessing Power Guide) Tj
0 -40 Td
/F1 14 Tf
(Table of Contents & Highlights:) Tj
0 -24 Td
/F1 11 Tf
(1. Unit 1: Language & Grammar Exercises with Model Answers) Tj
0 -20 Td
(2. Unit 2: Prose & Poetry Line-by-Line Meaning & Explanations) Tj
0 -20 Td
(3. Unit 3: Supplementary Reader & Creative Writing) Tj
0 -20 Td
(4. 5 Sets of Solved Public Exam Question Papers) Tj
0 -20 Td
(5. High-Scoring Key Points & Revision Summary Notes) Tj
0 -45 Td
/F1 12 Tf
(Order the complete physical book with fast ST Courier delivery across Tamil Nadu:) Tj
0 -20 Td
/F1 11 Tf
(Visit: https://blessingpowerguide.in) Tj
0 -20 Td
(Contact / WhatsApp Orders: +91 94441 21677) Tj
ET`;

  const streamLength = Buffer.byteLength(content);

  const pdf = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 595 842]
  /Contents 4 0 R
  /Resources <<
    /Font <<
      /F1 5 0 R
    >>
  >>
>>
endobj
4 0 obj
<<
  /Length ${streamLength}
>>
stream
${content}
endstream
endobj
5 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
>>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000257 00000 n 
0000000${(307 + streamLength).toString().padStart(3, '0')} 00000 n 
trailer
<<
  /Size 6
  /Root 1 0 R
>>
startxref
${390 + streamLength}
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

const outDir = path.join(__dirname, '..', 'public', 'uploads', 'samples');
fs.mkdirSync(outDir, { recursive: true });
const targetFile = path.join(outDir, 'sample-1789553412392-w6wqkb.pdf');
fs.writeFileSync(targetFile, createSamplePdfBuffer());
console.log('✓ Generated valid sample PDF at:', targetFile, 'Size:', fs.statSync(targetFile).size, 'bytes');
