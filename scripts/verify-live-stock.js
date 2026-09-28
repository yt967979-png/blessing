const http = require('http');

http.get('http://127.0.0.1:3000/api/products?fresh=1', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const items = JSON.parse(raw);
      console.log(`Total products returned from /api/products: ${items.length}`);
      
      const raceBooks = items.filter(b => b.title && b.title.toLowerCase().includes('race'));
      console.log('\n--- RACE TEST BOOKS IN API ---');
      raceBooks.forEach(b => {
        console.log(`ID: ${b.id}`);
        console.log(`Title: ${b.title}`);
        console.log(`Language: ${b.language}`);
        console.log(`Stock: ${b.stock}, stockTamil: ${b.stockTamil}, stockEnglish: ${b.stockEnglish}`);
        console.log(`inStock: ${b.inStock}, status: ${b.status}`);
        console.log('------------------------------');
      });

      // Check a few regular books as well to verify medium badge & stock consistency
      const sample = items.slice(0, 3);
      console.log('\n--- SAMPLE STORE PRODUCTS ---');
      sample.forEach(b => {
        console.log(`Title: ${b.title}`);
        console.log(`Language: ${b.language} | Stock: ${b.stock} (T: ${b.stockTamil}, E: ${b.stockEnglish}) | inStock: ${b.inStock}`);
      });

    } catch (e) {
      console.error('Error parsing response:', e.message);
      console.error(raw.slice(0, 300));
    }
  });
}).on('error', err => {
  console.error('HTTP Request failed:', err.message);
});
