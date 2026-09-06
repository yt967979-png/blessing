'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { userNeedsProfile } from '@/lib/userProfile';
import { deliveryFeeForQty } from '@/lib/deliveryRules';

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
  samplePdfUrl?: string | null;
  isNew?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
}

export interface CartItem extends Product {
  qty: number;
}

/** Payload shape pushed by `/api/stock/stream` on every `STOCK_CHANGED` event. */
interface StockPushEntry {
  id: string;
  stock: number;
  status: string;
  inStock: boolean;
}

export interface UserData {
  id: number | string;
  name: string;
  email: string;
  phone?: string;
  token?: string;
  role?: string;
  needsProfile?: boolean;
  isGuest?: boolean;
}

function persistSessionUser(user: UserData) {
  const { token: _drop, ...safe } = user;
  localStorage.setItem('bpg_user_next', JSON.stringify(safe));
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
  clearCartAfterOrder: () => void;
  /** Live server stock check for everything in the cart — clamps qty, drops OOS items, toasts changes. Returns false if anything is still blocking after the check. */
  validateCartStock: () => Promise<boolean>;
  isValidatingCartStock: boolean;
  saveForLater: (id: string | number) => void;
  moveToCartFromSaved: (id: string | number) => void;
  savedForLater: CartItem[];
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
  refreshProducts: (bypassCache?: boolean) => void;
  cartTotal: number;
  cartCount: number;
  checkoutTotal: number;
  setCheckoutTotal: (amount: number) => void;
  shippingFee: number;
  cartGrandTotal: number;
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
  const [savedForLater, setSavedForLater] = useState<CartItem[]>([]);
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

  const cartRef = useRef<CartItem[]>([]);
  cartRef.current = cart;

  const [isValidatingCartStock, setIsValidatingCartStock] = useState(false);

  const CATALOG_CACHE_KEY = 'bpg_catalog_cache_v1';
  const CATALOG_TTL_MS = 5 * 60 * 1000;

  const readCatalogCache = (allowStale = false): Product[] | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.products)) return null;
      if (typeof parsed.at !== 'number') return null;
      // Soft-fail path may reuse stale cache so the shop never blanks on Neon stalls.
      if (!allowStale && Date.now() - parsed.at > CATALOG_TTL_MS) return null;
      return parsed.products as Product[];
    } catch {
      return null;
    }
  };

  const writeCatalogCache = (list: Product[]) => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        CATALOG_CACHE_KEY,
        JSON.stringify({ at: Date.now(), products: list })
      );
    } catch {
      /* ignore quota */
    }
  };

  const refreshProducts = (forceFresh = false) => {
    // Soft SWR: keep previous catalog on screen — only skeleton when empty
    if (productsRef.current.length === 0) {
      setProductsLoading(true);
    }
    const url = forceFresh ? '/api/products?fresh=1' : '/api/products';
    const opts: RequestInit = {
      ...(forceFresh ? { cache: 'no-store' as RequestCache } : {}),
      // Fail fast — never leave the shop on a blank skeleton when Neon/pool stalls.
      signal: AbortSignal.timeout(10_000),
    };
    fetch(url, opts)
      .then(async (res) => {
        // Redeploy maintenance HTML / 5xx must never blank the shop or spam as a fatal app error
        const ctype = res.headers.get('content-type') || '';
        if (!res.ok || !ctype.includes('application/json')) {
          throw new Error(`catalog unavailable (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) return;
        // Keep last good catalog if API soft-returns []
        if (data.length === 0 && productsRef.current.length > 0) return;
        setProducts(data);
        if (data.length > 0) writeCatalogCache(data);
      })
      .catch(() => {
        if (productsRef.current.length === 0) {
          const cached = readCatalogCache(true);
          if (cached?.length) {
            productsRef.current = cached;
            setProducts(cached);
          }
          // leave [] only when we truly never had products — no throw, no console spam
        }
      })
      .finally(() => setProductsLoading(false));
  };

  // Hydrate cart/wishlist/user BEFORE any sync (prevents empty-cart wipe)
  useEffect(() => {
    const cached = readCatalogCache();
    if (cached?.length) {
      // Sync ref immediately so refreshProducts() does not flash skeleton over cache
      productsRef.current = cached;
      setProducts(cached);
      setProductsLoading(false);
    }
    refreshProducts();

    const localCart = readLocalCart();
    const localWish = readLocalWishlist();
    if (localCart.length) setCart(localCart);
    if (localWish.length) setWishlist(localWish);
    try {
      const raw = localStorage.getItem('bpg_saved_later');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedForLater(parsed);
      }
    } catch {
      /* ignore */
    }

    const savedUser = localStorage.getItem('bpg_user_next');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u?.id) {
          const { token: _legacy, ...safeUser } = u;
          setUser(safeUser);
          fetch(`/api/auth?userId=${encodeURIComponent(u.id)}`, {
            credentials: 'include',
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((dbUser) => {
              if (dbUser?.user) {
                const nextUser = {
                  ...dbUser.user,
                  needsProfile:
                    dbUser.user.needsProfile ??
                    (userNeedsProfile(dbUser.user.phone) ||
                      String(dbUser.user.name || '').trim().length < 2),
                };
                setUser(nextUser);
                persistSessionUser(nextUser);
                if (nextUser.needsProfile) {
                  setIsAuthOpen(true);
                }
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

  // Realtime stock push — SSE fed by Postgres LISTEN/NOTIFY (`/api/stock/stream`).
  // Every write that changes books.stock/status (admin edit, Razorpay hold
  // reserve/release, order placement, cancel restore) notifies this stream
  // within milliseconds, so a book going out of stock greys out the card and
  // disables ADD/BUY NOW instantly, without waiting on any poll.
  const sseConnectedRef = useRef(false);

  const applyStockPush = useCallback((incoming: StockPushEntry[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const byId = new Map(incoming.map((b) => [String(b.id), b]));
    const known = new Set(productsRef.current.map((p) => String(p.id)));
    const unknownIds = [...byId.keys()].some((id) => !known.has(id));

    setProducts((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const upd = byId.get(String(p.id));
        if (!upd) return p;
        if (p.stock === upd.stock && p.inStock === upd.inStock) return p;
        changed = true;
        return { ...p, stock: upd.stock, inStock: upd.inStock };
      });
      if (changed) writeCatalogCache(next);
      return changed ? next : prev;
    });

    if (unknownIds) {
      // New book id — stock patch alone cannot invent a product card
      queueMicrotask(() => refreshProducts(true));
    }

    // Mirror into the live cart too — cross-cutting: a card going OOS while
    // it's already in someone's cart must disable checkout for it as well.
    setCart((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const upd = byId.get(String(item.id));
        if (!upd) return item;
        const clampedQty = upd.inStock ? Math.min(item.qty, Math.max(1, upd.stock)) : item.qty;
        if (item.stock === upd.stock && item.inStock === upd.inStock && clampedQty === item.qty) return item;
        changed = true;
        return { ...item, stock: upd.stock, inStock: upd.inStock, qty: clampedQty };
      });
      if (changed) {
        try {
          localStorage.setItem('bpg_cart_next', JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      es = new EventSource('/api/stock/stream');

      es.onopen = () => {
        sseConnectedRef.current = true;
      };

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.type === 'COUPONS_CHANGED') {
            window.dispatchEvent(new Event('bpg:coupons-changed'));
            return;
          }
          if (data?.type === 'CATALOG_CHANGED') {
            // Admin added/edited/deleted a book — soft-refresh full catalog
            refreshProducts(true);
            return;
          }
          if (data?.type === 'STOCK_CHANGED' && Array.isArray(data.books)) {
            applyStockPush(data.books);
          }
        } catch {
          /* ignore malformed frame */
        }
      };

      es.onerror = () => {
        sseConnectedRef.current = false;
        // Browser EventSource auto-retries on transient errors; only take over
        // reconnection once it gives up and the connection is fully closed
        // (e.g. server rate-limited us or dropped the stream).
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      sseConnectedRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) es.close();
    };
     
  }, []);

  // Slow catalog poll always — catches missed SSE (new books / price edits).
  // Faster 15s poll only while SSE is down.
  useEffect(() => {
    const CATALOG_POLL_MS = 20_000;
    const STOCK_FALLBACK_MS = 15_000;
    const tick = (forceFresh = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshProducts(forceFresh);
    };
    const catalogInterval = setInterval(() => tick(true), CATALOG_POLL_MS);
    const stockFallback = setInterval(() => {
      if (sseConnectedRef.current) return;
      tick(true);
    }, STOCK_FALLBACK_MS);
    return () => {
      clearInterval(catalogInterval);
      clearInterval(stockFallback);
    };
     
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
    // Prefer the freshest catalog snapshot (kept live by the 15s poll) over
    // whatever stale product object the caller passed in.
    const live = productsRef.current.find((p) => p.id === product.id) || product;
    if (live.inStock === false) {
      showToast(`❌ "${live.title}" is out of stock`);
      return;
    }
    const stockLimit = typeof live.stock === 'number' ? Math.max(0, live.stock) : Infinity;

    let toastMsg = '';
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const currentQty = existing ? existing.qty : 0;
      const desiredQty = currentQty + qty;
      const finalQty = Math.min(desiredQty, stockLimit);

      if (finalQty <= currentQty) {
        toastMsg = `⚠️ Only ${stockLimit} of "${live.title}" available — already at max in your cart`;
        return prev;
      }

      toastMsg =
        finalQty < desiredQty
          ? `⚠️ Only ${stockLimit} of "${live.title}" left — added up to the limit`
          : `✓ Added "${live.title}" to cart!`;

      const updated: CartItem[] = existing
        ? prev.map((item) =>
            item.id === product.id
              ? { ...item, qty: finalQty, stock: live.stock, inStock: live.inStock }
              : item
          )
        : [...prev, { ...live, qty: finalQty }];
      localStorage.setItem('bpg_cart_next', JSON.stringify(updated));
      return updated;
    });
    showToast(toastMsg);
  };

  const requestCheckout = (open: boolean) => {
    if (open && !user) {
      setIsAuthOpen(true);
      showToast('Please continue with Google to place an order');
      return;
    }
    if (open && user && (user.needsProfile || userNeedsProfile(user.phone))) {
      setIsAuthOpen(true);
      showToast('Please add your mobile number before checkout');
      return;
    }
    setIsCheckoutOpen(open);
  };

  const updateQty = (id: string | number, delta: number) => {
    let toastMsg = '';
    setCart((prev) => {
      const next = prev
        .map((item) => {
          if (item.id !== id) return item;
          const live = productsRef.current.find((p) => p.id === id);
          const stockSource = typeof live?.stock === 'number' ? live.stock : item.stock;
          const stockLimit = typeof stockSource === 'number' ? Math.max(0, stockSource) : Infinity;
          const isOos = live ? live.inStock === false : item.inStock === false;
          const newQty = item.qty + delta;

          if (delta > 0 && isOos) {
            toastMsg = `⚠️ "${item.title}" is out of stock — cannot add more`;
            return item;
          }
          if (delta > 0 && newQty > stockLimit) {
            toastMsg = `⚠️ Only ${stockLimit} of "${item.title}" available`;
            return stockLimit > item.qty ? { ...item, qty: stockLimit } : item;
          }
          return newQty > 0 ? { ...item, qty: newQty } : null;
        })
        .filter(Boolean) as CartItem[];
      localStorage.setItem('bpg_cart_next', JSON.stringify(next));
      return next;
    });
    if (toastMsg) showToast(toastMsg);
  };

  const removeFromCart = (id: string | number) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const saveForLater = (id: string | number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      setSavedForLater((later) => {
        const next = later.some((l) => l.id === id)
          ? later.map((l) => (l.id === id ? { ...l, qty: l.qty + item.qty } : l))
          : [...later, item];
        try {
          localStorage.setItem('bpg_saved_later', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      showToast('Saved for later');
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveToCartFromSaved = (id: string | number) => {
    const item = savedForLater.find((i) => i.id === id);
    if (!item) return;
    setSavedForLater((later) => {
      const next = later.filter((i) => i.id !== id);
      try {
        localStorage.setItem('bpg_saved_later', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    addToCart(item, item.qty);
  };

  const clearCart = useCallback(() => {
    setCart([]);
    try {
      localStorage.setItem('bpg_cart_next', '[]');
    } catch {
      /* ignore */
    }
  }, []);

  /** Clear cart locally + on server immediately after a successful order. */
  const clearCartAfterOrder = useCallback(() => {
    setCart([]);
    try {
      localStorage.setItem('bpg_cart_next', '[]');
    } catch {
      /* ignore */
    }
    if (user?.id && user?.token) {
      fetch('/api/user/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ cart: [], wishlist }),
      }).catch(() => {});
    }
  }, [user?.id, user?.token, wishlist]);

  /**
   * Authoritative live stock check against the DB (not just the polled catalog
   * snapshot). Clamps quantities, drops out-of-stock items, and toasts what
   * changed. Called periodically while the cart has items, and synchronously
   * before checkout / opening Razorpay. Returns true when the cart is clean.
   */
  const validateCartStock = useCallback(async (): Promise<boolean> => {
    const current = cartRef.current;
    if (current.length === 0) return true;

    setIsValidatingCartStock(true);
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: current.map((c) => ({ id: c.id, qty: c.qty, title: c.title })),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return true; // soft-fail — don't block the shop on a network hiccup
      const data = await res.json();
      const results: any[] = Array.isArray(data.items) ? data.items : [];
      if (results.length === 0) return true;

      let clean = true;
      const messages: string[] = [];

      setCart((prev) => {
        const next: CartItem[] = [];
        for (const item of prev) {
          const r = results.find((x) => String(x.id) === String(item.id));
          if (!r) {
            next.push(item);
            continue;
          }
          if (r.removed || !r.inStock || r.allowedQty <= 0) {
            clean = false;
            messages.push(r.message || `"${item.title}" is out of stock — removed from cart`);
            continue;
          }
          if (r.allowedQty < item.qty) {
            clean = false;
            messages.push(r.message || `Only ${r.allowedQty} of "${item.title}" available — quantity updated`);
            next.push({ ...item, qty: r.allowedQty, stock: r.availableStock, inStock: true });
          } else if (item.stock !== r.availableStock || item.inStock !== r.inStock) {
            next.push({ ...item, stock: r.availableStock, inStock: r.inStock });
          } else {
            next.push(item);
          }
        }
        try {
          localStorage.setItem('bpg_cart_next', JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });

      if (messages.length > 0) {
        showToast(`⚠️ ${messages[0]}${messages.length > 1 ? ` (+${messages.length - 1} more)` : ''}`);
      }
      return clean;
    } catch {
      return true; // network error — don't block, the final server-side order check still protects us
    } finally {
      setIsValidatingCartStock(false);
    }
  }, [showToast]);

  // Keep the cart honest every few seconds while it has items — catches an
  // admin marking something out of stock (or dropping qty) while the
  // customer is browsing the cart/checkout in another tab.
  useEffect(() => {
    if (!hydrated || cart.length === 0) return;
    const POLL_MS = 8_000;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void validateCartStock();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [hydrated, cart.length, validateCartStock]);

  const toggleWishlist = (id: string | number) => {
    if (!user) {
      setIsAuthOpen(true);
      showToast('Please sign in with Google to use wishlist');
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
    const nextUser: UserData = {
      ...userData,
      needsProfile:
        userData.needsProfile ??
        (userNeedsProfile(userData.phone) || String(userData.name || '').trim().length < 2),
    };
    setUser(nextUser);
    persistSessionUser(nextUser);
    if (nextUser.needsProfile) {
      setIsAuthOpen(true);
    }

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

    showToast(`✓ Account Synced! Welcome back, ${nextUser.name}!`);
  };

  const logoutUser = () => {
    setUser(null);
    setCart([]);
    setWishlist([]);
    localStorage.removeItem('bpg_user_next');
    localStorage.removeItem('bpg_cart_next');
    localStorage.removeItem('bpg_wishlist_next');
    localStorage.removeItem('bpg_user_addresses');
    fetch('/api/auth', { method: 'DELETE', credentials: 'include' }).catch(() => {});
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
    const previousProducts = products;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...withDerived } : p)));
    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ id, ...withDerived, hasDiscount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
      }
      refreshProducts(true);
      showToast(
        rest.stock !== undefined
          ? `✓ Stock updated — ${Math.max(0, Math.floor(Number(rest.stock) || 0))} units`
          : rest.inStock === false
            ? '✓ Marked out of stock — hidden from shop'
            : rest.inStock === true
              ? '✓ Back in stock — visible on shop'
              : '✓ Product saved to database'
      );
    } catch (e: any) {
      setProducts(previousProducts);
      showToast(`❌ ${e?.message || 'Failed to save product'}`);
    }
  };

  const addNewProductToDb = async (newProdData: Partial<Product>) => {
    if (!user?.token) {
      showToast('❌ Please log in again as admin');
      return;
    }
    const tempId = `bpg-${Date.now()}`;
    const mrp = Number(newProdData.mrp || newProdData.price || 0);
    const price = Number(newProdData.price || mrp);
    const hasDiscount = price < mrp;
    const tempProduct: Product = {
      id: tempId,
      slug: tempId,
      title: String(newProdData.title || 'New Book'),
      subtitle: `${newProdData.cls || '10th'} Standard Guide`,
      cls: newProdData.cls || '10th',
      category: (newProdData.category as any) || 'guide',
      subject: 'State Board',
      price: hasDiscount ? price : mrp,
      mrp,
      discount: hasDiscount && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0,
      rating: 5,
      reviews: 0,
      badge: String(newProdData.badge || ''),
      badgeColor: String(newProdData.badge || '').toUpperCase().includes('COMBO') ? 'bg-purple-600' : 'bg-blue-600',
      image: newProdData.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      hoverImage: newProdData.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      description: newProdData.description || `Complete ${newProdData.cls || '10th'} Standard ${newProdData.title} guide.`,
      features: ['Solved Papers', 'Chapter Notes'],
      inStock: Math.max(0, Math.floor(Number(newProdData.stock) || 0)) > 0,
      stock: Math.max(0, Math.floor(Number(newProdData.stock) || 0)),
      isBestSeller: String(newProdData.badge || '').toUpperCase().includes('BEST'),
    };

    setProducts((prev) => [tempProduct, ...prev]);

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
          stock: Math.max(0, Math.floor(Number(newProdData.stock) || 0)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      if (data?.id) {
        setProducts((prev) => prev.map((p) => (p.id === tempId ? { ...p, id: data.id, slug: data.slug || data.id } : p)));
      }
      // Pull authoritative mapped catalog so every open shop tab (and this one) match DB
      refreshProducts(true);
      showToast(`🎉 Book "${newProdData.title}" saved to database`);
    } catch (err: any) {
      setProducts((prev) => prev.filter((p) => p.id !== tempId));
      const msg = err?.message || 'Unknown error';
      showToast(msg.includes('Forbidden') || msg.includes('Unauthorized')
        ? '❌ Admin login required — log out and log in again'
        : `❌ Failed to add product: ${msg}`);
    }
  };

  const deleteProductFromDb = async (id: string | number) => {
    const previousProducts = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Delete failed');
      refreshProducts(true);
      showToast(`🗑️ Book removed from database`);
    } catch {
      setProducts(previousProducts);
      showToast('❌ Failed to delete product');
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const shippingFee = deliveryFeeForQty(cartCount);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const cartGrandTotal = cartCount > 0 ? cartTotal + shippingFee : 0;

  useEffect(() => {
    setCheckoutTotal(cartGrandTotal);
  }, [cartGrandTotal]);

  /** Debounced abandoned-cart ping (analytics only — no SMS / no bot messages). */
  useEffect(() => {
    if (!hydrated || !user?.phone || cart.length === 0) return;
    const t = setTimeout(() => {
      fetch('/api/cart/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          phone: user.phone,
          name: user.name,
          cart: cart.map((c) => ({ id: c.id, title: c.title, qty: c.qty, price: c.price })),
        }),
      }).catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, [hydrated, user?.phone, user?.name, user?.token, cart]);

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
        clearCartAfterOrder,
        validateCartStock,
        isValidatingCartStock,
        saveForLater,
        moveToCartFromSaved,
        savedForLater,
        toggleWishlist,
        loginUser,
        logoutUser,
        updateProductInDb,
        addNewProductToDb,
        deleteProductFromDb,
        refreshProducts,
        cartTotal,
        cartCount,
        checkoutTotal,
        setCheckoutTotal,
        shippingFee,
        cartGrandTotal,
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
