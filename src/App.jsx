import { useState, useEffect, useCallback } from 'react';
import { Droplets, Users, Wrench, Package, CreditCard, Search, Plus, X, Menu, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Mail, Phone, MapPin, Trash2, TrendingUp, DollarSign, Clock, ShoppingCart } from 'lucide-react';
import { supabase } from './lib/supabase';
import './App.css';

const TABS = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'tickets', label: 'Service Tickets', icon: Wrench },
  { id: 'products', label: 'Product Catalog', icon: Package },
  { id: 'sales', label: 'Sales & EMI', icon: CreditCard },
];

const TAB_META = {
  customers: { title: 'Customers', subtitle: 'Manage your customer relationships' },
  tickets: { title: 'Service Tickets', subtitle: 'Track and resolve service requests' },
  products: { title: 'Product Catalog', subtitle: 'Manage your product inventory' },
  sales: { title: 'Sales & EMI', subtitle: 'Track sales and EMI payments' },
};

const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
};

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

const SALE_STATUS_LABELS = {
  completed: 'Completed', emi_active: 'EMI Active', emi_completed: 'EMI Completed',
};

export default function App() {
  const [activeTab, setActiveTab] = useState('customers');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t, p, s] = await Promise.all([
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('service_tickets').select('*, customer:customers(name), product:products(name)').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('sales').select('*, customer:customers(name), product:products(name)').order('created_at', { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (t.error) throw t.error;
      if (p.error) throw p.error;
      if (s.error) throw s.error;
      setCustomers(c.data || []);
      setTickets(t.data || []);
      setProducts(p.data || []);
      setSales(s.data || []);
    } catch (err) {
      showToast('Failed to load data: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddCustomer = async (formData) => {
    try {
      const { error } = await supabase.from('customers').insert([formData]);
      if (error) throw error;
      setShowAddCustomer(false);
      showToast('Customer added successfully');
      fetchData();
    } catch (err) {
      showToast('Failed to add customer: ' + err.message, true);
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!window.confirm('Delete this customer? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      showToast('Customer deleted');
      fetchData();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, true);
    }
  };

  const handleDeleteTicket = async (id) => {
    if (!window.confirm('Delete this service ticket?')) return;
    try {
      const { error } = await supabase.from('service_tickets').delete().eq('id', id);
      if (error) throw error;
      showToast('Ticket deleted');
      fetchData();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, true);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('Product deleted');
      fetchData();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, true);
    }
  };

  const handleDeleteSale = async (id) => {
    if (!window.confirm('Delete this sale record?')) return;
    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      showToast('Sale deleted');
      fetchData();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, true);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
  });

  const filteredTickets = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.issue?.toLowerCase().includes(q) || t.customer?.name?.toLowerCase().includes(q) || t.status?.toLowerCase().includes(q);
  });

  const filteredProducts = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q);
  });

  const filteredSales = sales.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.customer?.name?.toLowerCase().includes(q) || s.product?.name?.toLowerCase().includes(q) || s.status?.toLowerCase().includes(q);
  });

  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const activeEMI = sales.filter((s) => s.status === 'emi_active').length;

  const meta = TAB_META[activeTab];

  return (
    <div className="app">
      {/* Sidebar */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Droplets />
          </div>
          <div>
            <div className="sidebar-title">AquaGuru</div>
            <div className="sidebar-subtitle">CRM System</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                  setSearch('');
                }}
              >
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">AquaGuru CRM v1.0</div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={22} />
            </button>
            <div>
              <div className="topbar-title">{meta.title}</div>
              <div className="topbar-subtitle">{meta.subtitle}</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-stat">
              <Users size={16} />
              {customers.length} Customers
            </div>
            <div className="topbar-stat">
              <Clock size={16} />
              {openTickets} Open Tickets
            </div>
            <div className="topbar-stat">
              <DollarSign size={16} />
              Rs {totalRevenue.toLocaleString('en-IN')}
            </div>
          </div>
        </header>

        <main className="content">
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue"><Users /></div>
              <div>
                <div className="stat-value">{customers.length}</div>
                <div className="stat-label">Total Customers</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber"><Wrench /></div>
              <div>
                <div className="stat-value">{openTickets}</div>
                <div className="stat-label">Open Tickets</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon cyan"><Package /></div>
              <div>
                <div className="stat-value">{products.length}</div>
                <div className="stat-label">Products</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><TrendingUp /></div>
              <div>
                <div className="stat-value">{activeEMI}</div>
                <div className="stat-label">Active EMIs</div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-box">
              <Search />
              <input
                className="search-input"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {activeTab === 'customers' && (
              <button className="btn btn-primary" onClick={() => setShowAddCustomer(true)}>
                <Plus />
                Add Customer
              </button>
            )}
          </div>

          {/* Content per tab */}
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : activeTab === 'customers' ? (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>City</th>
                      <th>Notes</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 ? (
                      <tr><td colSpan={5}>
                        <div className="table-empty">
                          <Users />
                          No customers yet. Click "Add Customer" to get started.
                        </div>
                      </td></tr>
                    ) : filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{c.name}</td>
                        <td>
                          {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}><Mail size={13} style={{ color: 'var(--neutral-400)' }} />{c.email}</div>}
                          {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} style={{ color: 'var(--neutral-400)' }} />{c.phone}</div>}
                        </td>
                        <td>{c.city ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} style={{ color: 'var(--neutral-400)' }} />{c.city}</span> : '—'}</td>
                        <td style={{ maxWidth: 200, color: 'var(--neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '—'}</td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteCustomer(c.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'tickets' ? (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Issue</th>
                      <th>Product</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.length === 0 ? (
                      <tr><td colSpan={6}>
                        <div className="table-empty">
                          <Wrench />
                          No service tickets found.
                        </div>
                      </td></tr>
                    ) : filteredTickets.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{t.customer?.name || '—'}</td>
                        <td style={{ maxWidth: 240 }}>{t.issue}</td>
                        <td>{t.product?.name || '—'}</td>
                        <td>
                          <span className={`badge badge-${t.priority}`}>
                            <span className="badge-dot" />
                            {PRIORITY_LABELS[t.priority] || t.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${t.status}`}>
                            <span className="badge-dot" />
                            {STATUS_LABELS[t.status] || t.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteTicket(t.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'products' ? (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan={5}>
                        <div className="table-empty">
                          <Package />
                          No products in the catalog yet.
                        </div>
                      </td></tr>
                    ) : filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{p.name}</td>
                        <td>{p.category || '—'}</td>
                        <td style={{ fontWeight: 600 }}>Rs {Number(p.price || 0).toLocaleString('en-IN')}</td>
                        <td>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: (p.stock || 0) > 0 ? 'var(--success-50)' : 'var(--error-50)',
                            color: (p.stock || 0) > 0 ? 'var(--success-700)' : 'var(--error-700)',
                          }}>
                            {p.stock || 0} in stock
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteProduct(p.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'sales' ? (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>EMI</th>
                      <th>Status</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.length === 0 ? (
                      <tr><td colSpan={7}>
                        <div className="table-empty">
                          <ShoppingCart />
                          No sales recorded yet.
                        </div>
                      </td></tr>
                    ) : filteredSales.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{s.customer?.name || '—'}</td>
                        <td>{s.product?.name || '—'}</td>
                        <td>{s.quantity}</td>
                        <td style={{ fontWeight: 600 }}>Rs {Number(s.total_amount || 0).toLocaleString('en-IN')}</td>
                        <td>
                          {s.emi_months > 0 ? (
                            <span>{s.emi_months} mo / Rs {Number(s.emi_monthly || 0).toLocaleString('en-IN')}/mo</span>
                          ) : 'Full payment'}
                        </td>
                        <td>
                          <span className={`badge badge-${s.status}`}>
                            <span className="badge-dot" />
                            {SALE_STATUS_LABELS[s.status] || s.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteSale(s.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSubmit={handleAddCustomer}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <AlertCircle /> : <CheckCircle />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function AddCustomerModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', notes: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    await onSubmit(form);
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add New Customer</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Rajesh Kumar"
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="rajesh@email.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                className="form-input"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Street address"
              />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                className="form-input"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Mumbai"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Any additional notes about this customer..."
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
