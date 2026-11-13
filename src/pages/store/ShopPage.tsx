import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { ProductCard } from '../../components/ProductCard';
import { useStore } from '../../context/StoreContext';
import { computeProductPricing, nairaToKobo } from '../../utils/nigerianCurrency';

const PAGE_SIZE = 12;

export function ShopPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { publicSettings, categories, products, discounts, approvedReviews, loadingStore } =
    useStore();

  const activeCategory = useMemo(
    () => (slug ? categories.find((c) => c.slug === slug) || null : null),
    [slug, categories]
  );

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [minPriceNaira, setMinPriceNaira] = useState('');
  const [maxPriceNaira, setMaxPriceNaira] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular'>('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSearchTerm(searchParams.get('search') || '');
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
    if (activeCategory) {
      setSelectedCategoryId(activeCategory.categoryId);
    } else if (!slug) {
      setSelectedCategoryId('all');
    }
  }, [activeCategory, slug]);

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

  const filteredProducts = useMemo(() => {
    const nowMs = Date.now();
    const minKobo = minPriceNaira ? nairaToKobo(Number(minPriceNaira)) : 0;
    const maxKobo = maxPriceNaira ? nairaToKobo(Number(maxPriceNaira)) : Number.MAX_SAFE_INTEGER;
    const queryLower = searchTerm.trim().toLowerCase();

    const list = products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (inStockOnly && p.stockQuantity <= 0) return false;

      const pricing = computeProductPricing(p, discounts, nowMs);
      if (discountedOnly && pricing.discountAmountKobo <= 0) return false;
      if (pricing.finalPriceKobo < minKobo || pricing.finalPriceKobo > maxKobo) return false;

      if (queryLower) {
        const hay = `${p.name} ${p.sku} ${p.shortDescription || ''}`.toLowerCase();
        if (!hay.includes(queryLower)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'price_asc') {
        return (
          computeProductPricing(a, discounts, nowMs).finalPriceKobo -
          computeProductPricing(b, discounts, nowMs).finalPriceKobo
        );
      }
      if (sortBy === 'price_desc') {
        return (
          computeProductPricing(b, discounts, nowMs).finalPriceKobo -
          computeProductPricing(a, discounts, nowMs).finalPriceKobo
        );
      }
      if (sortBy === 'popular') {
        return (b.salesCount || 0) - (a.salesCount || 0);
      }
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    return list;
  }, [
    products,
    discounts,
    selectedCategoryId,
    inStockOnly,
    discountedOnly,
    minPriceNaira,
    maxPriceNaira,
    searchTerm,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageTitle = activeCategory
    ? `${activeCategory.name} – ${publicSettings.storeName}`
    : `Shop All Products – ${publicSettings.storeName}`;

  const pageDesc = activeCategory?.description || publicSettings.seoDescription;

  return (
    <StoreLayout>
      <SEOHead title={pageTitle} description={pageDesc} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Category Banner or Shop Header */}
        {activeCategory ? (
          <div className="grid grid-cols-1 md:grid-cols-12 bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
            <div className="md:col-span-7 p-8 flex flex-col justify-center gap-2">
              <p className="text-xs font-medium text-[#065F46]">Category Collection</p>
              <h1 className="font-display text-3xl font-bold text-zinc-900">
                {activeCategory.name}
              </h1>
              {activeCategory.description && (
                <p className="text-sm text-zinc-600 max-w-xl leading-relaxed">
                  {activeCategory.description}
                </p>
              )}
            </div>
            <div className="md:col-span-5 h-48 md:h-auto bg-zinc-100">
              {activeCategory.image && (
                <img
                  src={activeCategory.image}
                  alt={activeCategory.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-zinc-900">Shop Catalogue</h1>
              <p className="text-sm text-zinc-600 mt-1">
                Browse all available items priced in Nigerian Naira (₦).
              </p>
            </div>
            <p className="text-xs font-mono text-zinc-500 tabular-nums">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            </p>
          </div>
        )}

        {/* Filter & Sort Controls */}
        <div className="bg-white border border-zinc-200/80 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by product name or SKU..."
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#065F46]"
              />
            </div>

            {!slug && (
              <select
                aria-label="Filter by category"
                value={selectedCategoryId}
                onChange={(e) => {
                  setSelectedCategoryId(e.target.value);
                  setPage(1);
                }}
                className="px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg bg-white"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={minPriceNaira}
                onChange={(e) => {
                  setMinPriceNaira(e.target.value);
                  setPage(1);
                }}
                placeholder="Min ₦"
                className="w-full px-3 py-2.5 text-sm border border-zinc-300 rounded-lg font-mono"
              />
              <input
                type="number"
                min="0"
                value={maxPriceNaira}
                onChange={(e) => {
                  setMaxPriceNaira(e.target.value);
                  setPage(1);
                }}
                placeholder="Max ₦"
                className="w-full px-3 py-2.5 text-sm border border-zinc-300 rounded-lg font-mono"
              />
            </div>

            <select
              aria-label="Sort products"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg bg-white"
            >
              <option value="newest">Sort: Newest</option>
              <option value="popular">Sort: Popularity</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-100 text-xs">
            <div className="flex flex-wrap items-center gap-5">
              <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-700 font-medium">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => {
                    setInStockOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-zinc-300 text-[#065F46] focus:ring-[#065F46]"
                />
                In Stock Only
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-700 font-medium">
                <input
                  type="checkbox"
                  checked={discountedOnly}
                  onChange={(e) => {
                    setDiscountedOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-zinc-300 text-[#065F46] focus:ring-[#065F46]"
                />
                On Discount Only
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSearchParams({});
                if (!slug) setSelectedCategoryId('all');
                setMinPriceNaira('');
                setMaxPriceNaira('');
                setInStockOnly(false);
                setDiscountedOnly(false);
                setSortBy('newest');
                setPage(1);
              }}
              className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>

        {/* Product Grid */}
        {loadingStore ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 bg-zinc-200/70 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : paginatedProducts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedProducts.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  category={categories.find((c) => c.categoryId === product.categoryId)}
                  discounts={discounts}
                  ratingSummary={ratingMap[product.productId]}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-4 py-2 text-sm border border-zinc-300 rounded-lg bg-white disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-sm font-mono px-3 tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-4 py-2 text-sm border border-zinc-300 rounded-lg bg-white disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center space-y-2">
            <h2 className="font-display text-lg font-semibold text-zinc-900">
              No matching products found
            </h2>
            <p className="text-sm text-zinc-500">
              Try adjusting your search query, price bounds, or availability filters.
            </p>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
