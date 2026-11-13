import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ArrowRight, ShoppingBag } from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useStore } from '../../context/StoreContext';
import { computeProductPricing, formatNaira } from '../../utils/nigerianCurrency';
import { matchDeliveryZone } from '../../services/storefrontService';
import { NIGERIAN_STATES } from '../../utils/nigeriaLocations';
import { CATALOG_IMAGES } from '../../assets/catalogImages';
import { resolveImageUrl } from '../../utils/imageUrl';

export function CartPage() {
  const {
    publicSettings,
    cart,
    products,
    discounts,
    deliveryZones,
    cartSubtotalKobo,
    cartDiscountTotalKobo,
    cartNetSubtotalKobo,
    updateCartQuantity,
    removeFromCart,
  } = useStore();

  const [estimateState, setEstimateState] = useState('Lagos');
  const matchedZone = matchDeliveryZone(deliveryZones, estimateState);
  const estimatedDeliveryFeeKobo = matchedZone
    ? matchedZone.freeDeliveryThresholdKobo &&
      cartNetSubtotalKobo >= matchedZone.freeDeliveryThresholdKobo
      ? 0
      : matchedZone.deliveryFeeKobo
    : 0;

  return (
    <StoreLayout>
      <SEOHead
        title={`Shopping Cart – ${publicSettings.storeName}`}
        description="Review your selected items, discounts, and estimated Nigerian delivery charges."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="font-display text-3xl font-bold text-zinc-900 mb-8">Shopping Cart</h1>

        {cart.length === 0 ? (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-12 text-center space-y-4">
            <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto" />
            <h2 className="font-display text-xl font-semibold text-zinc-900">Your cart is empty</h2>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              Explore our curated Nigerian catalogue and add items to your cart to begin checkout.
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
            >
              <span>Start Shopping</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Cart Items */}
            <div className="lg:col-span-8 bg-white border border-zinc-200/80 rounded-2xl divide-y divide-zinc-100">
              {cart.map((item, idx) => {
                const product = products.find((p) => p.productId === item.productId);
                if (!product) return null;
                const pricing = computeProductPricing(product, discounts);

                return (
                  <div
                    key={`${item.productId}_${idx}`}
                    className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <Link
                        to={`/product/${product.slug}`}
                        className="w-20 h-20 rounded-xl bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200"
                      >
                        <img
                          src={resolveImageUrl(product.images[0], CATALOG_IMAGES.heroModernCommerce)}
                          alt={product.name}
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
                      </Link>
                      <div className="min-w-0 space-y-1">
                        <Link
                          to={`/product/${product.slug}`}
                          className="font-display font-semibold text-base text-zinc-900 hover:text-[#065F46] line-clamp-2"
                        >
                          {product.name}
                        </Link>
                        {item.selectedVariants &&
                          Object.keys(item.selectedVariants).length > 0 && (
                            <p className="text-xs text-zinc-500">
                              {Object.entries(item.selectedVariants)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </p>
                          )}
                        <div className="flex items-baseline gap-2 pt-0.5">
                          <span className="font-mono text-sm font-semibold text-zinc-900 tabular-nums">
                            {formatNaira(pricing.finalPriceKobo)}
                          </span>
                          {pricing.discountAmountKobo > 0 && (
                            <span className="font-mono text-xs text-zinc-400 line-through tabular-nums">
                              {formatNaira(pricing.originalPriceKobo)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="inline-flex items-center border border-zinc-300 rounded-lg">
                        <button
                          type="button"
                          onClick={() =>
                            updateCartQuantity(
                              item.productId,
                              item.selectedVariants,
                              item.quantity - 1
                            )
                          }
                          aria-label="Decrease quantity"
                          className="p-2 text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 font-mono text-sm tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          disabled={item.quantity >= product.stockQuantity}
                          onClick={() =>
                            updateCartQuantity(
                              item.productId,
                              item.selectedVariants,
                              item.quantity + 1
                            )
                          }
                          aria-label="Increase quantity"
                          className="p-2 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right min-w-[90px]">
                        <p className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
                          {formatNaira(pricing.finalPriceKobo * item.quantity)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId, item.selectedVariants)}
                        aria-label={`Remove ${product.name}`}
                        className="p-2 text-zinc-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary & Delivery Estimator */}
            <div className="lg:col-span-4 bg-white border border-zinc-200/80 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
              <h2 className="font-display text-lg font-bold text-zinc-900">Order Summary</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatNaira(cartSubtotalKobo)}
                  </span>
                </div>
                {cartDiscountTotalKobo > 0 && (
                  <div className="flex justify-between text-[#065F46]">
                    <span>Active Discounts</span>
                    <span className="font-mono font-medium tabular-nums">
                      -{formatNaira(cartDiscountTotalKobo)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-100 space-y-2">
                  <label className="block text-xs font-medium text-zinc-600">
                    Estimate Delivery by State
                  </label>
                  <select
                    value={estimateState}
                    onChange={(e) => setEstimateState(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                  >
                    {NIGERIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-zinc-500">
                      {matchedZone
                        ? `${matchedZone.name} (${matchedZone.estimatedDeliveryDays})`
                        : 'Delivery unavailable in this state'}
                    </span>
                    <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                      {matchedZone
                        ? estimatedDeliveryFeeKobo === 0
                          ? 'Free'
                          : formatNaira(estimatedDeliveryFeeKobo)
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 flex justify-between items-baseline">
                  <span className="font-semibold text-zinc-900">Estimated Total</span>
                  <span className="font-mono text-xl font-bold text-zinc-900 tabular-nums">
                    {formatNaira(cartNetSubtotalKobo + estimatedDeliveryFeeKobo)}
                  </span>
                </div>
              </div>

              <Link
                to="/checkout"
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] transition-colors"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-zinc-500 text-center">
                Prices and stock are revalidated at checkout. Bank Transfer only.
              </p>
            </div>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
