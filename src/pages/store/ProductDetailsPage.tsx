import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ShoppingBag, Zap, Star, CheckCircle2, Minus, Plus } from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { ProductCard } from '../../components/ProductCard';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { Order, Product, ProductReview } from '../../types/ecommerce';
import { computeProductPricing, formatLagosDateTime, formatNaira } from '../../utils/nigerianCurrency';
import {
  fetchApprovedProductReviews,
  fetchCustomerOrders,
  fetchProductBySlug,
  submitProductReview,
} from '../../services/storefrontService';

export function ProductDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { publicSettings, products, categories, discounts, addToCart, showToast } = useStore();
  const { firebaseUser } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [eligiblePaidOrder, setEligiblePaidOrder] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setActiveImgIdx(0);
    setQuantity(1);

    const fromStore = products.find((p) => p.slug === slug) || null;
    if (fromStore) {
      setProduct(fromStore);
      setLoading(false);
    }

    if (slug) {
      fetchProductBySlug(slug)
        .then((fetched) => {
          if (!active) return;
          if (fetched) setProduct(fetched);
          setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [slug, products]);

  useEffect(() => {
    if (!product) return;
    const defaults: Record<string, string> = {};
    for (const v of product.variants || []) {
      if (v.options.length > 0) defaults[v.name] = v.options[0];
    }
    setSelectedVariants(defaults);

    fetchApprovedProductReviews(product.productId)
      .then(setReviews)
      .catch(() => {});
  }, [product?.productId]);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !product) {
      setEligiblePaidOrder(null);
      return;
    }
    fetchCustomerOrders(firebaseUser.uid)
      .then((orders) => {
        const paid = orders.find(
          (o) =>
            o.paymentStatus === 'paid' &&
            o.items.some((item) => item.productId === product.productId)
        );
        setEligiblePaidOrder(paid || null);
      })
      .catch(() => setEligiblePaidOrder(null));
  }, [firebaseUser, product?.productId]);

  const category = useMemo(
    () => (product ? categories.find((c) => c.categoryId === product.categoryId) : undefined),
    [product, categories]
  );

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.productId !== product.productId && p.categoryId === product.categoryId)
      .slice(0, 3);
  }, [product, products]);

  if (loading) {
    return (
      <StoreLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-sm text-zinc-500">
          Loading product details...
        </div>
      </StoreLayout>
    );
  }

  if (!product) {
    return (
      <StoreLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Product Not Found</h1>
          <p className="text-sm text-zinc-600">
            This product may have been unpublished or removed from our catalogue.
          </p>
          <Link
            to="/shop"
            className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium"
          >
            Back to Shop
          </Link>
        </div>
      </StoreLayout>
    );
  }

  const pricing = computeProductPricing(product, discounts);
  const outOfStock = product.stockQuantity <= 0;

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !eligiblePaidOrder) return;
    if (reviewComment.trim().length < 5) {
      showToast('Please write at least 5 characters for your review.', 'error');
      return;
    }
    setSubmittingReview(true);
    try {
      await submitProductReview({
        productId: product.productId,
        orderId: eligiblePaidOrder.orderId,
        customerId: firebaseUser.uid,
        customerName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Customer',
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewComment('');
      showToast('Review submitted for moderation. Thank you!');
    } catch (err: any) {
      showToast(err?.message || 'Unable to submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`${product.name} – ${publicSettings.storeName}`}
        description={product.shortDescription || product.description || product.name}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          sku: product.sku,
          image: product.images,
          description: product.shortDescription || product.description,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'NGN',
            price: (pricing.finalPriceKobo / 100).toFixed(2),
            availability: outOfStock
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock',
          },
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-16">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 flex items-center gap-2">
          <Link to="/" className="hover:text-zinc-900">
            Home
          </Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-zinc-900">
            Shop
          </Link>
          {category && (
            <>
              <span>/</span>
              <Link to={`/category/${category.slug}`} className="hover:text-zinc-900">
                {category.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-zinc-900 font-medium truncate">{product.name}</span>
        </nav>

        {/* Contiguous Gallery + Purchase Module */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Image Gallery */}
          <div className="lg:col-span-7 space-y-4">
            <div className="aspect-[4/3] bg-zinc-100 rounded-2xl overflow-hidden border border-zinc-200/80">
              <img
                src={product.images[activeImgIdx] || product.images[0]}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            {product.images.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImgIdx(idx)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                      activeImgIdx === idx ? 'border-[#065F46]' : 'border-zinc-200'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} view ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Purchase Module */}
          <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 space-y-6 lg:sticky lg:top-24">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>{category?.name || 'General'}</span>
                <span className="font-mono">SKU: {product.sku}</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-900 leading-tight">
                {product.name}
              </h1>
              <div className="flex items-baseline gap-3 pt-2">
                <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                  {formatNaira(pricing.finalPriceKobo)}
                </span>
                {pricing.discountAmountKobo > 0 && (
                  <>
                    <span className="font-mono text-base text-zinc-400 line-through tabular-nums">
                      {formatNaira(pricing.originalPriceKobo)}
                    </span>
                    <span className="text-xs font-mono font-semibold text-[#065F46]">
                      {pricing.discountLabel}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs pt-1">
                {outOfStock ? (
                  <span className="text-red-600 font-semibold">Out of stock</span>
                ) : product.stockQuantity <= 5 ? (
                  <span className="text-amber-700 font-semibold">
                    Low stock — only {product.stockQuantity} units remaining
                  </span>
                ) : (
                  <span className="text-[#065F46] font-medium">
                    In stock ({product.stockQuantity} units available)
                  </span>
                )}
              </p>
            </div>

            {product.shortDescription && (
              <p className="text-sm text-zinc-600 leading-relaxed">{product.shortDescription}</p>
            )}

            {/* Variants */}
            {(product.variants || []).map((variant) => (
              <div key={variant.name} className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-700">
                  {variant.name}:{' '}
                  <span className="font-normal text-zinc-500">{selectedVariants[variant.name]}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {variant.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setSelectedVariants((prev) => ({ ...prev, [variant.name]: opt }))
                      }
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                        selectedVariants[variant.name] === opt
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Quantity & CTAs */}
            <div className="space-y-4 pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">Quantity</span>
                <div className="inline-flex items-center border border-zinc-300 rounded-lg">
                  <button
                    type="button"
                    disabled={outOfStock || quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    className="p-2.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-4 font-mono text-sm tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    disabled={outOfStock || quantity >= product.stockQuantity}
                    onClick={() => setQuantity((q) => Math.min(product.stockQuantity, q + 1))}
                    aria-label="Increase quantity"
                    className="p-2.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addToCart(product, quantity, selectedVariants)}
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
                </button>
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    addToCart(product, quantity, selectedVariants);
                    navigate('/checkout');
                  }}
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-zinc-900 text-zinc-900 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>Buy Now</span>
                </button>
              </div>
              <p className="text-xs text-zinc-500 text-center">
                Payment via Nigerian Bank Transfer · Direct Owner Delivery
              </p>
            </div>
          </div>
        </div>

        {/* Full Description & Specifications */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 space-y-4">
            <h2 className="font-display text-xl font-bold text-zinc-900">Product Overview</h2>
            <p className="text-sm sm:text-base text-zinc-700 leading-relaxed whitespace-pre-line">
              {product.description || product.shortDescription}
            </p>
          </div>

          <div className="lg:col-span-5 bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 space-y-4">
            <h2 className="font-display text-xl font-bold text-zinc-900">Specifications</h2>
            {product.specifications && product.specifications.length > 0 ? (
              <dl className="divide-y divide-zinc-100 text-sm">
                {product.specifications.map((spec, idx) => (
                  <div key={idx} className="py-3 flex justify-between gap-4">
                    <dt className="text-zinc-500">{spec.label}</dt>
                    <dd className="font-medium text-zinc-900 text-right">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-zinc-500">Standard retail specification.</p>
            )}
          </div>
        </div>

        {/* Verified Reviews Section */}
        <section className="bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-900">Customer Reviews</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Only customers with verified paid orders for this product can leave a review.
              </p>
            </div>
            <span className="text-sm font-mono text-zinc-700">
              {reviews.length} approved {reviews.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          {eligiblePaidOrder && (
            <form
              onSubmit={handleReviewSubmit}
              className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#065F46]">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified Purchaser (Order {eligiblePaidOrder.orderNumber})</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-zinc-700">Rating:</label>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white"
                >
                  <option value={5}>5 Stars — Excellent</option>
                  <option value={4}>4 Stars — Very Good</option>
                  <option value={3}>3 Stars — Satisfactory</option>
                  <option value={2}>2 Stars — Fair</option>
                  <option value={1}>1 Star — Poor</option>
                </select>
              </div>
              <textarea
                rows={3}
                required
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience with this product..."
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-xl bg-white"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
              >
                {submittingReview ? 'Submitting...' : 'Submit Review for Moderation'}
              </button>
            </form>
          )}

          {reviews.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {reviews.map((rev) => (
                <div key={rev.reviewId} className="py-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-zinc-400">
                      {formatLagosDateTime(rev.createdAt, false)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-800">{rev.comment}</p>
                  <p className="text-xs text-zinc-500 font-medium">{rev.customerName}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No approved reviews for this item yet.</p>
          )}
        </section>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="space-y-6">
            <h2 className="font-display text-2xl font-bold text-zinc-900">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedProducts.map((rel) => (
                <ProductCard
                  key={rel.productId}
                  product={rel}
                  category={categories.find((c) => c.categoryId === rel.categoryId)}
                  discounts={discounts}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </StoreLayout>
  );
}
