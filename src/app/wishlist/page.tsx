'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, ShoppingBag, ArrowLeft } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';

export default function WishlistPage() {
  const router = useRouter();
  const { user, wishlist, products, setIsAuthOpen, addToCart, setIsCheckoutOpen, toggleWishlist } =
    useStore();

  const items = products.filter((p) => wishlist.includes(p.id));

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
        <AnnouncementBar />
        <Header />
        <NavBar />
        <div className="max-w-md mx-auto my-16 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm text-center space-y-4">
          <Heart className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="font-heading font-black text-xl text-[#001B3A]">Sign in with Google</h1>
          <p className="text-xs text-slate-500">Wishlist is available after Google login.</p>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="w-full bg-[#2874f0] text-white font-extrabold text-sm py-3 rounded-xl"
          >
            Continue with Google
          </button>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <NavBar />

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <Link href="/" className="text-xs font-bold text-slate-500 hover:text-blue-600 inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> Continue shopping
        </Link>
        <h1 className="font-heading font-black text-2xl text-[#001B3A] mb-6">
          My Wishlist ({items.length})
        </h1>

        {items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto">
            <Heart className="w-14 h-14 text-slate-200 mx-auto mb-3" />
            <p className="font-bold text-slate-800 mb-2">No saved books yet</p>
            <Link href="/search" className="text-sm font-bold text-blue-600">
              Browse guides →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => (
              <div key={p.id} className="space-y-2">
                <ProductCard product={p as any} />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(p);
                    }}
                    className="text-[10px] font-extrabold py-2 rounded-lg bg-[#0044AA] text-white flex items-center justify-center gap-1"
                  >
                    <ShoppingBag className="w-3 h-3" /> Cart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(p);
                      setIsCheckoutOpen(true);
                      router.push('/checkout');
                    }}
                    className="text-[10px] font-extrabold py-2 rounded-lg bg-amber-400 text-[#001B3A]"
                  >
                    Buy now
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleWishlist(p.id)}
                  className="w-full text-[10px] font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
