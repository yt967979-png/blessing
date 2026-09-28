const assert = require('assert');

// Simulate StoreContext cart logic
function createCartManager() {
  let cart = [];

  function addToCart(item, qty = 1, medium = '') {
    const finalMedium = (medium || item.selectedMedium || '').trim();
    const existing = cart.find(
      (i) => String(i.id) === String(item.id) && (i.selectedMedium || '') === finalMedium
    );
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({ ...item, qty, selectedMedium: finalMedium });
    }
  }

  function removeFromCart(id, selectedMedium) {
    cart = cart.filter((item) => {
      if (String(item.id) !== String(id)) return true;
      if (selectedMedium !== undefined && selectedMedium !== null) {
        const itemMed = (item.selectedMedium || '').trim().toLowerCase();
        const targetMed = selectedMedium.trim().toLowerCase();
        return itemMed !== targetMed;
      }
      return false;
    });
  }

  function updateQty(id, delta, selectedMedium) {
    cart = cart
      .map((item) => {
        if (String(item.id) !== String(id)) return item;
        if (selectedMedium !== undefined && selectedMedium !== null) {
          const itemMed = (item.selectedMedium || '').trim().toLowerCase();
          const targetMed = selectedMedium.trim().toLowerCase();
          if (itemMed !== targetMed) return item;
        }
        const newQty = item.qty + delta;
        if (newQty <= 0) return null;
        return { ...item, qty: newQty };
      })
      .filter(Boolean);
  }

  return {
    getCart: () => cart,
    addToCart,
    removeFromCart,
    updateQty,
  };
}

console.log('Testing medium-isolated cart operations...');
const mgr = createCartManager();

const book = { id: 'bpg-1790336858543', title: '10th Standard Tamil Book', price: 350 };

// 1. Add Tamil Medium 1 copy
mgr.addToCart(book, 1, 'Tamil Medium');
assert.strictEqual(mgr.getCart().length, 1);
assert.strictEqual(mgr.getCart()[0].selectedMedium, 'Tamil Medium');
assert.strictEqual(mgr.getCart()[0].qty, 1);
console.log('✓ Added Tamil Medium 1 copy');

// 2. Add English Medium 1 copy of the SAME guide
mgr.addToCart(book, 1, 'English Medium');
assert.strictEqual(mgr.getCart().length, 2);
assert.strictEqual(mgr.getCart()[1].selectedMedium, 'English Medium');
assert.strictEqual(mgr.getCart()[1].qty, 1);
console.log('✓ Added English Medium 1 copy of the same book');

// 3. Update quantity of English Medium to 2 copies
mgr.updateQty('bpg-1790336858543', 1, 'English Medium');
assert.strictEqual(mgr.getCart().length, 2);
assert.strictEqual(mgr.getCart()[0].qty, 1, 'Tamil medium qty remains 1');
assert.strictEqual(mgr.getCart()[1].qty, 2, 'English medium qty incremented to 2');
console.log('✓ updateQty on English Medium only affected English Medium');

// 4. Delete Tamil Medium copy
mgr.removeFromCart('bpg-1790336858543', 'Tamil Medium');
assert.strictEqual(mgr.getCart().length, 1, 'Cart now has exactly 1 item remaining');
assert.strictEqual(mgr.getCart()[0].selectedMedium, 'English Medium', 'Remaining item is English Medium');
assert.strictEqual(mgr.getCart()[0].qty, 2, 'English Medium qty is preserved at 2');
console.log('✓ Deleting Tamil Medium successfully preserved English Medium in cart!');

console.log('\nAll medium isolation assertions PASSED with 100% precision!');
