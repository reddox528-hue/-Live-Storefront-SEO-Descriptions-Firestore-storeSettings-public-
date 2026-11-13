import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ShoppingBag, Package } from 'lucide-react';
import { Category, Discount, Product } from '../types/ecommerce';
import { computeProductPricing, formatNaira } from '../utils/nigerianCurrency';
import { useStore } from '../context/StoreContext';

interface ProductCardProps {
  product: Product;
  category?: Category;
  discounts: Discount[];
  ratingSummary?: { average: number; count: number };
  onQuickView?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  category,
  discounts,
  ratingSummary,
  onQuickView,
}) => {
  const { addToCart } = useStore();
  const [imgError, setImgError] = useState(false);
  const pricing = computeProductPricing(product, discounts);
  const outOfStock = product.stockQuantity <= 0;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultVariants: Record<string, string> = {};
    if (product.variants) {
      for (const v of product.variants) {
        if (v.options.length > 0) defaultVariants[v.name] = v.options[0];
      }
    }
    addToCart(product, 1, Object.keys(defaultVariants).length ? defaultVariants : undefined);
  };

  return (
    <article className="group flex flex-col bg-white border border-zinc-200/80 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <Link
        to={`/product/${product.slug}`}
        className="relative aspect-[4/3] w-full bg-zinc-100 overflow-hidden block"
      >
        {!imgError && product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-400 p-4 text-center">
            <Package className="w-8 h-8 mb-2 stroke-[1.5]" />
            <span className="text-xs font-medium text-zinc-500 line-clamp-1">{product.name}</span>
          </div>
        )}

        {onQuickView && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView(product);
            }}
            aria-label={`Quick view ${product.name}`}
            className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/95 text-zinc-800 border border-zinc-200 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-zinc-900 hover:text-white"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 mb-1">
            <span className="truncate">{category?.name || 'General'}</span>
            {pricing.discountLabel ? (
              <span className="font-mono font-semibold text-[#065F46] whitespace-nowrap shrink-0">
                {pricing.discountLabel}
              </span>
            ) : outOfStock ? (
              <span className="text-red-600 font-medium whitespace-nowrap shrink-0">Out of stock</span>
            ) : product.stockQuantity <= 5 ? (
              <span className="text-amber-700 font-medium whitespace-nowrap shrink-0">
                {product.stockQuantity} left
              </span>
            ) : null}
          </div>

          <Link
            to={`/product/${product.slug}`}
            className="font-display font-semibold text-base text-zinc-900 leading-snug line-clamp-2 hover:text-[#065F46] transition-colors"
          >
            {product.name}
          </Link>

          {ratingSummary && ratingSummary.count > 0 && (
            <p className="text-xs text-zinc-500 mt-1 tabular-nums">
              {ratingSummary.average.toFixed(1)} / 5 ({ratingSummary.count}{' '}
              {ratingSummary.count === 1 ? 'review' : 'reviews'})
            </p>
          )}
        </div>

        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[15px] text-zinc-900 tabular-nums">
              {formatNaira(pricing.finalPriceKobo)}
            </span>
            {pricing.discountAmountKobo > 0 && (
              <span className="font-mono text-xs text-zinc-400 line-through tabular-nums">
                {formatNaira(pricing.originalPriceKobo)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={outOfStock}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-[#065F46] disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{outOfStock ? 'Sold Out' : 'Add'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
