const {
  normalizeProductMedium,
  isProductMultiMedium,
  getProductMediumBadge,
  resolveCartItemMedium,
} = require('../src/lib/productMedium.ts');

async function main() {
  console.log('--- 1. Testing unit normalization ---');
  const testCases = [
    { input: 'English', expectedType: 'English', isMulti: false },
    { input: 'English Medium', expectedType: 'English', isMulti: false },
    { input: 'English Med', expectedType: 'English', isMulti: false },
    { input: 'Tamil', expectedType: 'Tamil', isMulti: false },
    { input: 'Tamil Medium', expectedType: 'Tamil', isMulti: false },
    { input: 'Tamil Only (தமிழ் வழி)', expectedType: 'Tamil', isMulti: false },
    { input: 'Both', expectedType: 'Both', isMulti: true },
    { input: 'Tamil & English', expectedType: 'Both', isMulti: true },
    { input: 'Tamil / English', expectedType: 'Both', isMulti: true },
    { input: 'Both Tamil & English', expectedType: 'Both', isMulti: true },
    { input: null, expectedType: 'Both', isMulti: true },
    { input: undefined, expectedType: 'Both', isMulti: true },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const type = normalizeProductMedium(tc.input);
    const multi = isProductMultiMedium(tc.input);
    const badge = getProductMediumBadge(tc.input);
    const cartMed = resolveCartItemMedium(tc.input, 'English Medium');

    if (type !== tc.expectedType || multi !== tc.isMulti) {
      console.error(`FAILED test for "${tc.input}": got type=${type}, multi=${multi}`);
      process.exit(1);
    }
    console.log(`✅ Input: "${tc.input}" -> type: ${type}, isMulti: ${multi}, badge: "${badge.shortBadge}"`);
    passed++;
  }
  console.log(`\nAll ${passed}/${testCases.length} unit tests passed!`);

  console.log('\n--- 2. Checking live /api/products response ---');
  const res = await fetch('https://blessingpowerguide.in/api/products?fresh=1');
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }
  const products = await res.json();
  const book = products.find(p => p.title.includes('Race Test Book 0 Stock'));
  console.log('Live Product in DB:', {
    id: book.id,
    title: book.title,
    language: book.language,
    stock: book.stock,
    stockTamil: book.stockTamil,
    stockEnglish: book.stockEnglish,
    normalized: normalizeProductMedium(book.language),
    isMultiMedium: isProductMultiMedium(book.language),
    badge: getProductMediumBadge(book.language),
  });

  if (isProductMultiMedium(book.language)) {
    console.error('ERROR: Race Test Book 0 Stock should NOT be multi-medium when language is English!');
    process.exit(1);
  }
  console.log('✅ PASS: Race Test Book 0 Stock is correctly recognized as single-medium English!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
