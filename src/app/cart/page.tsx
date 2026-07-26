'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowLeft, Trash2, Plus, Minus, ShieldCheck, Truck, MapPin, Tag, Check } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';

export default function CartPage() {
  const { cart, updateQty, removeFromCart, cartTotal, setIsCheckoutOpen, user, setIsAuthOpen } = useStore();
  const [pincode, setPincode] = useState('600012');
  const [pincodeChecked, setPincodeChecked] = useState(true);

  // Calculate MRP and Savings like Flipkart
  const totalMrp = cart.reduce((sum, item) => sum + (item.mrp || item.price + 40) * item.qty, 0);
  const totalDiscount = totalMrp - cartTotal;
  const shippingCost = 0; // FREE Shipping
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const couponDiscountAmount = appliedCoupon ? Math.round((cartTotal * appliedCoupon.percent) / 100) : 0;
  const grandTotal = Math.max(0, cartTotal - couponDiscountAmount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    const codeClean = couponCode.trim().toUpperCase();
    if (codeClean === 'FIRST10' || codeClean === 'BLESSING10') {
      setAppliedCoupon({ code: codeClean, percent: 10 });
    } else if (codeClean === 'POWER20' || codeClean === 'STUDENT20') {
      setAppliedCoupon({ code: codeClean, percent: 20 });
    } else {
      setCouponError('Invalid coupon code. Try FIRST10 or POWER20!');
    }
  };

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length === 6) {
      setPincodeChecked(true);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBar />
      <Header />
      <NavBar />

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/" className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A] mb-8">
          Shopping Cart ({cart.length} items)
        </h1>

        {cart.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 max-w-lg mx-auto shadow-xs">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-20 text-[#001B3A]" />
            <h3 className="font-heading font-bold text-lg text-slate-800 mb-1">Your cart is currently empty</h3>
            <p className="text-xs mb-6">Explore our guides for 6th to 12th standard and add items to your cart.</p>
            <Link
              href="/"
              className="inline-block bg-[#001B3A] text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md hover:bg-blue-600 transition-colors uppercase tracking-wider"
            >
              BROWSE GUIDES
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Items Column */}
            <div className="lg:col-span-8 space-y-4">
              {/* Flipkart Delivery Estimator Widget */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Deliver to:</span>
                      <span className="text-blue-700">{pincode}</span>
                    </div>
                    {pincodeChecked && (
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                        <Check className="w-3.5 h-3.5" /> Express Delivery by Tuesday, 28 July (FREE)
                      </span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleCheckPincode} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter Pincode..."
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 w-32"
                  />
                  <button
                    type="submit"
                    className="bg-[#001B3A] hover:bg-blue-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Check
                  </button>
                </form>
              </div>

              {cart.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 flex gap-4 sm:gap-6 items-center shadow-xs"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-20 h-20 object-contain bg-slate-50 border border-slate-200 rounded-xl p-2 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-blue-600 uppercase">{item.cls} Standard</span>
                    <h3 className="font-heading font-bold text-sm text-[#001B3A] truncate">{item.title}</h3>
                    
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="font-black text-base text-slate-900">₹{item.price}</span>
                      <span className="text-xs text-slate-400 line-through">₹{item.mrp || item.price + 40}</span>
                      <span className="text-xs font-bold text-emerald-600">
                        {Math.round((((item.mrp || item.price + 40) - item.price) / (item.mrp || item.price + 40)) * 100)}% OFF
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 font-bold flex items-center justify-center hover:bg-slate-200"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold w-6 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 font-bold flex items-center justify-center hover:bg-slate-200"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Column */}
            <div className="lg:col-span-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs sticky top-24 space-y-4">
                <h3 className="font-heading font-extrabold text-base text-[#001B3A] uppercase tracking-wider pb-3 border-b border-slate-100">
                  PRICE DETAILS
                </h3>

                {/* Coupon Discount Code Widget */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-600 block">HAVE A COUPON CODE?</span>
                  {!appliedCoupon ? (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Try FIRST10 or POWER20"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 flex-1 uppercase font-bold text-slate-800"
                      />
                      <button
                        type="submit"
                        className="bg-[#001B3A] hover:bg-blue-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        APPLY
                      </button>
                    </form>
                  ) : (
                    <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 p-2 rounded-lg text-xs font-extrabold text-emerald-800">
                      <span>🎉 Code {appliedCoupon.code} ({appliedCoupon.percent}% OFF) Applied!</span>
                      <button
                        onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                        className="text-red-600 hover:underline text-[10px]"
                      >
                        REMOVE
                      </button>
                    </div>
                  )}
                  {couponError && <p className="text-[10px] font-bold text-red-600">{couponError}</p>}
                </div>

                <div className="space-y-3 text-xs border-b border-slate-200 pb-4">
                  <div className="flex justify-between text-slate-600">
                    <span>Price ({cart.length} items):</span>
                    <span className="font-bold text-slate-800">₹{totalMrp}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Discount Savings:</span>
                    <span className="font-bold text-emerald-600">- ₹{totalDiscount}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Coupon ({appliedCoupon.code}):</span>
                      <span>- ₹{couponDiscountAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Delivery Charges:</span>
                    <span className="font-bold text-emerald-600">FREE</span>
                  </div>
                </div>

                <div className="flex justify-between items-baseline font-black text-lg text-[#001B3A]">
                  <span>Total Amount:</span>
                  <span>₹{grandTotal}</span>
                </div>

                {totalDiscount > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-bold flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>You will save ₹{totalDiscount} on this order!</span>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (!user) { setIsAuthOpen(true); return; }
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider transition-colors"
                >
                  PROCEED TO CHECKOUT
                </button>

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
          </div>
        )}
      </div>

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
