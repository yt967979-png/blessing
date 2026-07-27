'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

export interface Product {
  id: string | number;
  slug: string;
  title: string;
  subtitle: string;
  cls: string;
  category: 'guide' | 'combo' | 'question-bank';
  subject: string;
  price: number;
  mrp: number;
  discount: number;
  rating: number;
  reviews: number;
  badge: string;
  badgeColor: string;
  image: string;
  hoverImage?: string;
  description: string;
  features: string[];
  inStock: boolean;
  stock?: number;
  isNew?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
}

export interface CartItem extends Product {
  qty: number;
}

export interface UserData {
  id: number | string;
  name: string;
  email: string;
  phone?: string;
  token?: string;
  role?: string;
}

export interface PublicCoupon {
  id: string;
  code: string;
  title: string;
  description: string;
  offerType: 'discount' | 'free_book';
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minimumAmount: number;
  minimumQuantity: number;
  conditionMode: string;
  expiryDate: string | null;
  label: string;
  allowedClasses?: string[];
  allowedCategories?: string[];
}

export interface AppliedCoupon {
  code: string;
  label: string;
  offerType: 'discount' | 'free_book';
  discountAmount: number;
  total: number;
  freeBookId?: string;
  freeBookTitle?: string;
  allowedClasses?: string[];
  allowedCategories?: string[];
}

interface StoreContextType {
  products: Product[];
  cart: CartItem[];
  wishlist: (string | number)[];
  user: UserData | null;
  toast: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedClass: string;
  setSelectedClass: (c: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  quickViewProduct: Product | null;
  setQuickViewProduct: (p: Product | null) => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  isTrackOpen: boolean;
  setIsTrackOpen: (open: boolean) => void;
  isAuthOpen: boolean;
  setIsAuthOpen: (open: boolean) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  addToCart: (product: Product, qty?: number) => void;
  updateQty: (id: string | number, delta: number) => void;
  removeFromCart: (id: string | number) => void;
  clearCart: () => void;
  toggleWishlist: (id: string | number) => void;
  loginUser: (
    u: UserData,
    restoredCart?: CartItem[],
    restoredWishlist?: (string | number)[],
    restoredAddresses?: any[]
  ) => void;
  logoutUser: () => void;
  updateProductInDb: (id: string | number, updatedData: Partial<Product> & { hasDiscount?: boolean }) => void;
  addNewProductToDb: (newProdData: Partial<Product>) => void;
  deleteProductFromDb: (id: string | number) => void;
  cartTotal: number;
  cartCount: number;
  checkoutTotal: number;
  setCheckoutTotal: (amount: number) => void;
  publicCoupons: PublicCoupon[];
  appliedCoupon: AppliedCoupon | null;
  couponDiscount: number;
  cartGrandTotal: number;
  applyCouponCode: (code: string, freeBookId?: string) => Promise<boolean>;
  clearAppliedCoupon: () => void;
  setPendingCouponCode: (code: string) => void;
  pendingCouponCode: string;
  productsLoading: boolean;
  orderSuccessData: any | null;
  setOrderSuccessData: (data: any | null) => void;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function readLocalCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('bpg_cart_next');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalWishlist(): (string | number)[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('bpg_wishlist_next');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<(string | number)[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackOpen, setIsTrackOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [orderSuccessData, setOrderSuccessData] = useState<any | null>(null);

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refreshProducts = () => {
    setProductsLoading(true);
    // Cache-bust so admin price/badge saves are not overwritten by a stale GET
    fetch(`/api/products?_=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  };

  // Hydrate cart/wishlist/user BEFORE any sync (prevents empty-cart wipe)
  useEffect(() => {
    refreshProducts();

    const localCart = readLocalCart();
    const localWish = readLocalWishlist();
    if (localCart.length) setCart(localCart);
    if (localWish.length) setWishlist(localWish);

    const savedUser = localStorage.getItem('bpg_user_next');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u?.id) {
          setUser(u);
          fetch(`/api/auth?userId=${u.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((dbUser) => {
              if (dbUser?.user) {
                const nextUser = { ...dbUser.user, token: dbUser.user.token || u.token };
                setUser(nextUser);
                localStorage.setItem('bpg_user_next', JSON.stringify(nextUser));
                // Prefer local cart; if empty, restore from DB (fixes refresh wipe)
                if (!localCart.length && Array.isArray(dbUser.cart) && dbUser.cart.length > 0) {
                  setCart(dbUser.cart);
                  localStorage.setItem('bpg_cart_next', JSON.stringify(dbUser.cart));
                }
                if (!localWish.length && Array.isArray(dbUser.wishlist) && dbUser.wishlist.length > 0) {
                  setWishlist(dbUser.wishlist);
                  localStorage.setItem('bpg_wishlist_next', JSON.stringify(dbUser.wishlist));
                }
              } else {
                setUser(null);
                setCart([]);
                setWishlist([]);
                localStorage.removeItem('bpg_user_next');
                localStorage.removeItem('bpg_cart_next');
                localStorage.removeItem('bpg_wishlist_next');
                localStorage.removeItem('bpg_user_addresses');
              }
            })
            .catch(() => {})
            .finally(() => setHydrated(true));
          return;
        }
      } catch (_) {}
    }
    setHydrated(true);
  }, []);

  // Debounced cart/wishlist sync — only after hydrate
  useEffect(() => {
    if (!hydrated || !user?.id) return;

    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) headers.Authorization = `Bearer ${user.token}`;
      fetch('/api/user/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cart,
          wishlist,
        }),
      })
        .then((res) => {
          if (res.status === 404 || res.status === 401) {
            setUser(null);
            setCart([]);
            setWishlist([]);
            localStorage.removeItem('bpg_user_next');
            localStorage.removeItem('bpg_cart_next');
            localStorage.removeItem('bpg_wishlist_next');
            localStorage.removeItem('bpg_user_addresses');
          }
        })
        .catch(() => {});
    }, 600);

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [cart, wishlist, user, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (user) {
      localStorage.setItem('bpg_cart_next', JSON.stringify(cart));
      localStorage.setItem('bpg_wishlist_next', JSON.stringify(wishlist));
    }
  }, [cart, wishlist, user, hydrated]);

  const getAdminHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) headers.Authorization = `Bearer ${user.token}`;
    return headers;
  };

  const addToCart = (product: Product, qty: number = 1) => {
    if (!user) {
      setIsAuthOpen(true);
      showToast('Please login or register to add items to cart');
      return;
    }
    if (product.inStock === false) {
      showToast('❌ This book is out of stock');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      let updated: CartItem[];
      if (existing) {
        updated = prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + qty } : item
        );
      } else {
        updated = [...prev, { ...product, qty }];
      }
      localStorage.setItem('bpg_cart_next', JSON.stringify(updated));
      return updated;
    });
    showToast(`✓ Added "${product.title}" to cart!`);
  };

  const requestCheckout = (open: boolean) => {
    if (open && !user) {
      setIsAuthOpen(true);
      showToast('Please login or register to place an order');
      return;
    }
    setIsCheckoutOpen(open);
  };

  const updateQty = (id: string | number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (id: string | number) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => setCart([]);

  const toggleWishlist = (id: string | number) => {
    if (!user) {
      setIsAuthOpen(true);
      showToast('Please login or register to use wishlist');
      return;
    }
    setWishlist((prev) => {
      if (prev.includes(id)) {
        showToast('Item removed from wishlist');
        return prev.filter((item) => item !== id);
      }
      showToast('❤️ Added to wishlist');
      return [...prev, id];
    });
  };

  const loginUser = (
    userData: UserData,
    restoredCart?: CartItem[],
    restoredWishlist?: (string | number)[],
    restoredAddresses?: any[]
  ) => {
    setUser(userData);
    localStorage.setItem('bpg_user_next', JSON.stringify(userData));

    if (Array.isArray(restoredCart) && restoredCart.length > 0) {
      setCart(restoredCart);
      localStorage.setItem('bpg_cart_next', JSON.stringify(restoredCart));
    } else {
      const local = readLocalCart();
      if (local.length) setCart(local);
    }

    if (Array.isArray(restoredWishlist) && restoredWishlist.length > 0) {
      setWishlist(restoredWishlist);
      localStorage.setItem('bpg_wishlist_next', JSON.stringify(restoredWishlist));
    } else {
      const local = readLocalWishlist();
      if (local.length) setWishlist(local);
    }

    if (Array.isArray(restoredAddresses)) {
      localStorage.removeItem('bpg_user_addresses');
    }

    showToast(`✓ Account Synced! Welcome back, ${userData.name}!`);
  };

  const logoutUser = () => {
    setUser(null);
    setCart([]);
    setWishlist([]);
    localStorage.removeItem('bpg_user_next');
    localStorage.removeItem('bpg_cart_next');
    localStorage.removeItem('bpg_wishlist_next');
    localStorage.removeItem('bpg_user_addresses');
    fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    showToast('Logged out successfully');
  };

  const updateProductInDb = async (
    id: string | number,
    updatedData: Partial<Product> & { hasDiscount?: boolean }
  ) => {
    const { hasDiscount, ...rest } = updatedData;
    const badge = rest.badge !== undefined ? String(rest.badge || '').trim() : undefined;
    let withDerived: Partial<Product> = { ...rest };
    if (badge !== undefined) {
      withDerived = {
        ...withDerived,
        badge,
        badgeColor: badge
          ? badge.toUpperCase().includes('COMBO')
            ? 'bg-purple-600'
            : 'bg-blue-600'
          : '',
        isBestSeller: badge.toUpperCase().includes('BEST'),
      };
    }
    if (hasDiscount === false && rest.mrp !== undefined) {
      withDerived.price = Number(rest.mrp);
      withDerived.discount = 0;
    } else if (rest.price !== undefined && rest.mrp !== undefined) {
      const sell = Number(rest.price);
      const mrp = Number(rest.mrp);
      if (sell >= mrp) {
        withDerived.price = mrp;
        withDerived.discount = 0;
      } else {
        withDerived.discount = Math.round(((mrp - sell) / mrp) * 100);
      }
    }
    if (rest.inStock !== undefined) {
      withDerived.inStock = Boolean(rest.inStock);
    }
    if (rest.stock !== undefined) {
      const qty = Math.max(0, Math.floor(Number(rest.stock) || 0));
      withDerived.stock = qty;
      withDerived.inStock = qty > 0;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...withDerived } : p)));
    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ id, ...withDerived, hasDiscount }),
      });
      if (!res.ok) throw new Error('Update failed');
      // Keep optimistic stock/badge; then sync full catalog fresh
      refreshProducts();
      showToast(
        rest.stock !== undefined
          ? `✓ Stock updated — ${Math.max(0, Math.floor(Number(rest.stock) || 0))} units`
          : rest.inStock === false
            ? '✓ Marked out of stock — hidden from shop'
            : rest.inStock === true
              ? '✓ Back in stock — visible on shop'
              : '✓ Product saved to database'
      );
    } catch {
      showToast('❌ Failed to save product');
      refreshProducts();
    }
  };

  const addNewProductToDb = async (newProdData: Partial<Product>) => {
    if (!user?.token) {
      showToast('❌ Please log in again as admin');
      return;
    }
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          title: newProdData.title,
          cls: newProdData.cls,
          category: newProdData.category,
          price: newProdData.price,
          mrp: newProdData.mrp,
          image: newProdData.image,
          description: newProdData.description,
          badge: newProdData.badge || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      refreshProducts();
      showToast(`🎉 Book "${newProdData.title}" saved to database`);
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      showToast(msg.includes('Forbidden') || msg.includes('Unauthorized')
        ? '❌ Admin login required — log out and log in again'
        : `❌ Failed to add product: ${msg}`);
    }
  };

  const deleteProductFromDb = async (id: string | number) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Delete failed');
      refreshProducts();
      showToast(`🗑️ Book removed from database`);
    } catch {
      showToast('❌ Failed to delete product');
      refreshProducts();
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const [publicCoupons, setPublicCoupons] = useState<PublicCoupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [pendingCouponCode, setPendingCouponCode] = useState('');

  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  const cartGrandTotal =
    appliedCoupon?.offerType === 'discount' && appliedCoupon.total > 0
      ? appliedCoupon.total
      : cartTotal;

  const refreshPublicCoupons = () => {
    fetch('/api/coupons')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPublicCoupons(data);
      })
      .catch(() => setPublicCoupons([]));
  };

  useEffect(() => {
    refreshPublicCoupons();
  }, []);

  const applyCouponCode = async (code: string, freeBookId?: string): Promise<boolean> => {
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      showToast('Enter a coupon code');
      return false;
    }
    if (cart.length === 0) {
      showToast('Add books to cart before applying a coupon');
      return false;
    }
    if (!user?.token) {
      showToast('Please login to apply a coupon');
      setIsAuthOpen(true);
      return false;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.token) headers.Authorization = `Bearer ${user.token}`;

      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: trimmed,
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
          freeBookId: freeBookId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.valid) {
        showToast(`❌ ${data.error || 'Invalid coupon'}`);
        setAppliedCoupon(null);
        return false;
      }
      if (data.needsFreeBook) {
        showToast('Select your free book below');
        setPendingCouponCode(trimmed);
        setAppliedCoupon({
          code: data.coupon.code,
          label: data.coupon.label,
          offerType: 'free_book',
          discountAmount: 0,
          total: data.total ?? cartTotal,
          allowedClasses: data.coupon.allowedClasses || [],
          allowedCategories: data.coupon.allowedCategories || [],
        });
        return false;
      }
      setAppliedCoupon({
        code: data.coupon.code,
        label: data.coupon.label,
        offerType: data.coupon.offerType,
        discountAmount: data.discountAmount || 0,
        total: data.total ?? cartTotal,
        freeBookId: data.freeBook?.id,
        freeBookTitle: data.freeBook?.title,
        allowedClasses: data.coupon.allowedClasses || [],
        allowedCategories: data.coupon.allowedCategories || [],
      });
      setPendingCouponCode('');
      showToast(`✅ Coupon ${data.coupon.code} applied`);
      return true;
    } catch {
      showToast('❌ Could not validate coupon');
      return false;
    }
  };

  const clearAppliedCoupon = () => {
    setAppliedCoupon(null);
    setPendingCouponCode('');
  };

  useEffect(() => {
    setCheckoutTotal(cartGrandTotal);
  }, [cartGrandTotal]);

  useEffect(() => {
    if (cart.length === 0) clearAppliedCoupon();
  }, [cart.length]);

  return (
    <StoreContext.Provider
      value={{
        products,
        productsLoading,
        cart,
        wishlist,
        user,
        toast,
        searchQuery,
        setSearchQuery,
        selectedClass,
        setSelectedClass,
        selectedCategory,
        setSelectedCategory,
        quickViewProduct,
        setQuickViewProduct,
        isCartOpen,
        setIsCartOpen,
        isCheckoutOpen,
        setIsCheckoutOpen: requestCheckout,
        isTrackOpen,
        setIsTrackOpen,
        isAuthOpen,
        setIsAuthOpen,
        isProfileOpen,
        setIsProfileOpen,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
        toggleWishlist,
        loginUser,
        logoutUser,
        updateProductInDb,
        addNewProductToDb,
        deleteProductFromDb,
        cartTotal,
        cartCount,
        checkoutTotal,
        setCheckoutTotal,
        publicCoupons,
        appliedCoupon,
        couponDiscount,
        cartGrandTotal,
        applyCouponCode,
        clearAppliedCoupon,
        pendingCouponCode,
        setPendingCouponCode,
        orderSuccessData,
        setOrderSuccessData,
        showToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
