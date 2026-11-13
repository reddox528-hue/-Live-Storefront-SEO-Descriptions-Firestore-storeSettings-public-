import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, UploadCloud, X } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { Category, Product, ProductSpecification, ProductVariant } from '../../types/ecommerce';
import { formatNaira, koboToNairaNumber, nairaToKobo, slugify } from '../../utils/nigerianCurrency';
import {
  deleteProduct,
  fetchAllCategoriesAdmin,
  fetchAllProductsAdmin,
  fetchProductByIdAdmin,
  generateId,
  upsertProduct,
} from '../../services/storefrontService';
import { uploadFileToStorage } from '../../services/storageService';
import { useStore } from '../../context/StoreContext';
import { resolveImageUrl } from '../../utils/imageUrl';

export function AdminProductsPage() {
  const { showToast, refreshStoreData } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        fetchAllProductsAdmin(),
        fetchAllCategoriesAdmin(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (product: Product) => {
    try {
      await deleteProduct(product.productId);
      setProducts((prev) => prev.filter((p) => p.productId !== product.productId));
      await refreshStoreData();
      showToast(`Deleted "${product.name}".`);
    } catch (err: any) {
      showToast(err?.message || 'Could not delete product.', 'error');
    }
  };

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  return (
    <AdminLayout
      title="Products"
      actions={
        <Link
          to="/admin/products/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#065F46] text-white text-xs font-semibold hover:bg-[#047857]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Product</span>
        </Link>
      }
    >
      <div className="space-y-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products by name or SKU..."
          className="w-full max-w-md px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        />

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading products...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No products found. Click "Add Product" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Stock</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p) => (
                    <tr key={p.productId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          {p.images[0] && (
                            <img
                              src={resolveImageUrl(p.images[0])}
                              alt={p.name}
                              className="w-9 h-9 rounded object-cover bg-slate-100"
                            />
                          )}
                          <span className="max-w-[240px] truncate">{p.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{p.sku}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {categories.find((c) => c.categoryId === p.categoryId)?.name || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                        {formatNaira(p.priceKobo)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">{p.stockQuantity}</td>
                      <td className="py-3 px-4">
                        {p.isPublished ? (
                          <span className="text-[#065F46] font-medium">Published</span>
                        ) : (
                          <span className="text-slate-400">Draft</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/admin/products/${p.productId}/edit`}
                            className="p-1.5 text-slate-600 hover:text-slate-900"
                            title="Edit product"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Delete product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export function AdminProductFormPage() {
  const { productId } = useParams<{ productId?: string }>();
  const isEditing = Boolean(productId);
  const navigate = useNavigate();
  const { showToast, refreshStoreData } = useStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceNaira, setPriceNaira] = useState('');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [specs, setSpecs] = useState<ProductSpecification[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNewArrival, setIsNewArrival] = useState(true);
  const [isPublished, setIsPublished] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAllCategoriesAdmin().then((cats) => {
      setCategories(cats);
      if (!isEditing && cats.length > 0) setCategoryId(cats[0].categoryId);
    });
    if (productId) {
      fetchProductByIdAdmin(productId).then((prod) => {
        if (!prod) return;
        setName(prod.name);
        setSlug(prod.slug);
        setSku(prod.sku);
        setCategoryId(prod.categoryId);
        setPriceNaira(String(koboToNairaNumber(prod.priceKobo)));
        setStockQuantity(String(prod.stockQuantity));
        setShortDescription(prod.shortDescription || '');
        setDescription(prod.description || '');
        setImages(prod.images || []);
        setVariants(prod.variants || []);
        setSpecs(prod.specifications || []);
        setIsFeatured(prod.isFeatured);
        setIsNewArrival(prod.isNewArrival);
        setIsPublished(prod.isPublished);
      });
    }
  }, [productId, isEditing]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadFileToStorage(file, 'storefront/products');
        setImages((prev) => [...prev, url]);
      }
      showToast('Product image uploaded.');
    } catch (err: any) {
      showToast(err?.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      showToast('Please create and select a category first.', 'error');
      return;
    }
    const priceKobo = nairaToKobo(Number(priceNaira));
    if (priceKobo <= 0) {
      showToast('Price must be greater than ₦0.', 'error');
      return;
    }
    if (images.length === 0) {
      showToast('Add at least one product image.', 'error');
      return;
    }

    setSaving(true);
    try {
      const id = productId || generateId('prod');
      await upsertProduct(
        {
          productId: id,
          name: name.trim(),
          slug: slug.trim() || slugify(name),
          sku: sku.trim().toUpperCase(),
          categoryId,
          priceKobo,
          stockQuantity: Math.max(0, Math.floor(Number(stockQuantity) || 0)),
          shortDescription: shortDescription.trim(),
          description: description.trim(),
          images,
          variants: variants.filter((v) => v.name.trim() && v.options.length > 0),
          specifications: specs.filter((s) => s.label.trim() && s.value.trim()),
          isFeatured,
          isNewArrival,
          isPublished,
        },
        !isEditing
      );
      await refreshStoreData();
      showToast(isEditing ? 'Product updated.' : 'Product created.');
      navigate('/admin/products');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save product.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title={isEditing ? 'Edit Product' : 'New Product'}>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 max-w-4xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEditing) setSlug(slugify(e.target.value));
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">URL Slug *</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">SKU *</label>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Category *</label>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Price (₦ NGN) *</label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Stock Quantity *</label>
            <input
              type="number"
              required
              min="0"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Short Description</label>
          <input
            type="text"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        {/* Product Images */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">Product Images *</label>
          <div className="flex flex-wrap gap-3">
            {images.map((img, i) => (
              <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200">
                <img src={resolveImageUrl(img)} alt="Product" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-xs text-slate-500 cursor-pointer hover:border-[#065F46]">
              <UploadCloud className="w-5 h-5 mb-1" />
              <span>{uploading ? '...' : 'Upload'}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder="Or paste image URL (/images/... or https://...)"
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={() => {
                if (newImageUrl.trim()) {
                  setImages((prev) => [...prev, resolveImageUrl(newImageUrl.trim())]);
                  setNewImageUrl('');
                }
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium cursor-pointer"
            >
              Add URL
            </button>
          </div>
        </div>

        {/* Variants */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">Variants (Size, Colour, etc.)</label>
            <button
              type="button"
              onClick={() => setVariants((v) => [...v, { name: '', options: [] }])}
              className="text-xs font-medium text-[#065F46] cursor-pointer"
            >
              + Add Variant Group
            </button>
          </div>
          {variants.map((v, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <input
                type="text"
                placeholder="Name (e.g. Colour)"
                value={v.name}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setVariants(next);
                }}
                className="sm:col-span-4 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Comma-separated options (Black, Sand)"
                value={v.options.join(', ')}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = {
                    ...next[idx],
                    options: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  };
                  setVariants(next);
                }}
                className="sm:col-span-7 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                className="sm:col-span-1 text-red-600 text-xs cursor-pointer"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Visibility Flags */}
        <div className="flex flex-wrap gap-6 pt-2 border-t border-slate-100 text-xs font-medium text-slate-700">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            <span>Published on Storefront</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            <span>Featured Product</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isNewArrival}
              onChange={(e) => setIsNewArrival(e.target.checked)}
            />
            <span>New Arrival</span>
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-semibold hover:bg-[#047857] cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Product'}
          </button>
          <Link
            to="/admin/products"
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AdminLayout>
  );
}
