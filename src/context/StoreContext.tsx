'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

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
  updateProductInDb: (id: string | number, updatedData: Partial<Product>) => void;
  addNewProductToDb: (newProdData: Partial<Product>) => void;
  deleteProductFromDb: (id: string | number) => void;
  cartTotal: number;
  cartCount: number;
  checkoutTotal: number;
  setCheckoutTotal: (amount: number) => void;
  appliedCouponCode: string | null;
  setAppliedCouponCode: (code: string | null) => void;
  orderSuccessData: any | null;
  setOrderSuccessData: (data: any | null) => void;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<(string | number)[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refreshProducts = () => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => setProducts([]));
  };

  // Load products from DB only
  useEffect(() => {
    refreshProducts();
    const savedUser = localStorage.getItem('bpg_user_next');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          setUser(u);
          // Verify with Railway PostgreSQL DB if account still exists
          fetch(`/api/auth?userId=${u.id}`)
            .then((res) => {
              if (res.ok) {
                return res.json();
              }
              return null;
            })
            .then((dbUser) => {
              if (dbUser && dbUser.user) {
                setUser(dbUser.user);
                localStorage.setItem('bpg_user_next', JSON.stringify(dbUser.user));
              } else {
                // Account missing in DB -> Auto logout!
                setUser(null);
                setCart([]);
                setWishlist([]);
                localStorage.removeItem('bpg_user_next');
                localStorage.removeItem('bpg_cart_next');
                localStorage.removeItem('bpg_user_addresses');
              }
            })
            .catch(() => {
              const savedCart = localStorage.getItem('bpg_cart_next');
              if (savedCart) {
                try { setCart(JSON.parse(savedCart)); } catch (e) {}
              }
            });
        }
      } catch (e) {}
    }
  }, []);

  // Cross-Device Sync Trigger to Railway PostgreSQL (only when logged in)
  useEffect(() => {
    if (user && user.id) {
      fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          cart,
          wishlist,
        }),
      })
        .then((res) => {
          if (res.status === 404) {
            // User deleted/missing in Railway DB -> Auto Logout
            setUser(null);
            setCart([]);
            setWishlist([]);
            localStorage.removeItem('bpg_user_next');
            localStorage.removeItem('bpg_cart_next');
            localStorage.removeItem('bpg_user_addresses');
          }
        })
        .catch(() => {});
    }
  }, [cart, wishlist, user]);

  // Save cart to localStorage when logged in
  useEffect(() => {
    if (user) {
      localStorage.setItem('bpg_cart_next', JSON.stringify(cart));
    }
  }, [cart, user]);

  const getAdminHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) headers.Authorization = `Bearer ${user.token}`;
    if (user?.id) headers['x-admin-user-id'] = String(user.id);
    return headers;
  };

  const addToCart = (product: Product, qty: number = 1) => {
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
    setWishlist((prev) => {
      if (prev.includes(id)) {
        showToast('Item removed from wishlist');
        return prev.filter((item) => item !== id);
      } else {
        showToast('❤️ Added to wishlist');
        return [...prev, id];
      }
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

    if (Array.isArray(restoredCart)) {
      setCart(restoredCart);
      localStorage.setItem('bpg_cart_next', JSON.stringify(restoredCart));
    }

    if (Array.isArray(restoredWishlist)) {
      setWishlist(restoredWishlist);
    }

    if (Array.isArray(restoredAddresses)) {
      localStorage.setItem('bpg_user_addresses', JSON.stringify(restoredAddresses));
    }

    showToast(`✓ Account Synced! Welcome back, ${userData.name}!`);
  };

  const logoutUser = () => {
    setUser(null);
    setCart([]);
    setWishlist([]);
    localStorage.removeItem('bpg_user_next');
    localStorage.removeItem('bpg_cart_next');
    localStorage.removeItem('bpg_user_addresses');
    fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    showToast('Logged out successfully');
  };

  const updateProductInDb = async (id: string | number, updatedData: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updatedData } : p)));

    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ id, ...updatedData }),
      });
      if (!res.ok) throw new Error('Update failed');
      refreshProducts();
      showToast(`✓ Product saved to database`);
    } catch {
      showToast('❌ Failed to save product');
      refreshProducts();
    }
  };

  const addNewProductToDb = async (newProdData: Partial<Product>) => {
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
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      refreshProducts();
      showToast(`🎉 Book "${newProdData.title}" saved to database`);
    } catch {
      showToast('❌ Failed to add product');
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
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);

  // Keep checkoutTotal in sync with cartTotal unless manually overridden (e.g. coupon applied)
  useEffect(() => {
    setCheckoutTotal(cartTotal);
  }, [cartTotal]);

  return (
    <StoreContext.Provider
      value={{
        products,
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
        setIsCheckoutOpen,
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
        appliedCouponCode,
        setAppliedCouponCode,
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
