'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  MapPin,
  Tag,
  Check,
  Bookmark,
  AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { getCartItemStockState, anyCartItemBlocking } from '@/lib/cartStock';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';

export default function CartPage() {
  const router = useRouter();
  const {
    cart,
    products,
    updateQty,
    removeFromCart,
    cartTotal,
    setIsCheckoutOpen,
    user,
    setIsAuthOpen,
    setCheckoutTotal,
    saveForLater,
    savedForLater,
    moveToCartFromSaved,
    cartCount,
    shippingFee,
    cartGrandTotal,
    validateCartStock,
  } = useStore();
  const [pincode, setPincode] = useState('600012');
  const [pincodeMsg, setPincodeMsg] = useState('✓ Deliverable via ST Courier — usually 2–3 days in Tamil Nadu.');
  const [pincodeOk, setPincodeOk] = useState(true);
  const hasBlockingItem = anyCartItemBlocking(cart, products);

  // Instant stock re-check the moment a customer opens the cart page.
  useEffect(() => {
    void validateCartStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMrp = cart.reduce((sum, item) => sum + (item.mrp || item.price + 40) * item.qty, 0);
  const totalDiscount = totalMrp - cartTotal;

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    const result = pincodeDeliveryMessage(pincode);
    setPincodeOk(result.ok);
    if (result.ok) {
      const estimate = getSTCourierDeliveryEstimate(result.region === 'tn' ? 'Tamil Nadu' : 'Other State');
      setPincodeMsg(`✓ ${result.message} Est. ${estimate.formattedDate}.`);
    } else {
      setPincodeMsg(`⚠️ ${result.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <NavBar />

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/" className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1 min-h-11">
            <ArrowLeft className="w-4 h-4" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A] mb-8">
          Shopping Cart ({cart.length} items)
        </h1>

        {cart.length === 0 && savedForLater.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 max-w-lg mx-auto shadow-xs">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-20 text-[#001B3A]" />
            <h3 className="font-heading font-bold text-lg text-slate-800 mb-1">Your cart is empty</h3>
            <p className="text-xs mb-2 text-slate-500">Login, then add guide books for classes 6th–12th.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
              {!user && (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="inline-block bg-amber-400 text-[#001B3A] font-bold text-xs px-6 py-3.5 rounded-xl shadow-md hover:bg-amber-500 transition-colors uppercase tracking-wider min-h-12"
                >
                  LOGIN
                </button>
              )}
              <Link
                href="/search"
                className="inline-flex items-center justify-center bg-[#001B3A] text-white font-bold text-xs px-6 py-3.5 rounded-xl shadow-md hover:bg-blue-600 transition-colors uppercase tracking-wider min-h-12"
              >
                BROWSE GUIDES
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Deliver to:</span>
                      <span className="text-blue-700">{pincode}</span>
                    </div>
                    {pincodeMsg && (
                      <span
                        className={`text-[11px] font-bold flex items-center gap-1 mt-0.5 ${
                          pincodeOk ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {pincodeOk && <Check className="w-3.5 h-3.5" />}
                        {pincodeMsg}
                      </span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleCheckPincode} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="Enter Pincode..."
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 w-32 min-h-11"
                  />
                  <button
                    type="submit"
                    className="bg-[#001B3A] hover:bg-blue-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors min-h-11"
                  >
                    Check
                  </button>
                </form>
              </div>

              {cart.map((item) => {
                const stockState = getCartItemStockState(item, products);
                return (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-2xl p-4 sm:p-6 flex gap-4 sm:gap-6 items-center shadow-xs ${
                      stockState.blocking ? 'border-red-300' : 'border-slate-200'
                    }`}
                  >
                    <Image
                      src={item.image || '/logo.png'}
                      alt={item.title}
                      width={80}
                      height={80}
                      className="w-20 h-20 object-contain bg-slate-50 border border-slate-200 rounded-xl p-2 flex-shrink-0"
                      unoptimized={imageNeedsUnoptimized(item.image || '')}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-blue-600 uppercase">{item.cls} Standard</span>
                      <h3 className="font-heading font-bold text-sm text-[#001B3A] truncate">{item.title}</h3>

                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-black text-base text-slate-900">₹{item.price}</span>
                        {item.mrp && item.mrp > item.price && (
                          <span className="text-xs text-slate-400 line-through">₹{item.mrp}</span>
                        )}
                      </div>

                      {!stockState.inStock ? (
                        <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Out of stock — remove this item to continue
                        </p>
                      ) : stockState.overLimit ? (
                        <p className="text-[11px] font-bold text-amber-600 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Only {stockState.stock} available — reduce quantity to {stockState.stock}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 font-bold flex items-center justify-center hover:bg-slate-200"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-bold w-6 text-center">{item.qty}</span>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            disabled={!stockState.inStock || stockState.atLimit}
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 font-bold flex items-center justify-center hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => saveForLater(item.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-1 min-h-11 px-2"
                        >
                          <Bookmark className="w-4 h-4" />
                          Save for later
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1 ml-auto min-h-11 px-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {savedForLater.length > 0 && (
                <div className="pt-4 space-y-3">
                  <h2 className="font-heading font-bold text-sm text-slate-700 uppercase tracking-wider">
                    Saved for later ({savedForLater.length})
                  </h2>
                  {savedForLater.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-dashed border-slate-200 rounded-2xl p-4 flex gap-4 items-center"
                    >
                      <Image
                        src={item.image || '/logo.png'}
                        alt=""
                        width={64}
                        height={64}
                        className="w-16 h-16 object-contain bg-slate-50 rounded-lg"
                        unoptimized={imageNeedsUnoptimized(item.image || '')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#001B3A] truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">₹{item.price}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => moveToCartFromSaved(item.id)}
                        className="text-xs font-extrabold text-white bg-[#0044AA] px-3 py-2 rounded-lg"
                      >
                        Move to cart
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="lg:col-span-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs sticky top-24 space-y-4">
                  <h3 className="font-heading font-extrabold text-base text-[#001B3A] uppercase tracking-wider pb-3 border-b border-slate-100">
                    PRICE DETAILS
                  </h3>

                  <div className="space-y-3 text-xs border-b border-slate-200 pb-4">
                    <div className="flex justify-between text-slate-600">
                      <span>Price ({cart.length} items):</span>
                      <span className="font-bold text-slate-800">₹{totalMrp}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Discount Savings:</span>
                      <span className="font-bold text-emerald-600">- ₹{totalDiscount}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Delivery Charges:</span>
                      <span className={shippingFee === 0 ? 'font-bold text-emerald-600' : 'font-bold text-slate-800'}>
                        {shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline font-black text-lg text-[#001B3A]">
                    <span>Total Amount:</span>
                    <span>₹{cartGrandTotal}</span>
                  </div>

                  {totalDiscount > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-bold flex items-center gap-2">
                      <Tag className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>You will save ₹{totalDiscount} on this order!</span>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!user) {
                        setIsAuthOpen(true);
                        return;
                      }
                      if (!pincodeOk || hasBlockingItem) {
                        return;
                      }
                      const clean = await validateCartStock();
                      if (!clean) return;
                      setCheckoutTotal(cartGrandTotal);
                      setIsCheckoutOpen(true);
                      router.push('/checkout');
                    }}
                    disabled={!pincodeOk || hasBlockingItem}
                    className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider transition-colors min-h-12"
                  >
                    PLACE ORDER
                  </button>
                  {!user && (
                    <p className="text-[10px] text-center text-slate-500 font-medium">Sign in with Google to place an order</p>
                  )}
                  {!pincodeOk && (
                    <p className="text-[10px] text-center text-red-600 font-medium">Check a serviceable pincode first</p>
                  )}
                  {hasBlockingItem && (
                    <p className="text-[10px] text-center text-red-600 font-bold flex items-center justify-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Remove or fix out-of-stock items above
                    </p>
                  )}

                  <div className="pt-2 text-[11px] text-slate-500 space-y-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>100% Original Book Guarantee</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 font-medium">
                      <Truck className="w-4 h-4 text-blue-600" />
                      <span>Express Dispatch via ST Courier</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
