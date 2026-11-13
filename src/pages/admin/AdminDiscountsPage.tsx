import React, { useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { Discount, DiscountType, Product } from '../../types/ecommerce';
import {
  formatLagosDateTime,
  formatNaira,
  koboToNairaNumber,
  nairaToKobo,
  toDateMillis,
} from '../../utils/nigerianCurrency';
import {
  deleteDiscount,
  fetchAllDiscountsAdmin,
  fetchAllProductsAdmin,
  generateId,
  upsertDiscount,
} from '../../services/storefrontService';
import { useStore } from '../../context/StoreContext';

export function AdminDiscountsPage() {
  const { showToast, refreshStoreData } = useStore();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<DiscountType>('percentage');
  const [valueInput, setValueInput] = useState('10');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState(() =>
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const load = async () => {
    const [discs, prods] = await Promise.all([
      fetchAllDiscountsAdmin(),
      fetchAllProductsAdmin(),
    ]);
    setDiscounts(discs);
    setProducts(prods);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (endMs <= startMs) {
      showToast('Expiration date must be after start date.', 'error');
      return;
    }

    const numeric = Number(valueInput);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      showToast('Discount value must be positive.', 'error');
      return;
    }
    if (type === 'percentage' && numeric > 95) {
      showToast('Percentage discount cannot exceed 95%.', 'error');
      return;
    }

    const valueKoboOrPct = type === 'percentage' ? Math.round(numeric) : nairaToKobo(numeric);
    if (type === 'fixed_kobo') {
      const invalidProd = products.find(
        (p) => selectedProductIds.includes(p.productId) && valueKoboOrPct >= p.priceKobo
      );
      if (invalidProd) {
        showToast(
          `Fixed discount exceeds price of "${invalidProd.name}". Reduce discount amount.`,
          'error'
        );
        return;
      }
    }

    try {
      const id = editingId || generateId('disc');
      await upsertDiscount(
        {
          discountId: id,
          name: name.trim(),
          type,
          value: valueKoboOrPct,
          applicableProductIds: selectedProductIds,
          startAt: Timestamp.fromDate(new Date(startMs)),
          endAt: Timestamp.fromDate(new Date(endMs)),
          isActive,
        },
        !editingId
      );
      await load();
      await refreshStoreData();
      setEditingId(null);
      setName('');
      setSelectedProductIds([]);
      showToast(editingId ? 'Discount updated.' : 'Discount created.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save discount.', 'error');
    }
  };

  const handleEdit = (d: Discount) => {
    setEditingId(d.discountId);
    setName(d.name);
    setType(d.type);
    setValueInput(
      d.type === 'percentage' ? String(d.value) : String(koboToNairaNumber(d.value))
    );
    setStartDate(new Date(toDateMillis(d.startAt)).toISOString().slice(0, 16));
    setEndDate(new Date(toDateMillis(d.endAt)).toISOString().slice(0, 16));
    setSelectedProductIds(d.applicableProductIds || []);
    setIsActive(d.isActive);
  };

  const toggleProduct = (pid: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  return (
    <AdminLayout title="Discounts & Promotions">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display font-semibold text-slate-900">
            {editingId ? 'Edit Discount' : 'Create Discount'}
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Campaign Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lagos Weekend 15% Off"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DiscountType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_kobo">Fixed Amount (₦)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {type === 'percentage' ? 'Percent (1–95)' : 'Amount (₦)'}
              </label>
              <input
                type="number"
                required
                min="1"
                max={type === 'percentage' ? 95 : undefined}
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start At</label>
              <input
                type="datetime-local"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Expires At</label>
              <input
                type="datetime-local"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Apply to Products ({selectedProductIds.length} selected)
            </label>
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2.5 space-y-1.5 text-xs">
              {products.map((p) => (
                <label key={p.productId} className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(p.productId)}
                      onChange={() => toggleProduct(p.productId)}
                    />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="font-mono text-slate-500 shrink-0">{formatNaira(p.priceKobo)}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#065F46] text-white text-sm font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'Save Discount' : 'Create Discount'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Window</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discounts.map((d) => (
                <tr key={d.discountId}>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {d.name}
                    <span className="block text-[11px] text-slate-400">
                      {d.applicableProductIds.length} products
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold">
                    {d.type === 'percentage' ? `${d.value}%` : formatNaira(d.value)}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {formatLagosDateTime(d.startAt, false)} – {formatLagosDateTime(d.endAt, false)}
                  </td>
                  <td className="py-3 px-4">
                    {d.isActive ? (
                      <span className="text-[#065F46] font-medium">Active</span>
                    ) : (
                      <span className="text-slate-400">Inactive</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(d)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteDiscount(d.discountId);
                          await load();
                          await refreshStoreData();
                          showToast('Discount deleted.');
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
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
      </div>
    </AdminLayout>
  );
}
