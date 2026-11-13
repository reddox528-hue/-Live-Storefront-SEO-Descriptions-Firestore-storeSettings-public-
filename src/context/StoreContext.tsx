import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';
import {
  AppNotification,
  CartItem,
  Category,
  DeliveryZone,
  Discount,
  Product,
  ProductReview,
  StorePublicSettings,
} from '../types/ecommerce';
import { DEFAULT_PUBLIC_SETTINGS } from '../config/defaultStoreContent';
import {
  fetchActiveCategories,
  fetchActiveDeliveryZones,
  fetchActiveDiscounts,
  fetchAllApprovedReviews,
  fetchCustomerCart,
  fetchPublicStoreSettings,
  fetchPublishedProducts,
  markNotificationRead,
  saveCustomerCart,
} from '../services/storefrontService';
import { computeProductPricing } from '../utils/nigerianCurrency';
import {
  normalizeCategory,
  normalizeProduct,
  normalizeStorePublicSettings,
} from '../utils/imageUrl';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface StoreContextValue {
  publicSettings: StorePublicSettings;
  categories: Category[];
  products: Product[];
  discounts: Discount[];
  deliveryZones: DeliveryZone[];
  approvedReviews: ProductReview[];
  loadingStore: boolean;
  cart: CartItem[];
  cartCount: number;
  cartSubtotalKobo: number;
  cartDiscountTotalKobo: number;
  cartNetSubtotalKobo: number;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  toasts: ToastMessage[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  addToCart: (product: Product, quantity?: number, selectedVariants?: Record<string, string>) => void;
  updateCartQuantity: (productId: string, selectedVariants: Record<string, string> | undefined, quantity: number) => void;
  removeFromCart: (productId: string, selectedVariants?: Record<string, string>) => void;
  clearCart: () => void;
  refreshStoreData: () => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
}

const GUEST_CART_KEY = 'koramarket_guest_cart_v1';

function variantKey(variants?: Record<string, string>): string {
  if (!variants) return '';
  return Object.keys(variants)
    .sort()
    .map((k) => `${k}:${variants[k]}`)
    .join('|');
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isAdmin, authReady } = useAuth();
  const [publicSettings, setPublicSettings] = useState<StorePublicSettings>({
    ...DEFAULT_PUBLIC_SETTINGS,
    updatedAt: null,
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<ProductReview[]>([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshStoreData = useCallback(async () => {
    setLoadingStore(true);
    try {
      const [settings, cats, prods, discs, zones, revs] = await Promise.all([
        fetchPublicStoreSettings(),
        fetchActiveCategories(),
        fetchPublishedProducts(),
        fetchActiveDiscounts(),
        fetchActiveDeliveryZones(),
        fetchAllApprovedReviews(),
      ]);
      setPublicSettings(settings);
      setCategories(cats);
      setProducts(prods);
      setDiscounts(discs);
      setDeliveryZones(zones);
      setApprovedReviews(revs);
    } catch (err) {
      console.error('Failed to load storefront data:', err);
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    refreshStoreData();

    // Real-time listeners on public storefront data so admin updates propagate immediately
    const unsubSettings = onSnapshot(
      doc(db, 'storeSettings', 'public'),
      (snap) => {
        if (snap.exists()) {
          setPublicSettings(normalizeStorePublicSettings(snap.data() as StorePublicSettings));
        }
      },
      () => {}
    );

    const unsubCats = onSnapshot(
      query(collection(db, 'categories'), where('isActive', '==', true)),
      (snap) => {
        setCategories(
          snap.docs
            .map((d) => normalizeCategory(d.data() as Category))
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        );
      },
      () => {}
    );

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('isPublished', '==', true)),
      (snap) => {
        setProducts(snap.docs.map((d) => normalizeProduct(d.data() as Product)));
      },
      () => {}
    );

    const unsubDiscs = onSnapshot(
      query(collection(db, 'discounts'), where('isActive', '==', true)),
      (snap) => {
        setDiscounts(snap.docs.map((d) => d.data() as Discount));
      },
      () => {}
    );

    const unsubZones = onSnapshot(
      query(collection(db, 'deliveryZones'), where('isActive', '==', true)),
      (snap) => {
        setDeliveryZones(snap.docs.map((d) => d.data() as DeliveryZone));
      },
      () => {}
    );

    return () => {
      unsubSettings();
      unsubCats();
      unsubProds();
      unsubDiscs();
      unsubZones();
    };
  }, [refreshStoreData]);

  // Sync cart when authenticated & verified
  useEffect(() => {
    if (!authReady) return;
    if (firebaseUser && firebaseUser.emailVerified) {
      fetchCustomerCart(firebaseUser.uid)
        .then((remoteItems) => {
          setCart((localItems) => {
            if (remoteItems.length === 0 && localItems.length > 0) {
              saveCustomerCart(firebaseUser.uid, localItems).catch(() => {});
              return localItems;
            }
            if (remoteItems.length > 0 && localItems.length === 0) {
              return remoteItems;
            }
            // Merge guest cart into remote cart
            const merged = [...remoteItems];
            for (const local of localItems) {
              const idx = merged.findIndex(
                (m) =>
                  m.productId === local.productId &&
                  variantKey(m.selectedVariants) === variantKey(local.selectedVariants)
              );
              if (idx >= 0) {
                merged[idx] = { ...merged[idx], quantity: Math.max(merged[idx].quantity, local.quantity) };
              } else {
                merged.push(local);
              }
            }
            if (localItems.length > 0) {
              saveCustomerCart(firebaseUser.uid, merged).catch(() => {});
              localStorage.removeItem(GUEST_CART_KEY);
            }
            return merged;
          });
        })
        .catch(() => {});
    }
  }, [authReady, firebaseUser]);

  // Persist cart changes
  const persistCart = useCallback(
    (nextCart: CartItem[]) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        saveCustomerCart(firebaseUser.uid, nextCart).catch(() => {});
      } else {
        try {
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(nextCart));
        } catch {
          // ignore storage quota errors
        }
      }
    },
    [firebaseUser]
  );

  // Real-time in-app notifications listener (Customer + Admin)
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      setNotifications([]);
      return;
    }

    const qCust = query(collection(db, 'notifications'), where('recipientId', '==', firebaseUser.uid));
    let custItems: AppNotification[] = [];
    let adminItems: AppNotification[] = [];

    const mergeAndSet = () => {
      const combined = [...custItems, ...adminItems].sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setNotifications(combined);
    };

    const unsubCust = onSnapshot(
      qCust,
      (snap) => {
        custItems = snap.docs.map((d) => d.data() as AppNotification);
        mergeAndSet();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    let unsubAdmin = () => {};
    if (isAdmin) {
      const qAdmin = query(collection(db, 'notifications'), where('recipientId', '==', 'admin'));
      unsubAdmin = onSnapshot(
        qAdmin,
        (snap) => {
          adminItems = snap.docs.map((d) => d.data() as AppNotification);
          mergeAndSet();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      );
    }

    return () => {
      unsubCust();
      unsubAdmin();
    };
  }, [authReady, firebaseUser, isAdmin]);

  const addToCart = useCallback(
    (product: Product, quantity = 1, selectedVariants?: Record<string, string>) => {
      if (product.stockQuantity <= 0) {
        showToast(`${product.name} is currently out of stock.`, 'error');
        return;
      }

      setCart((prev) => {
        const key = variantKey(selectedVariants);
        const existingIdx = prev.findIndex(
          (i) => i.productId === product.productId && variantKey(i.selectedVariants) === key
        );
        const next = [...prev];
        if (existingIdx >= 0) {
          const desired = next[existingIdx].quantity + quantity;
          const capped = Math.min(desired, product.stockQuantity);
          if (desired > product.stockQuantity) {
            showToast(`Only ${product.stockQuantity} units of ${product.name} available.`, 'info');
          } else {
            showToast(`Updated ${product.name} quantity in cart.`);
          }
          next[existingIdx] = { ...next[existingIdx], quantity: capped };
        } else {
          const capped = Math.min(quantity, product.stockQuantity);
          next.push({ productId: product.productId, quantity: capped, selectedVariants });
          showToast(`Added ${product.name} to cart.`);
        }
        persistCart(next);
        return next;
      });
    },
    [persistCart, showToast]
  );

  const updateCartQuantity = useCallback(
    (productId: string, selectedVariants: Record<string, string> | undefined, quantity: number) => {
      const product = products.find((p) => p.productId === productId);
      const maxStock = product ? product.stockQuantity : 99;
      const key = variantKey(selectedVariants);

      setCart((prev) => {
        if (quantity <= 0) {
          const filtered = prev.filter(
            (i) => !(i.productId === productId && variantKey(i.selectedVariants) === key)
          );
          persistCart(filtered);
          return filtered;
        }
        const capped = Math.min(quantity, maxStock);
        if (quantity > maxStock && product) {
          showToast(`Only ${maxStock} units of ${product.name} available.`, 'info');
        }
        const next = prev.map((i) =>
          i.productId === productId && variantKey(i.selectedVariants) === key
            ? { ...i, quantity: capped }
            : i
        );
        persistCart(next);
        return next;
      });
    },
    [persistCart, products, showToast]
  );

  const removeFromCart = useCallback(
    (productId: string, selectedVariants?: Record<string, string>) => {
      const key = variantKey(selectedVariants);
      setCart((prev) => {
        const next = prev.filter(
          (i) => !(i.productId === productId && variantKey(i.selectedVariants) === key)
        );
        persistCart(next);
        return next;
      });
    },
    [persistCart]
  );

  const clearCart = useCallback(() => {
    setCart([]);
    persistCart([]);
    localStorage.removeItem(GUEST_CART_KEY);
  }, [persistCart]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
  }, []);

  // Compute cart totals in Kobo
  const nowMs = Date.now();
  let cartCount = 0;
  let cartSubtotalKobo = 0;
  let cartDiscountTotalKobo = 0;

  for (const item of cart) {
    cartCount += item.quantity;
    const prod = products.find((p) => p.productId === item.productId);
    if (!prod) continue;
    const pricing = computeProductPricing(prod, discounts, nowMs);
    cartSubtotalKobo += pricing.originalPriceKobo * item.quantity;
    cartDiscountTotalKobo += pricing.discountAmountKobo * item.quantity;
  }
  const cartNetSubtotalKobo = Math.max(0, cartSubtotalKobo - cartDiscountTotalKobo);
  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  return (
    <StoreContext.Provider
      value={{
        publicSettings,
        categories,
        products,
        discounts,
        deliveryZones,
        approvedReviews,
        loadingStore,
        cart,
        cartCount,
        cartSubtotalKobo,
        cartDiscountTotalKobo,
        cartNetSubtotalKobo,
        notifications,
        unreadNotificationsCount,
        toasts,
        showToast,
        dismissToast,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        refreshStoreData,
        markNotificationAsRead,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
