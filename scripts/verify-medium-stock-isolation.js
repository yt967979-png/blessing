const { isBookInStock, availableStock } = require('../src/lib/stock.ts');
const { normalizeProductMedium, isProductMultiMedium, getProductMediumBadge } = require('../src/lib/productMedium.ts');

function testStockLogic() {
  console.log('--- 1. Testing isBookInStock & availableStock ---');

  const cases = [
    // Case 1: Status out_of_stock
    { row: { status: 'out_of_stock', stock: 10 }, expected: false, name: 'Explicit out_of_stock status' },
    // Case 2: Stock 0
    { row: { status: 'published', stock: 0 }, expected: false, name: 'Stock is 0' },
    // Case 3: Both medium but both stocks are 0 (even if total stock was 1)
    { row: { status: 'published', language: 'Both', stock: 1, stock_tamil: 0, stock_english: 0 }, expected: false, name: 'Both mediums 0 stock' },
    // Case 4: Both medium with Tamil in stock
    { row: { status: 'published', language: 'Both', stock: 5, stock_tamil: 5, stock_english: 0 }, expected: true, name: 'Both mediums with Tamil in stock' },
    // Case 5: Both medium with English in stock
    { row: { status: 'published', language: 'Both', stock: 5, stock_tamil: 0, stock_english: 5 }, expected: true, name: 'Both mediums with English in stock' },
    // Case 6: Single medium English with positive stock
    { row: { status: 'published', language: 'English', stock: 22, stock_tamil: null, stock_english: 22 }, expected: true, name: 'English-only with 22 stock' },
    // Case 7: Single medium English with 0 stock
    { row: { status: 'published', language: 'English', stock: 0, stock_tamil: null, stock_english: 0 }, expected: false, name: 'English-only with 0 stock' },
    // Case 8: Single medium Tamil with positive stock
    { row: { status: 'published', language: 'Tamil', stock: 45, stock_tamil: 45, stock_english: null }, expected: true, name: 'Tamil-only with 45 stock' },
    // Case 9: Single medium Tamil with 0 stock
    { row: { status: 'published', language: 'Tamil', stock: 0, stock_tamil: 0, stock_english: null }, expected: false, name: 'Tamil-only with 0 stock' },
  ];

  let passed = 0;
  for (const c of cases) {
    const inStock = isBookInStock(c.row);
    if (inStock !== c.expected) {
      console.error(`❌ FAILED: ${c.name} - expected ${c.expected}, got ${inStock}`);
      process.exit(1);
    }
    console.log(`✅ ${c.name}: inStock=${inStock}`);
    passed++;
  }
  console.log(`\nAll ${passed}/${cases.length} stock check tests passed!`);
}

testStockLogic();
