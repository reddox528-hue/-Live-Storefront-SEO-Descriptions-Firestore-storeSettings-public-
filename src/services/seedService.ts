import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CATALOG_IMAGES } from '../assets/catalogImages';
import {
  DEFAULT_BANK_SETTINGS,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
} from '../config/defaultStoreContent';

/**
 * Idempotently initializes Firestore with editable store settings, Nigerian delivery zones,
 * starter categories, starter products, and active discounts ONLY when an authorized admin
 * triggers store bootstrap and the catalog is currently empty.
 */
export async function seedInitialStorefrontCatalog(): Promise<{ seeded: boolean }> {
  const existingCats = await getDocs(query(collection(db, 'categories'), limit(1)));
  if (!existingCats.empty) {
    return { seeded: false };
  }

  // 1. Store Settings
  const publicSnap = await getDoc(doc(db, 'storeSettings', 'public'));
  if (!publicSnap.exists()) {
    await setDoc(doc(db, 'storeSettings', 'public'), {
      ...DEFAULT_PUBLIC_SETTINGS,
      updatedAt: serverTimestamp(),
    });
  }
  const bankSnap = await getDoc(doc(db, 'storeSettings', 'bankDetails'));
  if (!bankSnap.exists()) {
    await setDoc(doc(db, 'storeSettings', 'bankDetails'), {
      ...DEFAULT_BANK_SETTINGS,
      updatedAt: serverTimestamp(),
    });
  }
  const privSnap = await getDoc(doc(db, 'storeSettings', 'private'));
  if (!privSnap.exists()) {
    await setDoc(doc(db, 'storeSettings', 'private'), {
      ...DEFAULT_PRIVATE_SETTINGS,
      updatedAt: serverTimestamp(),
    });
  }
  const emailPrefSnap = await getDoc(doc(db, 'storeSettings', 'emailPreferences'));
  if (!emailPrefSnap.exists()) {
    await setDoc(doc(db, 'storeSettings', 'emailPreferences'), {
      ...DEFAULT_EMAIL_PREFERENCES,
      updatedAt: serverTimestamp(),
    });
  }

  // 2. Categories
  const categories = [
    {
      categoryId: 'cat_electronics',
      name: 'Audio & Electronics',
      slug: 'audio-electronics',
      description: 'Studio wireless audio, power banks, and everyday desk hardware built for reliability.',
      image: CATALOG_IMAGES.audioElectronics,
      displayOrder: 1,
      isActive: true,
    },
    {
      categoryId: 'cat_home_living',
      name: 'Home & Living',
      slug: 'home-living',
      description: 'Hand-glazed ceramics, architectural brass lighting, and modern apartment accents.',
      image: CATALOG_IMAGES.homeCeramics,
      displayOrder: 2,
      isActive: true,
    },
    {
      categoryId: 'cat_fashion_leather',
      name: 'Leather & Carry',
      slug: 'leather-carry',
      description: 'Structured full-grain leather bags and minimalist everyday carry essentials.',
      image: CATALOG_IMAGES.leatherTote,
      displayOrder: 3,
      isActive: true,
    },
    {
      categoryId: 'cat_beauty_wellness',
      name: 'Botanical Skincare',
      slug: 'botanical-skincare',
      description: 'Clean botanical serums and nourishing daily moisturizers formulated for humid climates.',
      image: CATALOG_IMAGES.skincareSerum,
      displayOrder: 4,
      isActive: true,
    },
  ];

  for (const cat of categories) {
    await setDoc(doc(db, 'categories', cat.categoryId), {
      ...cat,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Products (Prices in integer Kobo!)
  const products = [
    {
      productId: 'prod_anc_headphones',
      name: 'Kora Studio Wireless ANC Headphones',
      slug: 'kora-studio-wireless-anc-headphones',
      shortDescription: '40-hour active noise cancelling over-ear headphones with USB-C fast charging.',
      description:
        'Engineered for clear calls and deep studio acoustics during commutes or remote work. Features plush memory-foam earcups, multipoint Bluetooth 5.3 pairing, and 40 hours of continuous battery life.',
      categoryId: 'cat_electronics',
      images: [CATALOG_IMAGES.audioElectronics, CATALOG_IMAGES.heroModernCommerce],
      sku: 'KM-AUD-101',
      priceKobo: 14500000, // ₦145,000
      stockQuantity: 18,
      variants: [{ name: 'Finish', options: ['Matte Obsidian', 'Brushed Slate'] }],
      specifications: [
        { label: 'Battery Life', value: '40 Hours (ANC On)' },
        { label: 'Connectivity', value: 'Bluetooth 5.3 & 3.5mm Aux' },
        { label: 'Warranty', value: '12 Months Store Warranty' },
      ],
      salesCount: 42,
      isFeatured: true,
      isNewArrival: true,
      isPublished: true,
    },
    {
      productId: 'prod_aluminum_dock',
      name: 'Anodized Aluminum MagSafe Desk Dock',
      slug: 'anodized-aluminum-magsafe-desk-dock',
      shortDescription: 'Weighted CNC-machined desk charging stand for smartphones and earbuds.',
      description:
        'Precision-milled solid aluminum charging pedestal with non-slip silicone base and braided USB-C cable included.',
      categoryId: 'cat_electronics',
      images: [CATALOG_IMAGES.audioElectronics],
      sku: 'KM-ELC-104',
      priceKobo: 4850000, // ₦48,500
      stockQuantity: 25,
      variants: [{ name: 'Finish', options: ['Natural Silver', 'Space Gray'] }],
      specifications: [
        { label: 'Output', value: '15W Fast Wireless' },
        { label: 'Material', value: 'CNC 6061 Aluminum' },
      ],
      salesCount: 29,
      isFeatured: false,
      isNewArrival: true,
      isPublished: true,
    },
    {
      productId: 'prod_brass_task_lamp',
      name: 'Ikoyi Brushed Brass Architectural Lamp',
      slug: 'ikoyi-brushed-brass-architectural-lamp',
      shortDescription: 'Articulated solid-brass reading and desk lamp with warm LED bulb.',
      description:
        'A sculptural desk and bedside fixture crafted with brushed brass joints and a weighted base. Delivers warm glare-free illumination.',
      categoryId: 'cat_home_living',
      images: [CATALOG_IMAGES.homeCeramics, CATALOG_IMAGES.heroModernCommerce],
      sku: 'KM-HOM-201',
      priceKobo: 9200000, // ₦92,000
      stockQuantity: 12,
      variants: [{ name: 'Finish', options: ['Brushed Brass', 'Matte Bronze'] }],
      specifications: [
        { label: 'Voltage', value: '220V–240V Nigeria Plug' },
        { label: 'Height', value: '52 cm Adjustable' },
      ],
      salesCount: 36,
      isFeatured: true,
      isNewArrival: false,
      isPublished: true,
    },
    {
      productId: 'prod_stoneware_vase',
      name: 'Artisan Matte Stoneware Ceramic Vase',
      slug: 'artisan-matte-stoneware-ceramic-vase',
      shortDescription: 'Wheel-thrown off-white stoneware vessel for dried botanicals or fresh stems.',
      description:
        'Each stoneware vessel is hand-glazed with a subtle satin travertine finish that pairs effortlessly with minimalist interiors.',
      categoryId: 'cat_home_living',
      images: [CATALOG_IMAGES.homeCeramics],
      sku: 'KM-HOM-208',
      priceKobo: 3400000, // ₦34,000
      stockQuantity: 19,
      variants: [{ name: 'Size', options: ['Medium (24cm)', 'Tall (32cm)'] }],
      specifications: [
        { label: 'Material', value: 'Kiln-Fired Stoneware' },
        { label: 'Watertight', value: 'Yes' },
      ],
      salesCount: 22,
      isFeatured: false,
      isNewArrival: true,
      isPublished: true,
    },
    {
      productId: 'prod_cognac_leather_tote',
      name: 'Victoria Full-Grain Leather Work Tote',
      slug: 'victoria-full-grain-leather-work-tote',
      shortDescription: 'Structured cognac leather tote sized for a 15-inch laptop and daily essentials.',
      description:
        'Cut from vegetable-tanned full-grain cowhide with reinforced brass buckle straps, interior zipped pocket, and protective base studs.',
      categoryId: 'cat_fashion_leather',
      images: [CATALOG_IMAGES.leatherTote],
      sku: 'KM-BAG-301',
      priceKobo: 12800000, // ₦128,000
      stockQuantity: 9,
      variants: [{ name: 'Colour', options: ['Cognac Tan', 'Espresso'] }],
      specifications: [
        { label: 'Laptop Fit', value: 'Up to 15.6 inches' },
        { label: 'Dimensions', value: '38cm x 29cm x 14cm' },
      ],
      salesCount: 51,
      isFeatured: true,
      isNewArrival: false,
      isPublished: true,
    },
    {
      productId: 'prod_botanical_serum',
      name: 'Aura Botanica Radiance Vitamin C Serum',
      slug: 'aura-botanica-radiance-vitamin-c-serum',
      shortDescription: '30ml brightening neroli and hyaluronic acid facial serum in UV-protective amber glass.',
      description:
        'Lightweight fast-absorbing botanical serum formulated with stabilized Vitamin C, neroli hydrosol, and hyaluronic acid for luminous skin without heaviness.',
      categoryId: 'cat_beauty_wellness',
      images: [CATALOG_IMAGES.skincareSerum],
      sku: 'KM-SKN-401',
      priceKobo: 2650000, // ₦26,500
      stockQuantity: 34,
      variants: [{ name: 'Volume', options: ['30ml Dropper'] }],
      specifications: [
        { label: 'Key Actives', value: 'Vitamin C, Neroli, Hyaluronic Acid' },
        { label: 'Skin Type', value: 'All Skin Types' },
      ],
      salesCount: 64,
      isFeatured: true,
      isNewArrival: true,
      isPublished: true,
    },
    {
      productId: 'prod_velvet_face_cream',
      name: 'Aura Velvet Rosehip & Shea Face Cream',
      slug: 'aura-velvet-rosehip-shea-face-cream',
      shortDescription: '50ml restorative barrier cream with West African unrefined shea butter and bakuchiol.',
      description:
        'Nourishing daily cream housed in a reusable ceramic jar with oak lid. Balances moisture barrier overnight and under sunscreen.',
      categoryId: 'cat_beauty_wellness',
      images: [CATALOG_IMAGES.skincareSerum],
      sku: 'KM-SKN-405',
      priceKobo: 3100000, // ₦31,000
      stockQuantity: 4, // Deliberately low stock so admin low-stock alerts are immediately demonstrable
      variants: [{ name: 'Volume', options: ['50ml Ceramic Jar'] }],
      specifications: [
        { label: 'Key Actives', value: 'Rosehip, Shea Butter, Bakuchiol' },
        { label: 'Packaging', value: 'Refillable Stoneware Jar' },
      ],
      salesCount: 38,
      isFeatured: false,
      isNewArrival: false,
      isPublished: true,
    },
    {
      productId: 'prod_lagos_lounge_throw',
      name: 'Lekki Handwoven Cotton Lounge Throw',
      slug: 'lekki-handwoven-cotton-lounge-throw',
      shortDescription: 'Breathable loomed cotton sofa and bed throw in warm sand and terracotta stripe.',
      description:
        'Soft, pre-washed 100% cotton throw blanket woven for tropical interiors. Lightweight enough for warm evenings while adding tactile texture.',
      categoryId: 'cat_home_living',
      images: [CATALOG_IMAGES.heroModernCommerce],
      sku: 'KM-HOM-215',
      priceKobo: 4200000, // ₦42,000
      stockQuantity: 15,
      variants: [{ name: 'Weave', options: ['Sand & Rust', 'Natural Oat'] }],
      specifications: [
        { label: 'Material', value: '100% Loomed Cotton' },
        { label: 'Dimensions', value: '150cm x 200cm' },
      ],
      salesCount: 19,
      isFeatured: false,
      isNewArrival: true,
      isPublished: true,
    },
  ];

  for (const prod of products) {
    await setDoc(doc(db, 'products', prod.productId), {
      ...prod,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 4. Discounts
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const discounts = [
    {
      discountId: 'disc_studio_launch',
      name: 'Studio Audio & Tote Seasonal Offer',
      type: 'percentage',
      value: 15,
      applicableProductIds: ['prod_anc_headphones', 'prod_cognac_leather_tote'],
      startAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      endAt: Timestamp.fromDate(nextMonth),
      isActive: true,
    },
    {
      discountId: 'disc_skincare_save',
      name: 'Skincare Bundle Price Drop',
      type: 'fixed_kobo',
      value: 450000, // ₦4,500 off
      applicableProductIds: ['prod_botanical_serum'],
      startAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      endAt: Timestamp.fromDate(nextMonth),
      isActive: true,
    },
  ];

  for (const disc of discounts) {
    await setDoc(doc(db, 'discounts', disc.discountId), {
      ...disc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 5. Nigerian Delivery Zones
  const deliveryZones = [
    {
      zoneId: 'zone_lagos_metro',
      name: 'Lagos Metro Dispatch',
      supportedStates: ['Lagos'],
      supportedLocations: [], // Empty means all LGAs/cities in Lagos
      deliveryFeeKobo: 350000, // ₦3,500
      freeDeliveryThresholdKobo: 15000000, // Free above ₦150,000
      estimatedDeliveryDays: '1–2 Business Days',
      isActive: true,
    },
    {
      zoneId: 'zone_abuja_sw',
      name: 'Abuja FCT & South-West Corridor',
      supportedStates: ['FCT Abuja', 'Ogun', 'Oyo', 'Osun', 'Ondo', 'Ekiti'],
      supportedLocations: [],
      deliveryFeeKobo: 550000, // ₦5,500
      freeDeliveryThresholdKobo: 25000000,
      estimatedDeliveryDays: '2–4 Business Days',
      isActive: true,
    },
    {
      zoneId: 'zone_nationwide_hubs',
      name: 'Rivers, Enugu, Anambra, Delta, Edo & Kano Express',
      supportedStates: ['Rivers', 'Enugu', 'Anambra', 'Delta', 'Edo', 'Kano', 'Kaduna', 'Akwa Ibom', 'Cross River'],
      supportedLocations: [],
      deliveryFeeKobo: 750000, // ₦7,500
      freeDeliveryThresholdKobo: 0,
      estimatedDeliveryDays: '3–6 Business Days',
      isActive: true,
    },
  ];

  for (const zone of deliveryZones) {
    await setDoc(doc(db, 'deliveryZones', zone.zoneId), {
      ...zone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return { seeded: true };
}
