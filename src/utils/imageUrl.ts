import { CATALOG_IMAGES } from '../assets/catalogImages';
import { Category, Product, StorePublicSettings } from '../types/ecommerce';

const KNOWN_ASSET_FILENAMES: Record<string, string> = {
  hero_modern_commerce_1794563144049: CATALOG_IMAGES.heroModernCommerce,
  product_audio_electronics_1794563143753: CATALOG_IMAGES.audioElectronics,
  product_home_ceramics_1794563144150: CATALOG_IMAGES.homeCeramics,
  product_leather_tote_1794563145181: CATALOG_IMAGES.leatherTote,
  product_skincare_serum_1794563144810: CATALOG_IMAGES.skincareSerum,
};

/**
 * Normalizes stored image URLs so images render consistently in both dev and production builds:
 * - Maps legacy `/src/assets/images/<name>.jpg` dev paths to permanent `/images/<name>.jpg`
 * - Maps Vite build-hashed `/assets/<name>-<hash>.jpg` paths to permanent `/images/<name>.jpg`
 * - Converts Google Drive share URLs (`drive.google.com/file/d/<id>/view`) to direct `lh3.googleusercontent.com` links
 * - Ensures relative `images/...` paths start with `/`
 */
export function resolveImageUrl(rawUrl?: string | null, fallback = ''): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return fallback;

  // Map known catalog assets whether stored as /src/assets/images/... or Vite-hashed /assets/...
  for (const [stem, stablePath] of Object.entries(KNOWN_ASSET_FILENAMES)) {
    if (trimmed.includes(stem)) {
      return stablePath;
    }
  }

  // Handle relative paths like "images/foo.jpg" or "src/assets/images/foo.jpg"
  if (trimmed.startsWith('src/assets/images/')) {
    return `/images/${trimmed.slice('src/assets/images/'.length)}`;
  }
  if (trimmed.startsWith('/src/assets/images/')) {
    return `/images/${trimmed.slice('/src/assets/images/'.length)}`;
  }
  if (trimmed.startsWith('images/')) {
    return `/${trimmed}`;
  }

  // Convert accidental Google Drive share links into embeddable direct image URLs
  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }
  const driveOpenMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpenMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${driveOpenMatch[1]}`;
  }

  return trimmed;
}

export function normalizeStorePublicSettings(
  settings: StorePublicSettings
): StorePublicSettings {
  return {
    ...settings,
    logoUrl: resolveImageUrl(settings.logoUrl, ''),
    heroImageUrl: resolveImageUrl(settings.heroImageUrl, CATALOG_IMAGES.heroModernCommerce),
    promoBanners: Array.isArray(settings.promoBanners)
      ? settings.promoBanners.map((b) => ({
          ...b,
          image: resolveImageUrl(b.image, CATALOG_IMAGES.homeCeramics),
        }))
      : [],
  };
}

export function normalizeCategory(category: Category): Category {
  return {
    ...category,
    image: resolveImageUrl(category.image, CATALOG_IMAGES.homeCeramics),
  };
}

export function normalizeProduct(product: Product): Product {
  const normalizedImages = Array.isArray(product.images)
    ? product.images.map((img) => resolveImageUrl(img)).filter(Boolean)
    : [];
  return {
    ...product,
    images: normalizedImages.length > 0 ? normalizedImages : [CATALOG_IMAGES.heroModernCommerce],
  };
}
