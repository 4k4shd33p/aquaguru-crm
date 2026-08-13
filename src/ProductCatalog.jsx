import { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Search, Plus, X, Trash2, Check, CreditCard as Edit3, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Box, Cpu, Wrench, Droplets } from 'lucide-react';
import { supabase } from './lib/supabase';

const CATEGORIES = [
  { id: 'RO Unit', label: 'RO Unit', icon: Droplets },
  { id: 'Filter Cartridge', label: 'Filter Cartridge', icon: Box },
  { id: 'Pump & Electrical', label: 'Pump & Electrical', icon: Cpu },
  { id: 'Fittings & Tubing', label: 'Fittings & Tubing', icon: Wrench },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export default function ProductCatalog({ showToast, products, onRefresh }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const filteredProducts = useMemo(() => {
    let result = products;
    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, search, categoryFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('Product deleted');
      onRefresh?.();
    } catch (err) {
      console.warn('handleDelete failed:', err.message);
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditValues({
      price: product.price,
      stock: product.stock,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (id) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          price: Number(editValues.price) || 0,
          stock: parseInt(editValues.stock) || 0,
        })
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
      setEditValues({});
      showToast('Product updated');
      onRefresh?.();
    } catch (err) {
      console.warn('saveEdit failed:', err.message);
    }
  };

  const adjustStock = async (id, currentStock, delta) => {
    const newStock = Math.max(0, (currentStock || 0) + delta);
    try {
      const { error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', id);
      if (error) throw error;
      showToast(`Stock ${delta > 0 ? 'increased' : 'decreased'}`);
      onRefresh?.();
    } catch (err) {
      console.warn('adjustStock failed:', err.message);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: products.length };
    CATEGORIES.forEach((c) => { counts[c.id] = 0; });
    products.forEach((p) => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });
    return counts;
  }, [products]);

  return (
    <>
      {/* Category Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          All Products
          <span className="filter-tab-count">{categoryCounts.all || 0}</span>
        </button>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              className={`filter-tab ${categoryFilter === cat.id ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat.id)}
            >
              <Icon size={14} />
              {cat.label}
              <span className="filter-tab-count">{categoryCounts[cat.id] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input
            className="search-input"
            placeholder="Search by name, SKU, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddProduct(true)}>
          <Plus />
          Add Product / Part
        </button>
      </div>

      {/* Products Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product Name</th>
                <th>SKU / Model</th>
                <th>Category</th>
                <th>Selling Price</th>
                <th>Cost Price</th>
                <th>Stock</th>
                <th>Warranty</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="table-empty">
                    <Package />
                    No products found. Click "Add Product / Part" to get started.
                  </div>
                </td></tr>
              ) : filteredProducts.map((p) => {
                const isEditing = editingId === p.id;
                const margin = Number(p.price || 0) - Number(p.cost_price || 0);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {p.name}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-dim)' }}>
                      {p.sku || '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'var(--bg-surface-3)',
                        color: 'var(--text-muted)',
                      }}>
                        {CATEGORY_LABELS[p.category] || p.category || '—'}
                      </span>
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          className="qty-input"
                          style={{ width: 80 }}
                          value={editValues.price ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, price: e.target.value })}
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>Rs {Number(p.price || 0).toLocaleString('en-IN')}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-dim)' }}>
                      Rs {Number(p.cost_price || 0).toLocaleString('en-IN')}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          className="qty-input"
                          style={{ width: 56 }}
                          value={editValues.stock ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, stock: e.target.value })}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 2 }}
                            onClick={() => adjustStock(p.id, p.stock, -1)}
                            title="Decrease stock"
                          >
                            <X size={14} />
                          </button>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            minWidth: 70,
                            textAlign: 'center',
                            background: (p.stock || 0) > 0 ? 'var(--success-50)' : 'var(--error-50)',
                            color: (p.stock || 0) > 0 ? 'var(--success-500)' : 'var(--error-500)',
                          }}>
                            {p.stock || 0} units
                          </span>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 2 }}
                            onClick={() => adjustStock(p.id, p.stock, 1)}
                            title="Increase stock"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      {p.warranty_period || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isEditing ? (
                          <>
                            <button className="btn btn-ghost" onClick={() => saveEdit(p.id)} title="Save">
                              <Check size={16} style={{ color: 'var(--success-500)' }} />
                            </button>
                            <button className="btn btn-ghost" onClick={cancelEdit} title="Cancel">
                              <X size={16} style={{ color: 'var(--text-dim)' }} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost" onClick={() => startEdit(p)} title="Edit price & stock">
                              <Edit3 size={16} />
                            </button>
                            <button className="btn btn-ghost" onClick={() => handleDelete(p.id)} title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onSubmit={async (productData) => {
            try {
              const { error } = await supabase.from('products').insert([productData]);
              if (error) throw error;
              setShowAddProduct(false);
              showToast('Product added successfully');
              onRefresh?.();
            } catch (err) {
              console.warn('Failed to add product:', err.message);
            }
          }}
        />
      )}
    </>
  );
}

function AddProductModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'RO Unit',
    price: 0,
    cost_price: 0,
    stock: 0,
    warranty_period: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Product name is required'); return; }
    setSubmitting(true);
    setError('');
    await onSubmit({
      ...form,
      price: Number(form.price) || 0,
      cost_price: Number(form.cost_price) || 0,
      stock: parseInt(form.stock) || 0,
    });
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add Product / Part</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                className="form-input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. AquaGuru RO Pro 15L"
                autoFocus
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SKU / Model Number</label>
                <input
                  className="form-input"
                  name="sku"
                  value={form.sku}
                  onChange={handleChange}
                  placeholder="e.g. AG-RO-PRO15"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Selling Price (Rs)</label>
                <input
                  type="number"
                  className="form-input"
                  name="price"
                  min="0"
                  value={form.price}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cost Price (Rs)</label>
                <input
                  type="number"
                  className="form-input"
                  name="cost_price"
                  min="0"
                  value={form.cost_price}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">In-Stock Quantity</label>
                <input
                  type="number"
                  className="form-input"
                  name="stock"
                  min="0"
                  value={form.stock}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Warranty Period</label>
                <input
                  className="form-input"
                  name="warranty_period"
                  value={form.warranty_period}
                  onChange={handleChange}
                  placeholder="e.g. 1 Year, 6 Months"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Product description, specifications, notes..."
                rows={2}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
