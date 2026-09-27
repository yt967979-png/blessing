async function test() {
  const payload = {
    items: [
      { id: 'bpg-1790336858543', qty: 1, title: '10th Standard Tamil Book' }
    ]
  };
  const res = await fetch('http://127.0.0.1:3000/api/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}
test();
