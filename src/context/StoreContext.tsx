'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { userNeedsProfile } from '@/lib/userProfile';
import { deliveryFeeForQty, cartHasCombo, effectiveBookCount, isMoqSatisfied } from '@/lib/deliveryRules';

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
  comboSubjects?: string[];
  isNew?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  language?: string;
  medium?: string;
}

export interface CartItem extends Product {
  qty: number;
  selectedMedium?: string;
}

/** Payload shape pushed by `/api/stock/stream` on every `STOCK_CHANGED` event. */
interface StockPushEntry {
  id: string;
  stock: number;
  status: string;
  inStock: boolean;
  price?: number;
  mrp?: number;
  discount?: number;
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
  addToCart: (product: Product, qty?: number, selectedMedium?: string) => void;
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
  wishlistCount: number;
  toggleWishlist: (id: string | number) => void;
  removeFromWishlist: (id: string | number) => void;
  clearWishlist: () => void;
  loginUser: (
    u: UserData,
    restoredCart?: CartItem[],
    restoredWishlist?: (string | number)[],
    restoredAddresses?: any[]
  ) => void;
  logoutUser: () => void;
  updateProductInDb: (id: string | number, updatedData: Partial<Product> & { hasDiscount?: boolean }) => Promise<any>;
  addNewProductToDb: (newProdData: Partial<Product> & { status?: string }) => Promise<any>;
  deleteProductFromDb: (id: string | number) => Promise<any>;
  refreshProducts: (bypassCache?: boolean) => void;
  cartTotal: number;
  cartCount: number;
  checkoutTotal: number;
  setCheckoutTotal: (amount: number) => void;
  shippingFee: number;
  hasComboInCart: boolean;
  effectiveCartCount: number;
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
  const recentAdminEditsRef = useRef<Map<string, number>>(new Map());
  const refreshInFlightRef = useRef(false);
  const lastRefreshTsRef = useRef(0);

  const cartRef = useRef<CartItem[]>([]);
  cartRef.current = cart;

  const [isValidatingCartStock, setIsValidatingCartStock] = useState(false);

  const CATALOG_CACHE_KEY = 'bpg_catalog_cache_v2';
  const CATALOG_TTL_MS = 30 * 1000; // 30-second client cache — ensures price changes show instantly

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
    const now = Date.now();
    // Non-fresh requests can be throttled/deduplicated; forceFresh requests must always proceed
    if (!forceFresh) {
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshTsRef.current < 2000) return;
    }
    refreshInFlightRef.current = true;

    // Soft SWR: keep previous catalog on screen — only skeleton when empty
    if (productsRef.current.length === 0) {
      setProductsLoading(true);
    }
    const url = forceFresh ? '/api/products?fresh=1' : '/api/products';
    const opts: RequestInit = {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    };
    fetch(url, opts)
      .then(async (res) => {
        const ctype = res.headers.get('content-type') || '';
        if (!res.ok || !ctype.includes('application/json')) {
          throw new Error(`catalog unavailable (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) return;
        if (data.length === 0 && productsRef.current.length > 0) return;

        // Admin-aware merge: if any product was recently edited by the admin,
        // preserve the local optimistic state for that product instead of
        // overwriting it with the server response (which may be fractionally stale
        // due to cache/CDN or just reflect the same data we already set).
        const hasRecentEdits = recentAdminEditsRef.current.size > 0;
        if (hasRecentEdits) {
          const editCutoff = Date.now() - 30_000;
          const protectedIds = new Set<string>();
          for (const [pid, ts] of recentAdminEditsRef.current) {
            if (ts > editCutoff) protectedIds.add(pid);
            else recentAdminEditsRef.current.delete(pid);
          }
          if (protectedIds.size > 0) {
            // Build a map of server data, then overlay our protected local state
            const serverById = new Map(data.map((p: Product) => [String(p.id), p]));
            const localById = new Map(productsRef.current.map((p) => [String(p.id), p]));
            const merged = data.map((serverProd: Product) => {
              const pid = String(serverProd.id);
              if (protectedIds.has(pid) && localById.has(pid)) {
                return localById.get(pid)!;
              }
              return serverProd;
            });
            // Also include any local-only products (temp IDs from add that hasn't resolved yet)
            for (const [pid, localProd] of localById) {
              if (!serverById.has(pid)) merged.push(localProd);
            }
            setProducts(merged);
            if (merged.length > 0) writeCatalogCache(merged);
            return;
          }
        }
        setProducts(data);
        if (data.length > 0) {
          writeCatalogCache(data);

          // Reconcile active cart prices with the fresh server catalog
          setCart((prevCart) => {
            let cartChanged = false;
            const catalogById = new Map(data.map((b: Product) => [String(b.id), b]));
            const updatedCart = prevCart.map((item) => {
              const fresh = catalogById.get(String(item.id));
              if (!fresh) return item;
              if (
                item.price === fresh.price &&
                item.mrp === fresh.mrp &&
                item.discount === fresh.discount &&
                item.inStock === fresh.inStock &&
                item.stock === fresh.stock
              ) {
                return item;
              }
              cartChanged = true;
              return {
                ...item,
                price: fresh.price,
                mrp: fresh.mrp,
                discount: fresh.discount,
                inStock: fresh.inStock,
                stock: fresh.stock,
              };
            });
            if (cartChanged) {
              try {
                localStorage.setItem('bpg_cart_next', JSON.stringify(updatedCart));
              } catch {}
              return updatedCart;
            }
            return prevCart;
          });

          // Reconcile savedForLater prices
          setSavedForLater((prevLater) => {
            let laterChanged = false;
            const catalogById = new Map(data.map((b: Product) => [String(b.id), b]));
            const updatedLater = prevLater.map((item) => {
              const fresh = catalogById.get(String(item.id));
              if (!fresh) return item;
              if (item.price === fresh.price && item.mrp === fresh.mrp && item.discount === fresh.discount) {
                return item;
              }
              laterChanged = true;
              return {
                ...item,
                price: fresh.price,
                mrp: fresh.mrp,
                discount: fresh.discount,
                inStock: fresh.inStock,
                stock: fresh.stock,
              };
            });
            if (laterChanged) {
              try {
                localStorage.setItem('bpg_saved_later', JSON.stringify(updatedLater));
              } catch {}
              return updatedLater;
            }
            return prevLater;
          });
        }
      })
      .catch(() => {
        if (productsRef.current.length === 0) {
          const cached = readCatalogCache(true);
          if (cached?.length) {
            productsRef.current = cached;
            setProducts(cached);
          }
        }
      })
      .finally(() => {
        refreshInFlightRef.current = false;
        lastRefreshTsRef.current = Date.now();
        setProductsLoading(false);
      });
  };

  // Hydrate cart/wishlist/user BEFORE any sync (prevents empty-cart wipe)
  useEffect(() => {
    try {
      sessionStorage.removeItem('bpg_catalog_cache_v1');
    } catch {}
    const cached = readCatalogCache();
    if (cached?.length) {
      // Sync ref immediately so refreshProducts() does not flash skeleton over cache
      productsRef.current = cached;
      setProducts(cached);
      setProductsLoading(false);
    }
    const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    refreshProducts(isAdminPath);

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
                const isExplicitlyCleared = localStorage.getItem('bpg_wishlist_cleared') === 'true';
                if (!isExplicitlyCleared && !localWish.length && Array.isArray(dbUser.wishlist) && dbUser.wishlist.length > 0) {
                  setWishlist(dbUser.wishlist);
                  localStorage.setItem('bpg_wishlist_next', JSON.stringify(dbUser.wishlist));
                }
              } else {
                setUser(null);
                localStorage.removeItem('bpg_user_next');
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

  // Lightweight background visitor heartbeat ping for live system monitoring (runs every 25s when tab is visible)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastPing = 0;
    const sendPing = () => {
      const now = Date.now();
      if (now - lastPing < 10000) return; // debounce 10s min
      lastPing = now;

      let currentPath = window.location.pathname || '/';
      if (isCheckoutOpen) currentPath = '/checkout';
      else if (isCartOpen) currentPath = '/cart';

      fetch('/api/track/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath }),
        keepalive: true,
      }).catch(() => {});
    };

    // Initial ping on mount after slight delay so it doesn't compete with catalog fetch
    const initialTimer = setTimeout(sendPing, 1500);

    // Periodic heartbeat every 25s while tab is visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        sendPing();
      }
    }, 25000);

    // Ping on re-focusing the tab
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        sendPing();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [isCheckoutOpen, isCartOpen]);

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
        const lastEdit = recentAdminEditsRef.current.get(String(p.id)) || 0;
        if (Date.now() - lastEdit < 30000) {
          return p;
        }
        const newPrice = typeof upd.price === 'number' && Number.isFinite(upd.price) && upd.price > 0 ? upd.price : p.price;
        const newMrp = typeof upd.mrp === 'number' && Number.isFinite(upd.mrp) && upd.mrp > 0 ? upd.mrp : p.mrp;
        const newDiscount = typeof upd.discount === 'number' ? upd.discount : p.discount;

        if (
          p.stock === upd.stock &&
          p.inStock === upd.inStock &&
          p.price === newPrice &&
          p.mrp === newMrp &&
          p.discount === newDiscount
        ) {
          return p;
        }
        changed = true;
        return {
          ...p,
          stock: upd.stock,
          inStock: upd.inStock,
          price: newPrice,
          mrp: newMrp,
          discount: newDiscount,
        };
      });
      if (changed) writeCatalogCache(next);
      return changed ? next : prev;
    });

    if (unknownIds) {
      // New book id — stock patch alone cannot invent a product card
      queueMicrotask(() => refreshProducts(true));
    }

    // Mirror into the live cart too — instant update of stock, inStock AND price / mrp / discount
    setCart((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const upd = byId.get(String(item.id));
        if (!upd) return item;
        const clampedQty = upd.inStock ? Math.min(item.qty, Math.max(1, upd.stock)) : item.qty;
        const newPrice = typeof upd.price === 'number' && Number.isFinite(upd.price) && upd.price > 0 ? upd.price : item.price;
        const newMrp = typeof upd.mrp === 'number' && Number.isFinite(upd.mrp) && upd.mrp > 0 ? upd.mrp : item.mrp;
        const newDiscount = typeof upd.discount === 'number' ? upd.discount : item.discount;

        if (
          item.stock === upd.stock &&
          item.inStock === upd.inStock &&
          clampedQty === item.qty &&
          item.price === newPrice &&
          item.mrp === newMrp &&
          item.discount === newDiscount
        ) {
          return item;
        }
        changed = true;
        const isAdminPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
        if (!isAdminPage) {
          if (item.price !== newPrice) {
            showToast(`⚡ Price update: "${item.title}" is now ₹${newPrice}`);
          } else if (!upd.inStock && item.inStock) {
            showToast(`⚠️ "${item.title}" is now Out of Stock`);
          }
        }
        return {
          ...item,
          stock: upd.stock,
          inStock: upd.inStock,
          qty: clampedQty,
          price: newPrice,
          mrp: newMrp,
          discount: newDiscount,
        };
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

    // Also mirror into savedForLater
    setSavedForLater((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const upd = byId.get(String(item.id));
        if (!upd) return item;
        const newPrice = typeof upd.price === 'number' && Number.isFinite(upd.price) && upd.price > 0 ? upd.price : item.price;
        const newMrp = typeof upd.mrp === 'number' && Number.isFinite(upd.mrp) && upd.mrp > 0 ? upd.mrp : item.mrp;
        const newDiscount = typeof upd.discount === 'number' ? upd.discount : item.discount;
        if (
          item.stock === upd.stock &&
          item.inStock === upd.inStock &&
          item.price === newPrice &&
          item.mrp === newMrp &&
          item.discount === newDiscount
        ) {
          return item;
        }
        changed = true;
        return {
          ...item,
          stock: upd.stock,
          inStock: upd.inStock,
          price: newPrice,
          mrp: newMrp,
          discount: newDiscount,
        };
      });
      if (changed) {
        try {
          localStorage.setItem('bpg_saved_later', JSON.stringify(next));
        } catch {}
      }
      return changed ? next : prev;
    });
  }, [showToast]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;



    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const disconnect = () => {
      sseConnectedRef.current = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (es) {
        es.close();
        es = null;
      }
    };

    const connect = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      disconnect();
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
            // Only do a full refresh if admin has NOT recently edited a product.
            // The optimistic local state is already correct; a full refetch would
            // cause a flicker as the entire products array gets replaced.
            const editCutoff = Date.now() - 30_000;
            let hasRecentEdit = false;
            for (const [, ts] of recentAdminEditsRef.current) {
              if (ts > editCutoff) { hasRecentEdit = true; break; }
            }
            if (!hasRecentEdit) refreshProducts(true);
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
        try {
          es?.close();
        } catch {}
        es = null;
        if (!stopped) {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 15000);
        }
      };
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Delay slightly so we don't race with the SSE reconnect
        setTimeout(() => refreshProducts(), 1000);
        connect();
      } else {
        disconnect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      disconnect();
    };
  }, []);

  // Lightweight delta poll: only checks price and stock deltas (~200 bytes)
  // instead of re-downloading the entire catalog every 20 seconds.
  useEffect(() => {
    const pollLiveStock = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/products/live', { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data.books && typeof data.books === 'object') {
          const list = Object.values(data.books) as StockPushEntry[];
          applyStockPush(list);
        }
      } catch {}
    };

    // Poll live stock delta every 20s (or every 10s if SSE is temporarily disconnected)
    const stockInterval = setInterval(() => {
      void pollLiveStock();
    }, sseConnectedRef.current ? 20_000 : 10_000);

    // Full catalog refresh only once every 3 minutes as an ultimate safety net
    const catalogSafetyInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshProducts(false);
    }, 180_000);

    return () => {
      clearInterval(stockInterval);
      clearInterval(catalogSafetyInterval);
    };
  }, [applyStockPush]);

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
        credentials: 'include',
        body: JSON.stringify({
          cart,
          wishlist,
        }),
      })
        .then((res) => {
          if (res.status === 404) {
            setUser(null);
            localStorage.removeItem('bpg_user_next');
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
    try {
      localStorage.setItem('bpg_cart_next', JSON.stringify(cart));
      localStorage.setItem('bpg_wishlist_next', JSON.stringify(wishlist));
    } catch {
      /* ignore quota */
    }
  }, [cart, wishlist, hydrated]);

  // Multi-tab storage synchronizer — ensures Cart & Wishlist update instantly across all browser tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bpg_cart_next' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setCart(parsed);
          }
        } catch {
          /* ignore */
        }
      } else if (e.key === 'bpg_saved_later' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setSavedForLater(parsed);
          }
        } catch {
          /* ignore */
        }
      } else if (e.key === 'bpg_wishlist_next' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setWishlist(parsed);
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Realtime Catalog-to-Cart Price Synchronizer:
  // Whenever the catalog updates (via SSE CATALOG_CHANGED, 20s background poll, or admin edit),
  // instantly reconcile prices, mrp, discounts and stock for every item in the cart & saved for later.
  useEffect(() => {
    if (!products || products.length === 0) return;

    setCart((prevCart) => {
      if (!prevCart || prevCart.length === 0) return prevCart;
      let changed = false;
      const nextCart = prevCart.map((item) => {
        const live = products.find((p) => String(p.id) === String(item.id));
        if (!live) return item;

        const livePrice = Number(live.price);
        const liveMrp = Number(live.mrp || livePrice);
        const liveDiscount = Number(live.discount || 0);

        const priceDiff = Number.isFinite(livePrice) && livePrice > 0 && item.price !== livePrice;
        const mrpDiff = Number.isFinite(liveMrp) && liveMrp > 0 && item.mrp !== liveMrp;
        const discDiff = item.discount !== liveDiscount;
        const stockDiff = live.stock !== undefined && item.stock !== live.stock;
        const inStockDiff = live.inStock !== undefined && item.inStock !== live.inStock;

        if (priceDiff || mrpDiff || discDiff || stockDiff || inStockDiff) {
          changed = true;
          return {
            ...item,
            price: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : item.price,
            mrp: Number.isFinite(liveMrp) && liveMrp > 0 ? liveMrp : item.mrp,
            discount: liveDiscount,
            stock: live.stock !== undefined ? live.stock : item.stock,
            inStock: live.inStock !== undefined ? live.inStock : item.inStock,
          };
        }
        return item;
      });

      if (changed) {
        try {
          localStorage.setItem('bpg_cart_next', JSON.stringify(nextCart));
        } catch {
          /* ignore quota */
        }
      }
      return changed ? nextCart : prevCart;
    });

    setSavedForLater((prevLater) => {
      if (!prevLater || prevLater.length === 0) return prevLater;
      let changed = false;
      const nextLater = prevLater.map((item) => {
        const live = products.find((p) => String(p.id) === String(item.id));
        if (!live) return item;

        const livePrice = Number(live.price);
        const liveMrp = Number(live.mrp || livePrice);
        const liveDiscount = Number(live.discount || 0);

        const priceDiff = Number.isFinite(livePrice) && livePrice > 0 && item.price !== livePrice;
        const mrpDiff = Number.isFinite(liveMrp) && liveMrp > 0 && item.mrp !== liveMrp;
        const discDiff = item.discount !== liveDiscount;

        if (priceDiff || mrpDiff || discDiff) {
          changed = true;
          return {
            ...item,
            price: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : item.price,
            mrp: Number.isFinite(liveMrp) && liveMrp > 0 ? liveMrp : item.mrp,
            discount: liveDiscount,
          };
        }
        return item;
      });

      if (changed) {
        try {
          localStorage.setItem('bpg_saved_later', JSON.stringify(nextLater));
        } catch {
          /* ignore quota */
        }
      }
      return changed ? nextLater : prevLater;
    });

    if (quickViewProduct) {
      const live = products.find((p) => String(p.id) === String(quickViewProduct.id));
      if (
        live &&
        (live.price !== quickViewProduct.price ||
          live.mrp !== quickViewProduct.mrp ||
          live.inStock !== quickViewProduct.inStock)
      ) {
        setQuickViewProduct(live);
      }
    }
  }, [products, quickViewProduct]);

  const getAdminHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) headers.Authorization = `Bearer ${user.token}`;
    return headers;
  };

  const addToCart = (product: Product, qty: number = 1, selectedMedium?: string) => {
    // Prefer the freshest catalog snapshot (kept live by the 15s poll) over
    // whatever stale product object the caller passed in.
    const live = productsRef.current.find((p) => String(p.id) === String(product.id)) || product;
    if (live.inStock === false) {
      showToast(`❌ "${live.title}" is out of stock`);
      return;
    }
    const stockLimit = typeof live.stock === 'number' ? Math.max(0, live.stock) : Infinity;
    const finalMedium = selectedMedium || (live.language && live.language !== 'Both' ? live.language : undefined);

    let toastMsg = '';
    setCart((prev) => {
      const existing = prev.find(
        (item) => String(item.id) === String(product.id) && (item.selectedMedium === finalMedium || !finalMedium)
      );
      const currentQty = existing ? existing.qty : 0;
      const desiredQty = currentQty + qty;
      const finalQty = Math.min(desiredQty, stockLimit);

      if (finalQty <= currentQty) {
        toastMsg = `⚠️ Only ${stockLimit} of "${live.title}" available — already at max in your cart`;
        return prev;
      }

      const mediumLabel = finalMedium ? ` [${finalMedium}]` : '';
      toastMsg =
        finalQty < desiredQty
          ? `⚠️ Only ${stockLimit} of "${live.title}" left — added up to the limit`
          : `✓ Added "${live.title}"${mediumLabel} to cart!`;

      const updated: CartItem[] = existing
        ? prev.map((item) =>
            item === existing
              ? {
                  ...item,
                  qty: finalQty,
                  selectedMedium: finalMedium || item.selectedMedium,
                  stock: live.stock,
                  inStock: live.inStock,
                  price: live.price,
                  mrp: live.mrp,
                  discount: live.discount,
                }
              : item
          )
        : [...prev, { ...live, qty: finalQty, selectedMedium: finalMedium }];
      try {
        localStorage.setItem('bpg_cart_next', JSON.stringify(updated));
      } catch {}

      // Instant abandoned cart sync on Add To Cart
      const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
      if (p) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: p,
            name: user?.name || 'Student',
            cart: updated.map((c) => ({
              id: c.id,
              title: c.selectedMedium ? `${c.title} (${c.selectedMedium})` : c.title,
              qty: c.qty,
              price: c.price,
            })),
            cleared: false,
          }),
        }).catch(() => {});
      }

      return updated;
    });
    if (toastMsg) showToast(toastMsg);
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
          if (String(item.id) !== String(id)) return item;
          const live = productsRef.current.find((p) => String(p.id) === String(id));
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
          if (newQty <= 0) return null;
          return {
            ...item,
            qty: newQty,
            price: live && typeof live.price === 'number' ? live.price : item.price,
            mrp: live && typeof live.mrp === 'number' ? live.mrp : item.mrp,
            discount: live && typeof live.discount === 'number' ? live.discount : item.discount,
          };
        })
        .filter(Boolean) as CartItem[];
      try {
        localStorage.setItem('bpg_cart_next', JSON.stringify(next));
      } catch {}

      // Instant abandoned cart sync on quantity update
      const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
      if (p) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: p,
            name: user?.name || 'Student',
            cart: next.map((c) => ({ id: c.id, title: c.title, qty: c.qty, price: c.price })),
            cleared: next.length === 0,
          }),
        }).catch(() => {});
      }

      return next;
    });
    if (toastMsg) showToast(toastMsg);
  };

  const removeFromCart = (id: string | number) => {
    setCart((prev) => {
      const next = prev.filter((item) => String(item.id) !== String(id));
      try {
        localStorage.setItem('bpg_cart_next', JSON.stringify(next));
      } catch {}

      // Instant abandoned cart sync
      const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
      if (p) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: p,
            name: user?.name || 'Student',
            cart: next.map((c) => ({ id: c.id, title: c.title, qty: c.qty, price: c.price })),
            cleared: next.length === 0,
          }),
        }).catch(() => {});
      }

      return next;
    });
  };

  const saveForLater = (id: string | number) => {
    setCart((prev) => {
      const item = prev.find((i) => String(i.id) === String(id));
      if (!item) return prev;
      setSavedForLater((later) => {
        const next = later.some((l) => String(l.id) === String(id))
          ? later.map((l) => (String(l.id) === String(id) ? { ...l, qty: l.qty + item.qty } : l))
          : [...later, item];
        try {
          localStorage.setItem('bpg_saved_later', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      showToast('Saved for later');
      const updatedCart = prev.filter((i) => String(i.id) !== String(id));
      try {
        localStorage.setItem('bpg_cart_next', JSON.stringify(updatedCart));
      } catch {}

      // Instant abandoned cart sync
      const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
      if (p) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: p,
            name: user?.name || 'Student',
            cart: updatedCart.map((c) => ({ id: c.id, title: c.title, qty: c.qty, price: c.price })),
            cleared: updatedCart.length === 0,
          }),
        }).catch(() => {});
      }

      return updatedCart;
    });
  };

  const moveToCartFromSaved = (id: string | number) => {
    const item = savedForLater.find((i) => String(i.id) === String(id));
    if (!item) return;
    setSavedForLater((later) => {
      const next = later.filter((i) => String(i.id) !== String(id));
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

    const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
    if (p) {
      fetch('/api/cart/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          phone: p,
          name: user?.name || 'Student',
          cart: [],
          cleared: true,
        }),
      }).catch(() => {});
    }
  }, [user?.phone, user?.name, user?.token]);

  /** Clear cart locally + on server immediately after a successful order. */
  const clearCartAfterOrder = useCallback(() => {
    setCart([]);
    try {
      localStorage.setItem('bpg_cart_next', '[]');
    } catch {
      /* ignore */
    }
    const p = user?.phone || (typeof window !== 'undefined' ? localStorage.getItem('bpg_checkout_phone') : null);
    if (p) {
      fetch('/api/cart/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          phone: p,
          name: user?.name || 'Student',
          cart: [],
          cleared: true,
        }),
      }).catch(() => {});
    }
    if (user?.id) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) headers.Authorization = `Bearer ${user.token}`;
      fetch('/api/user/sync', {
        method: 'POST',
        headers,
        credentials: 'include',
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
          const priceUpdated =
            typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0 && item.price !== r.price;
          const mrpUpdated =
            typeof r.mrp === 'number' && Number.isFinite(r.mrp) && r.mrp > 0 && item.mrp !== r.mrp;
          const discUpdated =
            typeof r.discount === 'number' && item.discount !== r.discount;

          const livePrice = priceUpdated ? r.price : item.price;
          const liveMrp = mrpUpdated ? r.mrp : item.mrp;
          const liveDiscount = discUpdated ? r.discount : item.discount;

          if (priceUpdated) {
            messages.push(`Price for "${item.title}" updated: ₹${item.price} → ₹${r.price}`);
          }

          if (r.allowedQty < item.qty) {
            clean = false;
            messages.push(r.message || `Only ${r.allowedQty} of "${item.title}" available — quantity updated`);
            next.push({
              ...item,
              qty: r.allowedQty,
              stock: r.availableStock,
              inStock: true,
              price: livePrice,
              mrp: liveMrp,
              discount: liveDiscount,
            });
          } else {
            next.push({
              ...item,
              stock: r.availableStock,
              inStock: r.inStock,
              price: livePrice,
              mrp: liveMrp,
              discount: liveDiscount,
            });
          }
        }
        try {
          localStorage.setItem('bpg_cart_next', JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });

      const isAdminPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      if (messages.length > 0 && !isAdminPage) {
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
    const sId = String(id);
    let isNowWishlisted = false;
    setWishlist((prev) => {
      const exists = prev.some((x) => String(x) === sId);
      let next: (string | number)[];
      if (exists) {
        next = prev.filter((x) => String(x) !== sId);
        isNowWishlisted = false;
      } else {
        next = [...prev, id];
        isNowWishlisted = true;
      }
      try {
        localStorage.setItem('bpg_wishlist_next', JSON.stringify(next));
        localStorage.setItem('bpg_wishlist_cleared', next.length === 0 ? 'true' : 'false');
      } catch {}
      if (user?.id) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user.token) headers.Authorization = `Bearer ${user.token}`;
        fetch('/api/user/sync', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            cart: cartRef.current,
            wishlist: next,
          }),
        }).catch(() => {});
      }
      return next;
    });
    showToast(isNowWishlisted ? '❤️ Added to wishlist' : '💔 Removed from wishlist');
  };

  const removeFromWishlist = (id: string | number) => {
    const sId = String(id);
    setWishlist((prev) => {
      const next = prev.filter((x) => String(x) !== sId);
      try {
        localStorage.setItem('bpg_wishlist_next', JSON.stringify(next));
        localStorage.setItem('bpg_wishlist_cleared', next.length === 0 ? 'true' : 'false');
      } catch {}
      if (user?.id) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user.token) headers.Authorization = `Bearer ${user.token}`;
        fetch('/api/user/sync', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            cart: cartRef.current,
            wishlist: next,
          }),
        }).catch(() => {});
      }
      return next;
    });
    showToast('💔 Removed from wishlist');
  };

  const clearWishlist = () => {
    setWishlist([]);
    try {
      localStorage.setItem('bpg_wishlist_next', '[]');
      localStorage.setItem('bpg_wishlist_cleared', 'true');
    } catch {}
    if (user?.id) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) headers.Authorization = `Bearer ${user.token}`;
      fetch('/api/user/sync', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          cart: cartRef.current,
          wishlist: [],
        }),
      }).catch(() => {});
    }
    showToast('Wishlist cleared');
  };

  const wishlistCount = useMemo(() => {
    if (!Array.isArray(wishlist) || wishlist.length === 0) return 0;
    const cleanIds = new Set(
      wishlist
        .map((w) => String(w ?? '').trim())
        .filter((w) => w && w !== 'null' && w !== 'undefined')
    );
    if (cleanIds.size === 0) return 0;
    if (products.length === 0) return cleanIds.size;
    const productIds = new Set(products.map((p) => String(p.id)));
    let count = 0;
    for (const id of cleanIds) {
      if (productIds.has(id)) count++;
    }
    return count;
  }, [wishlist, products]);

  // Prune any stale / deleted book IDs from wishlist once catalog loads
  useEffect(() => {
    if (!hydrated || products.length === 0 || wishlist.length === 0) return;
    const productIds = new Set(products.map((p) => String(p.id)));
    const cleaned = wishlist.filter((w) => {
      const s = String(w ?? '').trim();
      return s && s !== 'null' && s !== 'undefined' && productIds.has(s);
    });
    if (cleaned.length !== wishlist.length) {
      setWishlist(cleaned);
      try {
        localStorage.setItem('bpg_wishlist_next', JSON.stringify(cleaned));
      } catch {}
      if (user?.id) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user.token) headers.Authorization = `Bearer ${user.token}`;
        fetch('/api/user/sync', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ cart: cartRef.current, wishlist: cleaned }),
        }).catch(() => {});
      }
    }
  }, [products, hydrated, user?.id, user?.token]);

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

    // Merge guest cart with restored DB cart
    const localCart = readLocalCart();
    if (Array.isArray(restoredCart) && restoredCart.length > 0) {
      const cartMap = new Map<string, CartItem>();
      restoredCart.forEach((item) => cartMap.set(String(item.id), item));
      localCart.forEach((item) => {
        const key = String(item.id);
        if (cartMap.has(key)) {
          const existing = cartMap.get(key)!;
          cartMap.set(key, { ...existing, qty: Math.max(existing.qty, item.qty) });
        } else {
          cartMap.set(key, item);
        }
      });
      const mergedCart = Array.from(cartMap.values());
      setCart(mergedCart);
      try {
        localStorage.setItem('bpg_cart_next', JSON.stringify(mergedCart));
      } catch {}
    } else if (localCart.length > 0) {
      setCart(localCart);
    }

    // Merge guest wishlist with restored DB wishlist
    const localWish = readLocalWishlist();
    const mergedWishMap = new Map<string, string | number>();
    (Array.isArray(restoredWishlist) ? restoredWishlist : []).forEach((w) => mergedWishMap.set(String(w), w));
    (Array.isArray(localWish) ? localWish : []).forEach((w) => mergedWishMap.set(String(w), w));
    const mergedWishlist = Array.from(mergedWishMap.values());

    setWishlist(mergedWishlist);
    try {
      localStorage.setItem('bpg_wishlist_next', JSON.stringify(mergedWishlist));
    } catch {}

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
        withDerived.price = sell;
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
    if (rest.comboSubjects !== undefined) {
      withDerived.comboSubjects = rest.comboSubjects;
    }
    recentAdminEditsRef.current.set(String(id), Date.now());
    const previousProducts = products;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...withDerived } : p)));

    // Immediately mirror price/stock changes into active cart & savedForLater with zero latency
    setCart((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (String(item.id) !== String(id)) return item;
        const newPrice = withDerived.price !== undefined ? withDerived.price : item.price;
        const newMrp = withDerived.mrp !== undefined ? withDerived.mrp : item.mrp;
        const newDiscount = withDerived.discount !== undefined ? withDerived.discount : item.discount;
        const newStock = withDerived.stock !== undefined ? withDerived.stock : item.stock;
        const newInStock = withDerived.inStock !== undefined ? withDerived.inStock : item.inStock;
        if (
          item.price === newPrice &&
          item.mrp === newMrp &&
          item.discount === newDiscount &&
          item.stock === newStock &&
          item.inStock === newInStock
        ) {
          return item;
        }
        changed = true;
        return {
          ...item,
          price: newPrice,
          mrp: newMrp,
          discount: newDiscount,
          stock: newStock,
          inStock: newInStock,
        };
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

    setSavedForLater((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (String(item.id) !== String(id)) return item;
        const newPrice = withDerived.price !== undefined ? withDerived.price : item.price;
        const newMrp = withDerived.mrp !== undefined ? withDerived.mrp : item.mrp;
        const newDiscount = withDerived.discount !== undefined ? withDerived.discount : item.discount;
        if (item.price === newPrice && item.mrp === newMrp && item.discount === newDiscount) return item;
        changed = true;
        return { ...item, price: newPrice, mrp: newMrp, discount: newDiscount };
      });
      if (changed) {
        try {
          localStorage.setItem('bpg_saved_later', JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return changed ? next : prev;
    });

    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: getAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({ id, ...withDerived, hasDiscount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
      }
      try {
        sessionStorage.removeItem(CATALOG_CACHE_KEY);
      } catch {}
      // Do NOT call refreshProducts here — the server PATCH already triggers
      // notifyCatalogChanged → SSE CATALOG_CHANGED → refreshProducts.
      // Calling it here too causes a double-refresh flicker.
      showToast(
        rest.stock !== undefined
          ? `✓ Stock updated — ${Math.max(0, Math.floor(Number(rest.stock) || 0))} units`
          : rest.inStock === false
            ? '✓ Marked out of stock — hidden from shop'
            : rest.inStock === true
              ? '✓ Back in stock — visible on shop'
              : '✓ Product saved to database'
      );
      return true;
    } catch (e: any) {
      setProducts(previousProducts);
      showToast(`❌ ${e?.message || 'Failed to save product'}`);
      throw e;
    }
  };

  const addNewProductToDb = async (newProdData: Partial<Product> & { status?: string }) => {
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      showToast('❌ Admin session required — please log in as admin');
      throw new Error('Admin session required');
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
      subject: (newProdData as any).subject || 'General',
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
      samplePdfUrl: (newProdData as any).samplePdfUrl || null,
      comboSubjects: newProdData.comboSubjects || [],
    };

    setProducts((prev) => [tempProduct, ...prev]);

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: getAdminHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          title: newProdData.title,
          cls: newProdData.cls,
          category: newProdData.category || 'guide',
          price: newProdData.price,
          mrp: newProdData.mrp,
          image: newProdData.image,
          description: newProdData.description,
          badge: newProdData.badge || '',
          stock: Math.max(0, Math.floor(Number(newProdData.stock) || 0)),
          subject: (newProdData as any).subject,
          status: (newProdData as any).status,
          samplePdfUrl: (newProdData as any).samplePdfUrl,
          comboSubjects: newProdData.comboSubjects || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      if (data?.id) {
        setProducts((prev) => prev.map((p) => (p.id === tempId ? { ...p, id: data.id, slug: data.slug || data.id } : p)));
      }
      // Server POST already triggers notifyCatalogChanged → SSE → auto-refresh.
      // Only do a delayed refresh as a fallback in case SSE is disconnected.
      setTimeout(() => { if (!sseConnectedRef.current) refreshProducts(true); }, 3000);
      return data;
    } catch (err: any) {
      setProducts((prev) => prev.filter((p) => p.id !== tempId));
      const msg = err?.message || 'Unknown error';
      const formatted = msg.includes('Forbidden') || msg.includes('Unauthorized')
        ? 'Admin session expired — please refresh or log in again'
        : `Failed to add product: ${msg}`;
      showToast(`❌ ${formatted}`);
      throw new Error(formatted);
    }
  };

  const deleteProductFromDb = async (id: string | number) => {
    const previousProducts = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete failed');
      }
      // Server DELETE already triggers notifyCatalogChanged → SSE → auto-refresh.
      setTimeout(() => { if (!sseConnectedRef.current) refreshProducts(true); }, 3000);
      showToast(`🗑️ Book removed from database`);
      return true;
    } catch (err: any) {
      setProducts(previousProducts);
      showToast(`❌ ${err?.message || 'Failed to delete product'}`);
      throw err;
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const hasComboInCart = cartHasCombo(cart);
  const effectiveCartCount = effectiveBookCount(cart);
  const shippingFee = deliveryFeeForQty(effectiveCartCount, hasComboInCart);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const cartGrandTotal = cartCount > 0 ? cartTotal + shippingFee : 0;

  useEffect(() => {
    setCheckoutTotal(cartGrandTotal);
  }, [cartGrandTotal]);

  /** Debounced abandoned-cart sync (captures cart on addition, clears on empty). */
  useEffect(() => {
    if (!hydrated || !user?.phone) return;
    const isCartEmpty = cart.length === 0;
    const t = setTimeout(() => {
      if (isCartEmpty) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: user.phone,
            name: user.name,
            cart: [],
            cleared: true,
          }),
        }).catch(() => {});
        return;
      }

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
    }, isCartEmpty ? 0 : 500);
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
        wishlistCount,
        toggleWishlist,
        removeFromWishlist,
        clearWishlist,
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
        hasComboInCart,
        effectiveCartCount,
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
