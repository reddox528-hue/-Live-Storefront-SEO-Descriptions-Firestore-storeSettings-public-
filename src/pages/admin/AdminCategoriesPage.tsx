import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UploadCloud } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { Category, Product } from '../../types/ecommerce';
import { slugify } from '../../utils/nigerianCurrency';
import {
  deleteCategorySafely,
  fetchAllCategoriesAdmin,
  fetchAllProductsAdmin,
  generateId,
  upsertCategory,
} from '../../services/storefrontService';
import { uploadFileToStorage } from '../../services/storageService';
import { useStore } from '../../context/StoreContext';

export function AdminCategoriesPage() {
  const { showToast, refreshStoreData } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [cats, prods] = await Promise.all([
      fetchAllCategoriesAdmin(),
      fetchAllProductsAdmin(),
    ]);
    setCategories(cats);
    setProducts(prods);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setImage('');
    setDisplayOrder(String(categories.length + 1));
    setIsActive(true);
  };

  const handleEdit = (c: Category) => {
    setEditingId(c.categoryId);
    setName(c.name);
    setSlug(c.slug);
    setDescription(c.description || '');
    setImage(c.image || '');
    setDisplayOrder(String(c.displayOrder));
    setIsActive(c.isActive);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFileToStorage(file, 'storefront/categories');
      setImage(url);
      showToast('Category image uploaded.');
    } catch (err: any) {
      showToast(err?.message || 'Upload failed.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const id = editingId || generateId('cat');
      await upsertCategory(
        {
          categoryId: id,
          name: name.trim(),
          slug: slug.trim() || slugify(name),
          description: description.trim(),
          image: image.trim(),
          displayOrder: Math.max(0, Math.floor(Number(displayOrder) || 0)),
          isActive,
        },
        !editingId
      );
      await load();
      await refreshStoreData();
      resetForm();
      showToast(editingId ? 'Category updated.' : 'Category created.');
    } catch (err: any) {
      showToast(err?.message || 'Could not save category.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    try {
      await deleteCategorySafely(categoryId);
      await load();
      await refreshStoreData();
      showToast('Category deleted.');
    } catch (err: any) {
      showToast(err?.message || 'Cannot delete category.', 'error');
    }
  };

  return (
    <AdminLayout title="Categories">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-slate-900">
              {editingId ? 'Edit Category' : 'Create Category'}
            </h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-slate-500 underline cursor-pointer">
                New instead
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editingId) setSlug(slugify(e.target.value));
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Slug *</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Image URL or Upload</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <label className="px-3 py-2 border border-slate-300 rounded-lg text-xs cursor-pointer inline-flex items-center gap-1 hover:bg-slate-50">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload</span>
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Display Order</label>
              <input
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Active on Storefront</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Saving...' : editingId ? 'Save Category' : 'Create Category'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Products</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => {
                const count = products.filter((p) => p.categoryId === c.categoryId).length;
                return (
                  <tr key={c.categoryId}>
                    <td className="py-3 px-4 font-mono">{c.displayOrder}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{count}</td>
                    <td className="py-3 px-4">
                      {c.isActive ? (
                        <span className="text-[#065F46] font-medium">Active</span>
                      ) : (
                        <span className="text-slate-400">Disabled</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(c)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.categoryId)}
                          className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
