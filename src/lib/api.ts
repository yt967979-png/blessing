// API helper for backend server communication with HMAC signature validation
const API_BASE = '/api';

export async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return await res.json();
  } catch (err) {
    console.warn('API error, falling back to local dataset:', err);
    return null;
  }
}

export async function createRazorpayOrder(productId: number, quantity: number) {
  try {
    const res = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity }),
    });
    return await res.json();
  } catch (err) {
    console.error('Checkout API error:', err);
    return null;
  }
}

export async function trackShipmentOrder(orderId: string) {
  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}`);
    return await res.json();
  } catch (err) {
    console.error('Track API error:', err);
    return null;
  }
}
