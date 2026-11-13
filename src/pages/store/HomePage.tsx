import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  Landmark,
  CheckCircle2,
  X,
  Star,
} from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { ProductCard } from '../../components/ProductCard';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { Product } from '../../types/ecommerce';
import { computeProductPricing, formatNaira } from '../../utils/nigerianCurrency';
import { subscribeNewsletter } from '../../services/storefrontService';
import { seedInitialStorefrontCatalog } from '../../services/seedService';
import { CATALOG_IMAGES } from '../../assets/catalogImages';
import { resolveImageUrl } from '../../utils/imageUrl';

export function HomePage() {
  const {
    publicSettings,
    categories,
    products,
    discounts,
    approvedReviews,
    loadingStore,
    addToCart,
    showToast,
    refreshStoreData,
  } = useStore();
  const { isAdmin } = useAuth();

  const [activeShelf, setActiveShelf] = useState<'featured' | 'bestsellers' | 'new' | 'discounted'>(
    'featured'
  );
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const ratingMap = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    for (const r of approvedReviews) {
      if (!map[r.productId]) map[r.productId] = { sum: 0, count: 0 };
      map[r.productId].sum += r.rating;
      map[r.productId].count += 1;
    }
    const result: Record<string, { average: number; count: number }> = {};
    for (const [id, val] of Object.entries(map)) {
      result[id] = { average: val.sum / val.count, count: val.count };
    }
    return result;
  }, [approvedReviews]);

  const shelfProducts = useMemo(() => {
    const nowMs = Date.now();
    if (activeShelf === 'featured') {
      const list = products.filter((p) => p.isFeatured);
      return (list.length ? list : products).slice(0, 6);
    }
    if (activeShelf === 'bestsellers') {
      return [...products].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 6);
    }
    if (activeShelf === 'new') {
      const list = products.filter((p) => p.isNewArrival);
      return (list.length ? list : products).slice(0, 6);
    }
    return products
      .filter((p) => computeProductPricing(p, discounts, nowMs).discountAmountKobo > 0)
      .slice(0, 6);
  }, [activeShelf, products, discounts]);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !newsletterEmail.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    setSubscribing(true);
    try {
      await subscribeNewsletter(newsletterEmail);
      setNewsletterEmail('');
      showToast('Subscribed to store updates and seasonal restocks.');
    } catch (err: any) {
      showToast(err?.message || 'Unable to subscribe right now.', 'error');
    } finally {
      setSubscribing(false);
    }
  };

  const handleAdminQuickSeed = async () => {
    setSeeding(true);
    try {
      await seedInitialStorefrontCatalog();
      await refreshStoreData();
      showToast('Starter catalog and Nigerian delivery zones initialized.');
    } catch (err: any) {
      showToast(err?.message || 'Could not initialize catalog.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const activePromo = publicSettings.promoBanners?.find((b) => b.isActive);

  return (
    <StoreLayout>
      <SEOHead
        title={publicSettings.seoTitle || `${publicSettings.storeName} – Curated Goods in Naira`}
        description={publicSettings.seoDescription || publicSettings.storeDescription}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: publicSettings.storeName,
          description: publicSettings.storeDescription,
          currenciesAccepted: 'NGN',
          paymentAccepted: 'Bank Transfer',
        }}
      />

      {/* Hero Split Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
          <div className="lg:col-span-6 p-8 sm:p-12 lg:p-14 flex flex-col justify-center gap-6">
            <p className="text-xs font-medium text-[#065F46] tracking-wide">
              {publicSettings.storeTagline}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-zinc-900 leading-[1.12] [text-wrap:balance]">
              {publicSettings.heroTitle}
            </h1>
            <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
              {publicSettings.heroSubtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to={publicSettings.heroCtaLink || '/shop'}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] transition-colors whitespace-nowrap"
              >
                <span>{publicSettings.heroCtaLabel || 'Shop Collection'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/shipping-policy"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-zinc-300 text-zinc-800 text-sm font-medium hover:bg-zinc-50 transition-colors whitespace-nowrap"
              >
                Delivery Zones & Fees
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6 min-h-[300px] lg:min-h-[460px] aspect-[16/10] lg:aspect-auto bg-zinc-100 relative overflow-hidden">
            <img
              src={resolveImageUrl(publicSettings.heroImageUrl, CATALOG_IMAGES.heroModernCommerce)}
              alt={publicSettings.heroTitle || publicSettings.storeName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallbackApplied) {
                  img.dataset.fallbackApplied = 'true';
                  img.src = CATALOG_IMAGES.heroModernCommerce;
                }
              }}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Store Trust & Value Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="flex items-start gap-3.5 p-5 bg-white border border-zinc-200/80 rounded-xl">
            <Landmark className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900">
                Verified Bank Transfer Checkout
              </h2>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Pay directly in Nigerian Naira (₦) with transparent order references and manual
                receipt verification.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 p-5 bg-white border border-zinc-200/80 rounded-xl">
            <Truck className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900">
                Owner-Managed Nigerian Delivery
              </h2>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Direct dispatch tracking across configured Lagos, Abuja FCT, and nationwide
                corridors.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 p-5 bg-white border border-zinc-200/80 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900">
                Guaranteed Stock & Quality
              </h2>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Live inventory counts prevent overselling, with every order inspected prior to
                dispatch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Empty Storefront Onboarding Notice for Admin */}
      {!loadingStore && products.length === 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-zinc-900">
              Store Catalogue Is Ready for Setup
            </h2>
            <p className="text-sm text-zinc-600 max-w-lg mx-auto">
              No published products exist in Firestore yet. Sign in with your administrator account
              to create categories, products, and Nigerian delivery zones—or initialize the curated
              starter catalogue.
            </p>
            {isAdmin ? (
              <button
                type="button"
                onClick={handleAdminQuickSeed}
                disabled={seeding}
                className="px-5 py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-medium hover:bg-[#047857] cursor-pointer disabled:opacity-60"
              >
                {seeding ? 'Initializing Firestore...' : 'Initialize Starter Catalogue Now'}
              </button>
            ) : (
              <Link
                to="/login?redirect=/admin"
                className="inline-block px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
              >
                Store Owner Sign In
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Featured Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-zinc-900 tracking-tight">
                Shop by Category
              </h2>
              <p className="text-sm text-zinc-600 mt-1">
                Explore curated departments updated directly from our inventory.
              </p>
            </div>
            <Link
              to="/shop"
              className="text-sm font-medium text-[#065F46] hover:underline underline-offset-4 whitespace-nowrap"
            >
              View All
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((cat) => (
              <Link
                key={cat.categoryId}
                to={`/category/${cat.slug}`}
                className="group bg-white border border-zinc-200/80 rounded-xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
              >
                <div className="aspect-[4/3] bg-zinc-100 overflow-hidden">
                  <img
                    src={resolveImageUrl(cat.image, CATALOG_IMAGES.homeCeramics)}
                    alt={cat.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallbackApplied) {
                        img.dataset.fallbackApplied = 'true';
                        img.src = CATALOG_IMAGES.homeCeramics;
                      }
                    }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-display font-semibold text-base text-zinc-900 group-hover:text-[#065F46]">
                    {cat.name}
                  </h3>
                  {cat.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{cat.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Curated Product Collection Tabs (Featured / Best Sellers / New Arrivals / Discounts) */}
      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold text-zinc-900 tracking-tight">
                Curated Collection
              </h2>
              <p className="text-sm text-zinc-600 mt-1">
                All prices in Nigerian Naira (₦) with live stock availability.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-zinc-200/60 rounded-lg self-start overflow-x-auto max-w-full">
              {publicSettings.showFeaturedSection && (
                <button
                  type="button"
                  onClick={() => setActiveShelf('featured')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    activeShelf === 'featured'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Featured
                </button>
              )}
              {publicSettings.showBestSellersSection && (
                <button
                  type="button"
                  onClick={() => setActiveShelf('bestsellers')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    activeShelf === 'bestsellers'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Best Sellers
                </button>
              )}
              {publicSettings.showNewArrivalsSection && (
                <button
                  type="button"
                  onClick={() => setActiveShelf('new')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    activeShelf === 'new'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  New Arrivals
                </button>
              )}
              {publicSettings.showDiscountedSection && (
                <button
                  type="button"
                  onClick={() => setActiveShelf('discounted')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    activeShelf === 'discounted'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  On Discount
                </button>
              )}
            </div>
          </div>

          {shelfProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {shelfProducts.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  category={categories.find((c) => c.categoryId === product.categoryId)}
                  discounts={discounts}
                  ratingSummary={ratingMap[product.productId]}
                  onQuickView={setQuickViewProduct}
                />
              ))}
            </div>
          ) : (
            <div className="p-10 bg-white border border-zinc-200 rounded-xl text-center text-sm text-zinc-500">
              No products currently match this selection.{' '}
              <Link to="/shop" className="text-[#065F46] font-medium underline">
                Browse full catalogue
              </Link>
              .
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              <span>Browse Full Catalogue ({products.length} items)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Editorial Promotional Banner */}
      {activePromo && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-zinc-900 text-white rounded-2xl overflow-hidden items-stretch">
            <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center gap-4">
              <p className="text-xs font-medium text-emerald-400 tracking-wide">
                Featured Spotlight
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                {activePromo.title}
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 max-w-lg leading-relaxed">
                {activePromo.subtitle}
              </p>
              <div className="pt-2">
                <Link
                  to={activePromo.ctaLink || '/shop'}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-emerald-50 transition-colors"
                >
                  <span>{activePromo.ctaLabel || 'Explore'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 min-h-[240px] aspect-[16/10] lg:aspect-auto bg-zinc-800 relative overflow-hidden">
              <img
                src={resolveImageUrl(activePromo.image, CATALOG_IMAGES.homeCeramics)}
                alt={activePromo.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.fallbackApplied) {
                    img.dataset.fallbackApplied = 'true';
                    img.src = CATALOG_IMAGES.homeCeramics;
                  }
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      )}

      {/* Verified Customer Reviews & Newsletter */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-900">
              Verified Customer Reviews
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              Reviews are submitted exclusively by customers with verified paid orders.
            </p>
          </div>
          {approvedReviews.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {approvedReviews.slice(0, 4).map((rev) => (
                <div key={rev.reviewId} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-2">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed">“{rev.comment}”</p>
                  <p className="text-xs font-medium text-zinc-500">
                    {rev.customerName} · Verified Buyer
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200/60 text-sm text-zinc-600 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#065F46] shrink-0" />
              <span>
                Customer reviews appear here once verified buyers submit feedback and store
                moderators approve them.
              </span>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-8 flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold text-zinc-900">
              Restock Alerts & New Drops
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Receive email updates when new products arrive or seasonal Naira discounts launch.
            </p>
          </div>
          <form onSubmit={handleNewsletterSubmit} className="space-y-3">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 text-sm border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#065F46]"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] transition-colors cursor-pointer disabled:opacity-60"
            >
              {subscribing ? 'Subscribing...' : 'Subscribe for Updates'}
            </button>
          </form>
        </div>
      </section>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden border border-zinc-200 shadow-xl grid grid-cols-1 md:grid-cols-2">
            <div className="aspect-square bg-zinc-100 overflow-hidden">
              <img
                src={resolveImageUrl(quickViewProduct.images?.[0], CATALOG_IMAGES.heroModernCommerce)}
                alt={quickViewProduct.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.fallbackApplied) {
                    img.dataset.fallbackApplied = 'true';
                    img.src = CATALOG_IMAGES.heroModernCommerce;
                  }
                }}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-bold text-zinc-900">
                    {quickViewProduct.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setQuickViewProduct(null)}
                    aria-label="Close quick view"
                    className="p-1 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="font-mono text-xs text-zinc-500 mt-1">SKU: {quickViewProduct.sku}</p>
                {(() => {
                  const p = computeProductPricing(quickViewProduct, discounts);
                  return (
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="font-mono text-lg font-bold text-zinc-900 tabular-nums">
                        {formatNaira(p.finalPriceKobo)}
                      </span>
                      {p.discountAmountKobo > 0 && (
                        <span className="font-mono text-sm text-zinc-400 line-through tabular-nums">
                          {formatNaira(p.originalPriceKobo)}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <p className="text-sm text-zinc-600 mt-3 leading-relaxed">
                  {quickViewProduct.shortDescription || quickViewProduct.description}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={quickViewProduct.stockQuantity <= 0}
                  onClick={() => {
                    addToCart(quickViewProduct, 1);
                    setQuickViewProduct(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] disabled:bg-zinc-200 disabled:text-zinc-500 cursor-pointer"
                >
                  {quickViewProduct.stockQuantity > 0 ? 'Add to Cart' : 'Out of Stock'}
                </button>
                <Link
                  to={`/product/${quickViewProduct.slug}`}
                  onClick={() => setQuickViewProduct(null)}
                  className="w-full py-2.5 rounded-xl border border-zinc-300 text-center text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  View Full Details
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </StoreLayout>
  );
}
