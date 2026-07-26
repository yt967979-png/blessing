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
  orderSuccessData: any | null;
  setOrderSuccessData: (data: any | null) => void;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const LOCAL_PRODUCTS_KEY = 'bpg_products_db_persistent_v3';

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initial state for products with instant localStorage cache fallback
  const [products, setProducts] = useState<Product[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(LOCAL_PRODUCTS_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });
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

  // Initial Load from Backend Database
  useEffect(() => {
    // Fetch Live Products from Railway PostgreSQL
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProducts(data);
        }
      })
      .catch(() => {
        setProducts([]);
      });

    // Restore user session from localStorage & verify with Railway PostgreSQL DB
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

  // Save Cart to LocalStorage only when user is logged in
  useEffect(() => {
    if (user) {
      localStorage.setItem('bpg_cart_next', JSON.stringify(cart));
    }
  }, [cart, user]);

  // Save Products to LocalStorage cache whenever updated
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
    }
  }, [products]);

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
    showToast('Logged out successfully');
  };

  // UPDATE PRODUCT IN DB & LOCALSTORAGE
  const updateProductInDb = (id: string | number, updatedData: Partial<Product>) => {
    setProducts((prev) => {
      const nextProds = prev.map((p) => (p.id === id ? { ...p, ...updatedData } : p));
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(nextProds));
      return nextProds;
    });

    // Call API to persist in Railway PostgreSQL
    fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: updatedData.title,
        price: updatedData.price,
        mrp: updatedData.mrp,
        badge: updatedData.badge,
      }),
    }).catch(() => {});

    showToast(`✓ Product #${id} saved permanently to Database!`);
  };

  // ADD NEW PRODUCT TO DB & LOCALSTORAGE PERMANENTLY
  const addNewProductToDb = async (newProdData: Partial<Product>) => {
    const newId = `bpg-${Date.now()}`;
    const createdProd: Product = {
      id: newId,
      slug: newProdData.title ? newProdData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `book-${newId}`,
      title: newProdData.title || 'New Guide Book',
      subtitle: `${newProdData.cls || '10th'} Standard Guide`,
      cls: newProdData.cls || '10th',
      category: newProdData.category || 'guide',
      subject: newProdData.subject || 'State Board',
      price: Number(newProdData.price) || 190,
      mrp: Number(newProdData.mrp) || 240,
      discount: Number(newProdData.discount) || 20,
      rating: 5.0,
      reviews: 1,
      badge: newProdData.badge || 'NEW',
      badgeColor: 'bg-emerald-600',
      image: newProdData.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      hoverImage: newProdData.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      description: newProdData.description || 'Quality guide book for TN Board / CBSE exams.',
      features: ['Model Question Papers', 'Previous Year Questions', 'Chapter-wise Notes'],
      inStock: true,
      isNew: true,
      isBestSeller: true,
      isTrending: true,
    };

    setProducts((prev) => {
      const nextProds = [createdProd, ...prev];
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(nextProds));
      return nextProds;
    });

    // Send POST request to Railway PostgreSQL API
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: createdProd.title,
          cls: createdProd.cls,
          category: createdProd.category,
          price: createdProd.price,
          mrp: createdProd.mrp,
          badge: createdProd.badge,
          image: createdProd.image,
          description: createdProd.description,
        }),
      });
    } catch (err) {}

    showToast(`🎉 Book "${createdProd.title}" saved permanently to Database!`);
  };

  // DELETE PRODUCT FROM DB & LOCALSTORAGE
  const deleteProductFromDb = (id: string | number) => {
    setProducts((prev) => {
      const nextProds = prev.filter((p) => p.id !== id);
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(nextProds));
      return nextProds;
    });

    showToast(`🗑️ Book #${id} removed from Database`);
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const [checkoutTotal, setCheckoutTotal] = useState(0);

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
